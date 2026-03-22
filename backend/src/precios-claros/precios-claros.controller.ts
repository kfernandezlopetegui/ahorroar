import { Controller, Get, Query } from '@nestjs/common';
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
        console.log('Buscando:', q);
        return this.svc.buscarProductos(
            q,
            lat ? parseFloat(lat) : undefined,
            lng ? parseFloat(lng) : undefined,
        );
    }

    @Get('precios')
    async buscarPrecios(
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
}