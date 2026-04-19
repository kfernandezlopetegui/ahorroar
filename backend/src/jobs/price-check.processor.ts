import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { WatchlistService } from '../watchlist/watchlist.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PreciosClarosService } from '../precios-claros/precios-claros.service';
import { SupabaseService } from '../supabase/supabase.service';

@Processor('price-check')
export class PriceCheckProcessor extends WorkerHost {
  private readonly logger = new Logger(PriceCheckProcessor.name);

  constructor(
    private readonly watchlist: WatchlistService,
    private readonly notifs: NotificationsService,
    private readonly precios: PreciosClarosService,
    private readonly supabase: SupabaseService,
  ) {
    super();
  }

  async process(_job: Job) {
    const items = await this.watchlist.getAllActive();
    this.logger.log(`Checking prices for ${items.length} watchlist items`);

    for (const item of items) {
      try {
        const result = await this.precios.buscarPorEAN(item.ean);
        const sucursales: any[] = (result as any).sucursales ?? [];
        if (!sucursales.length) continue;

        // ── Modo: alerta en cualquier promo ───────────────────────────────
        if (item.alert_on_promo) {
          const conPromo = sucursales.filter(
            (s: any) => s.preciosProducto?.promo1?.precio || s.preciosProducto?.promo2?.precio,
          );

          if (!conPromo.length) continue;

          // Evitar spam: no volver a notificar en menos de 24hs
          if (item.last_notified_at) {
            const hoursAgo = (Date.now() - new Date(item.last_notified_at).getTime()) / 3_600_000;
            if (hoursAgo < 24) continue;
          }

          // Armar descripción con las mejores promos encontradas
          const promoDescs = conPromo
            .slice(0, 3)
            .map((s: any) => {
              const promo = s.preciosProducto.promo1 ?? s.preciosProducto.promo2;
              return `${s.banderaDescripcion}: ${promo.descripcion} ($${Number(promo.precio).toLocaleString('es-AR')})`;
            })
            .join(' · ');

          await this.notifs.sendToUser(
            item.user_id,
            `🏷️ ¡Oferta! ${item.producto_nombre}`,
            promoDescs,
            { ean: item.ean, tipo: 'promo_alert' },
          );

          await this.supabase.client
            .from('watchlist')
            .update({ last_notified_at: new Date().toISOString() })
            .eq('id', item.id);

          continue;
        }

        // ── Modo: alerta por precio objetivo ──────────────────────────────
        if (item.precio_objetivo) {
          const listaPrecios = sucursales
            .map((s: any) => s.preciosProducto?.precioLista)
            .filter((p: any): p is number => typeof p === 'number' && p > 0);

          if (!listaPrecios.length) continue;
          const minPrecio = Math.min(...listaPrecios);

          if (minPrecio <= item.precio_objetivo) {
            if (item.last_notified_at) {
              const hoursAgo = (Date.now() - new Date(item.last_notified_at).getTime()) / 3_600_000;
              if (hoursAgo < 24) continue;
            }

            await this.notifs.sendToUser(
              item.user_id,
              '🎯 Precio objetivo alcanzado',
              `${item.producto_nombre} está a $${minPrecio.toLocaleString('es-AR')} ` +
                `(objetivo: $${item.precio_objetivo.toLocaleString('es-AR')})`,
              { ean: item.ean, tipo: 'price_alert' },
            );

            await this.supabase.client
              .from('watchlist')
              .update({
                last_known_price: minPrecio,
                last_notified_at: new Date().toISOString(),
              })
              .eq('id', item.id);
          } else {
            await this.supabase.client
              .from('watchlist')
              .update({ last_known_price: minPrecio })
              .eq('id', item.id);
          }
        }
      } catch (err) {
        this.logger.error(`Error checking EAN ${item.ean}:`, err);
      }
    }
  }
}