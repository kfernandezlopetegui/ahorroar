import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { SupabaseService } from '../supabase/supabase.service';

/**
 * Inflación personal: compara la evolución de la canasta del usuario
 * (los productos que eligió en "Mi canasta"; si está vacía se usa su
 * watchlist, con precios del price_history) contra el IPC oficial del
 * INDEC (API de series de tiempo de datos.gob.ar).
 */

// IPC Nacional, nivel general (índice, dic-2016 = 100)
const IPC_SERIES_ID = '148.3_INIVELNAL_DICI_M_26';
const SERIES_API = 'https://apis.datos.gob.ar/series/api/series';

export interface MonthPoint {
  periodo: string;        // "2026-03"
  variacion_pct: number;  // variación % vs mes anterior
  indice: number;         // índice acumulado, base 100 en el primer mes
}

@Injectable()
export class InflationService {
  private readonly logger = new Logger(InflationService.name);

  constructor(
    private readonly http: HttpService,
    private readonly supabase: SupabaseService,
  ) {}

  /** IPC oficial (INDEC) — variación mensual e índice re-basado a 100 */
  async getIpc(meses = 12): Promise<MonthPoint[]> {
    try {
      const { data } = await firstValueFrom(
        this.http.get(SERIES_API, {
          params: {
            ids: IPC_SERIES_ID,
            limit: meses + 1,
            sort: 'desc',
            format: 'json',
          },
          timeout: 8000,
        }),
      );

      // data.data = [[fecha, valor], ...] en orden desc
      const rows: [string, number][] = (data?.data ?? [])
        .filter((r: any[]) => r?.[1] != null)
        .reverse();

      if (rows.length < 2) return [];

      const base = rows[0][1];
      return rows.slice(1).map(([fecha, valor], i) => ({
        periodo: fecha.slice(0, 7),
        variacion_pct: this.round(((valor / rows[i][1]) - 1) * 100),
        indice: this.round((valor / base) * 100),
      }));
    } catch (err: any) {
      this.logger.warn(`IPC INDEC no disponible: ${err.message}`);
      return [];
    }
  }

  /** Inflación de la canasta personal del usuario vs IPC */
  async getPersonal(userId: string, meses = 6) {
    const [ipc, canasta] = await Promise.all([
      this.getIpc(meses),
      this.getCanasta(userId, meses),
    ]);

    return {
      canasta,
      ipc,
      productosSeguidos: canasta.eansIncluidos,
      mensaje: canasta.puntos.length < 2
        ? 'Todavía no hay historial suficiente: armá tu canasta con productos y usá el comparador para acumular precios.'
        : null,
    };
  }

  private async getCanasta(userId: string, meses: number) {
    // Primero la canasta elegida por el usuario; si está vacía, su watchlist
    const { data: basket, error: berr } = await this.supabase.client
      .from('basket_items')
      .select('ean')
      .eq('user_id', userId);
    if (berr) throw berr;

    let eans = (basket ?? []).map((b) => b.ean);

    if (!eans.length) {
      const { data: watch, error: werr } = await this.supabase.client
        .from('watchlist')
        .select('ean')
        .eq('user_id', userId)
        .eq('activa', true);
      if (werr) throw werr;
      eans = (watch ?? []).map((w) => w.ean);
    }

    if (!eans.length) return { puntos: [] as MonthPoint[], eansIncluidos: 0 };

    const desde = new Date();
    desde.setMonth(desde.getMonth() - meses);

    const { data: hist, error: herr } = await this.supabase.client
      .from('price_history')
      .select('ean, precio_lista, captured_at')
      .in('ean', eans)
      .gte('captured_at', desde.toISOString())
      .order('captured_at', { ascending: true })
      .limit(10000);
    if (herr) throw herr;

    // Precio promedio por EAN por mes
    const porMes = new Map<string, Map<string, { sum: number; n: number }>>();
    for (const row of hist ?? []) {
      if (row.precio_lista == null) continue;
      const periodo = String(row.captured_at).slice(0, 7);
      if (!porMes.has(periodo)) porMes.set(periodo, new Map());
      const mes = porMes.get(periodo)!;
      const acc = mes.get(row.ean) ?? { sum: 0, n: 0 };
      acc.sum += row.precio_lista;
      acc.n += 1;
      mes.set(row.ean, acc);
    }

    const periodos = [...porMes.keys()].sort();
    if (periodos.length < 2) {
      return { puntos: [] as MonthPoint[], eansIncluidos: eans.length };
    }

    // Índice encadenado: cada mes se compara con el anterior usando
    // solo los EANs presentes en ambos meses (canasta comparable)
    const puntos: MonthPoint[] = [];
    let indice = 100;

    for (let i = 1; i < periodos.length; i++) {
      const prev = porMes.get(periodos[i - 1])!;
      const curr = porMes.get(periodos[i])!;

      let sumPrev = 0;
      let sumCurr = 0;
      for (const [ean, acc] of curr) {
        const pAcc = prev.get(ean);
        if (!pAcc) continue;
        sumPrev += pAcc.sum / pAcc.n;
        sumCurr += acc.sum / acc.n;
      }

      if (sumPrev <= 0) continue;

      const variacion = ((sumCurr / sumPrev) - 1) * 100;
      indice = indice * (sumCurr / sumPrev);
      puntos.push({
        periodo: periodos[i],
        variacion_pct: this.round(variacion),
        indice: this.round(indice),
      });
    }

    return { puntos, eansIncluidos: eans.length };
  }

  private round(n: number): number {
    return Math.round(n * 100) / 100;
  }
}
