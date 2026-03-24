import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { WatchlistService } from '../watchlist/watchlist.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PreciosClarosService } from '../precios-claros/precios-claros.service';

@Processor('price-check')
export class PriceCheckProcessor extends WorkerHost {
  private readonly logger = new Logger(PriceCheckProcessor.name);

  constructor(
    private readonly watchlist: WatchlistService,
    private readonly notifs: NotificationsService,
    private readonly precios: PreciosClarosService,
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

        const precios = sucursales
          .map((s: any) => s.preciosProducto?.precioLista)
          .filter((p: any): p is number => typeof p === 'number');

        if (!precios.length) continue;
        const minPrecio = Math.min(...precios);

        if (minPrecio <= item.precio_objetivo) {
          await this.notifs.sendToUser(
            item.user_id,
            '🎯 Precio objetivo alcanzado',
            `${item.producto_nombre} está a $${minPrecio.toLocaleString('es-AR')} ` +
              `(objetivo: $${item.precio_objetivo.toLocaleString('es-AR')})`,
            { ean: item.ean, tipo: 'price_alert' },
          );
        }
      } catch (err) {
        this.logger.error(`Error checking EAN ${item.ean}:`, err);
      }
    }
  }
}