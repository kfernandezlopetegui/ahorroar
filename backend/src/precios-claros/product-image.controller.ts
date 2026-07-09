import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ProductImageService } from './product-image.service';

@Controller('products')
export class ProductImageController {
  constructor(private readonly images: ProductImageService) {}

  /**
   * Proxy de imágenes de producto: evita el bloqueo de hotlinking/CORS de
   * imagenes.preciosclaros.gob.ar y el mixed content de URLs scrapeadas en
   * http://. 404 si ninguna fuente tiene imagen (el frontend muestra el
   * placeholder local).
   */
  @Get(':ean/image')
  async getImage(@Param('ean') ean: string, @Res() res: Response) {
    const image = await this.images.getImage(ean);
    if (!image) {
      throw new NotFoundException(`Sin imagen para el EAN ${ean}`);
    }

    res.setHeader('Content-Type', image.contentType);
    res.setHeader(
      'Cache-Control',
      'public, max-age=86400, stale-while-revalidate=604800',
    );
    res.send(image.buffer);
  }
}
