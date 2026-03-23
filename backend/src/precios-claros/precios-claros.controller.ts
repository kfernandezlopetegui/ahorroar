import { Controller, Get, Param, Query } from '@nestjs/common';
import { PreciosClarosService } from './precios-claros.service';

@Controller('precios-claros')
export class PreciosClarosController {
    constructor(private svc: PreciosClarosService) { }

    @Get('productos')
    buscarProductos(
        @Query('q') q: string,
        @Query('lat') lat?: string,
        @Query('lng') lng?: string,
    ) {
        return this.svc.buscarProductos(
            q,
            lat ? parseFloat(lat) : undefined,
            lng ? parseFloat(lng) : undefined,
        );
    }

    @Get('precios')
    buscarPrecios(
        @Query('id') id: string,
        @Query('lat') lat?: string,
        @Query('lng') lng?: string,
    ) {
        return this.svc.buscarPrecios(
            id,
            lat ? parseFloat(lat) : undefined,
            lng ? parseFloat(lng) : undefined,
        );
    }

    @Get('ean/:ean')
    buscarPorEAN(
        @Param('ean') ean: string,
        @Query('lat') lat?: string,
        @Query('lng') lng?: string,
    ) {
        return this.svc.buscarPorEAN(
            ean,
            lat ? parseFloat(lat) : undefined,
            lng ? parseFloat(lng) : undefined,
        );
    }

    @Get('historial/:ean')
    getHistorial(
        @Param('ean') ean: string,
        @Query('dias') dias?: string,
    ) {
        return this.svc.getHistorial(ean, dias ? parseInt(dias) : 30);
    }
}