import { Injectable, signal, computed } from '@angular/core';
import { PCProducto, PCPrecio } from './precios-claros';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ListaItem {
  producto: PCProducto;
  cantidad: number;
}

export interface ResultadoOptimizacion {
  cadena: string;
  total: number;
  items: {
    productoId: string;
    nombre: string;
    precio: number;
    direccion: string;
    sucursalNombre: string;
  }[];
  itemsNoDisponibles: string[];
}

const BASE = `${environment.apiUrl}/precios-claros`;

@Injectable({ providedIn: 'root' })
export class ListaService {
  items         = signal<ListaItem[]>([]);
  resultado     = signal<ResultadoOptimizacion[]>([]);
  calculando    = signal(false);
  errorCalculo  = signal('');

  totalItems = computed(() => this.items().reduce((acc, i) => acc + i.cantidad, 0));

  constructor(private readonly http: HttpClient) {}

  agregarItem(producto: PCProducto) {
    this.items.update(lista => {
      const idx = lista.findIndex(i => i.producto.id === producto.id);
      if (idx >= 0) {
        const nueva = [...lista];
        nueva[idx] = { ...nueva[idx], cantidad: nueva[idx].cantidad + 1 };
        return nueva;
      }
      return [...lista, { producto, cantidad: 1 }];
    });
    this.resultado.set([]);
  }

  removerItem(productoId: string) {
    this.items.update(lista => lista.filter(i => i.producto.id !== productoId));
    this.resultado.set([]);
  }

  cambiarCantidad(productoId: string, cantidad: number) {
    if (cantidad < 1) { this.removerItem(productoId); return; }
    this.items.update(lista =>
      lista.map(i => i.producto.id === productoId ? { ...i, cantidad } : i)
    );
    this.resultado.set([]);
  }

  limpiar() {
    this.items.set([]);
    this.resultado.set([]);
  }

  async calcularMejorSuper(lat?: number, lng?: number) {
    const lista = this.items();
    if (!lista.length) return;
    this.calculando.set(true);
    this.errorCalculo.set('');
    this.resultado.set([]);

    try {
      // 1. Buscar precios de todos los productos en paralelo
      const preciosPorProducto = await Promise.all(
        lista.map(async ({ producto }) => {
          const params: Record<string, any> = { id: producto.id };
          if (lat != null) params['lat'] = lat;
          if (lng != null) params['lng'] = lng;

          const res = await firstValueFrom(
            this.http.get<{ sucursales: PCPrecio[] }>(`${BASE}/precios`, { params })
          );
          return { producto, sucursales: res.sucursales ?? [] };
        })
      );

      // 2. Agrupar por cadena (banderaDescripcion)
      const cadenas = new Map<string, ResultadoOptimizacion>();

      for (const { producto, sucursales } of preciosPorProducto) {
        const item = lista.find(i => i.producto.id === producto.id)!;

        for (const suc of sucursales) {
          const cadena = suc.banderaDescripcion;
          if (!cadenas.has(cadena)) {
            cadenas.set(cadena, {
              cadena,
              total: 0,
              items: [],
              itemsNoDisponibles: [],
            });
          }
          const entry = cadenas.get(cadena)!;
          const precio = suc.preciosProducto?.precioLista ?? 0;

          // Solo agregar si no está ya para este producto
          const yaAgregado = entry.items.some(i => i.productoId === producto.id);
          if (!yaAgregado && precio > 0) {
            entry.total += precio * item.cantidad;
            entry.items.push({
              productoId: producto.id,
              nombre: producto.nombre,
              precio,
              direccion: suc.direccion,
              sucursalNombre: suc.sucursalNombre,
            });
          }
        }
      }

      // 3. Marcar ítems no disponibles en cada cadena
      for (const [, entry] of cadenas) {
        for (const { producto } of preciosPorProducto) {
          if (!entry.items.some(i => i.productoId === producto.id)) {
            entry.itemsNoDisponibles.push(producto.nombre);
          }
        }
      }

      // 4. Ordenar: primero las cadenas con todos los ítems, luego por precio total
      const ordenado = Array.from(cadenas.values()).sort((a, b) => {
        const completoA = a.itemsNoDisponibles.length === 0 ? 0 : 1;
        const completoB = b.itemsNoDisponibles.length === 0 ? 0 : 1;
        if (completoA !== completoB) return completoA - completoB;
        return a.total - b.total;
      });

      this.resultado.set(ordenado);
    } catch {
      this.errorCalculo.set('No se pudo calcular. Verificá tu conexión.');
    } finally {
      this.calculando.set(false);
    }
  }
}