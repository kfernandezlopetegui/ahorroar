import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export interface BasketItem {
  id: string;
  user_id: string;
  ean: string;
  producto_nombre: string;
  cantidad: number;
  created_at: string;
}

export interface BasketItemEvaluation {
  id: string;
  ean: string;
  producto_nombre: string;
  cantidad: number;
  conDatos: boolean;
  precioActual: number | null;
  precioAnterior: number | null;
  periodoActual: string | null;   // "2026-07"
  periodoAnterior: string | null; // "2026-04"
  variacionPct: number | null;
  variacionAbs: number | null;
}

export interface BasketEvaluation {
  meses: number;
  items: BasketItemEvaluation[];
  resumen: {
    totalActual: number;
    totalAnterior: number;
    variacionPct: number;
    variacionAbs: number;
    productosConDatos: number;
    productosTotal: number;
    periodoAnterior: string;
    periodoActual: string;
  } | null;
  mensaje: string | null;
}

@Injectable()
export class BasketService {
  constructor(private readonly supabase: SupabaseService) {}

  async getByUser(userId: string): Promise<BasketItem[]> {
    const { data, error } = await this.supabase.client
      .from('basket_items')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  async upsert(userId: string, dto: { ean: string; producto_nombre: string; cantidad?: number }): Promise<BasketItem> {
    const { data, error } = await this.supabase.client
      .from('basket_items')
      .upsert(
        {
          user_id: userId,
          ean: dto.ean,
          producto_nombre: dto.producto_nombre,
          cantidad: Math.min(Math.max(dto.cantidad ?? 1, 1), 99),
        },
        { onConflict: 'user_id,ean' },
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async remove(userId: string, id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('basket_items')
      .delete()
      .eq('user_id', userId)
      .eq('id', id);
    if (error) throw error;
  }

  /**
   * Evalúa cuánto aumentó la canasta del usuario en los últimos N meses.
   * Para cada producto compara el precio promedio del mes más viejo
   * disponible en la ventana contra el del mes más reciente
   * (datos de price_history, snapshots diarios de precios).
   */
  async evaluate(userId: string, meses = 3): Promise<BasketEvaluation> {
    const items = await this.getByUser(userId);
    if (!items.length) {
      return {
        meses,
        items: [],
        resumen: null,
        mensaje: 'Tu canasta está vacía: buscá productos y agregalos para medir cuánto aumenta tu compra.',
      };
    }

    const desde = new Date();
    desde.setMonth(desde.getMonth() - meses);

    const { data: hist, error } = await this.supabase.client
      .from('price_history')
      .select('ean, precio_lista, captured_at')
      .in('ean', items.map((i) => i.ean))
      .gte('captured_at', desde.toISOString())
      .order('captured_at', { ascending: true })
      .limit(10000);
    if (error) throw error;

    // Precio promedio por EAN por mes
    const porEan = new Map<string, Map<string, { sum: number; n: number }>>();
    for (const row of hist ?? []) {
      if (row.precio_lista == null) continue;
      const periodo = String(row.captured_at).slice(0, 7);
      if (!porEan.has(row.ean)) porEan.set(row.ean, new Map());
      const porMes = porEan.get(row.ean)!;
      const acc = porMes.get(periodo) ?? { sum: 0, n: 0 };
      acc.sum += row.precio_lista;
      acc.n += 1;
      porMes.set(periodo, acc);
    }

    const evaluados: BasketItemEvaluation[] = items.map((item) => {
      const porMes = porEan.get(item.ean);
      const periodos = porMes ? [...porMes.keys()].sort() : [];

      if (!porMes || periodos.length < 2) {
        // Con un solo mes de datos mostramos el precio actual sin variación
        const unico = periodos.length === 1 ? porMes!.get(periodos[0])! : null;
        return {
          id: item.id,
          ean: item.ean,
          producto_nombre: item.producto_nombre,
          cantidad: item.cantidad,
          conDatos: false,
          precioActual: unico ? this.round(unico.sum / unico.n) : null,
          precioAnterior: null,
          periodoActual: periodos[0] ?? null,
          periodoAnterior: null,
          variacionPct: null,
          variacionAbs: null,
        };
      }

      const primero = porMes.get(periodos[0])!;
      const ultimo = porMes.get(periodos[periodos.length - 1])!;
      const precioAnterior = primero.sum / primero.n;
      const precioActual = ultimo.sum / ultimo.n;

      return {
        id: item.id,
        ean: item.ean,
        producto_nombre: item.producto_nombre,
        cantidad: item.cantidad,
        conDatos: true,
        precioActual: this.round(precioActual),
        precioAnterior: this.round(precioAnterior),
        periodoActual: periodos[periodos.length - 1],
        periodoAnterior: periodos[0],
        variacionPct: precioAnterior > 0 ? this.round(((precioActual / precioAnterior) - 1) * 100) : null,
        variacionAbs: this.round(precioActual - precioAnterior),
      };
    });

    const comparables = evaluados.filter((e) => e.conDatos);
    let resumen: BasketEvaluation['resumen'] = null;

    if (comparables.length) {
      const totalActual = comparables.reduce((s, e) => s + e.precioActual! * e.cantidad, 0);
      const totalAnterior = comparables.reduce((s, e) => s + e.precioAnterior! * e.cantidad, 0);
      resumen = {
        totalActual: this.round(totalActual),
        totalAnterior: this.round(totalAnterior),
        variacionPct: totalAnterior > 0 ? this.round(((totalActual / totalAnterior) - 1) * 100) : 0,
        variacionAbs: this.round(totalActual - totalAnterior),
        productosConDatos: comparables.length,
        productosTotal: items.length,
        periodoAnterior: comparables.map((e) => e.periodoAnterior!).sort()[0],
        periodoActual: comparables.map((e) => e.periodoActual!).sort().reverse()[0],
      };
    }

    return {
      meses,
      items: evaluados,
      resumen,
      mensaje: resumen
        ? null
        : 'Todavía no hay historial de precios suficiente para tus productos: los snapshots se acumulan día a día, volvé a mirar en unos días.',
    };
  }

  private round(n: number): number {
    return Math.round(n * 100) / 100;
  }
}
