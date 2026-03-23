import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

const BASE_URL = 'https://d3e6htiiul5ek9.cloudfront.net/prod';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'es-AR,es;q=0.9',
  'Referer': 'https://www.preciosclaros.gob.ar/',
  'Origin': 'https://www.preciosclaros.gob.ar',
  'x-api-key': process.env.PRECIOS_CLAROS_API_KEY,
};

@Injectable()
export class PreciosClarosService {
  constructor(private http: HttpService) { }

  async buscarProductos(query: string, lat = -34.6037, lng = -58.3816) {
    const { data } = await firstValueFrom(
      this.http.get(`${BASE_URL}/productos`, {
        headers: HEADERS,
        params: { string: query, lat, lng, limit: 20, offset: 0 },
      })
    );
    console.log('Total productos:', data?.total, '| Primero:', JSON.stringify(data?.productos?.[0], null, 2));
    return data;
  }

  async buscarSucursales(lat = -34.6037, lng = -58.3816) {
    const { data } = await firstValueFrom(
      this.http.get(`${BASE_URL}/sucursales`, {
        headers: HEADERS,
        params: { lat, lng, limit: 30, offset: 0 },
      })
    );
    return data;
  }

  async buscarPrecios(productoId: string, lat = -34.6037, lng = -58.3816) {
    const sucursalesData = await this.buscarSucursales(lat, lng);
    const sucursales: any[] = sucursalesData.sucursales ?? [];
    if (!sucursales.length) return { sucursales: [] };

    const arraySucursales = sucursales.map((s: any) => s.id).join(',');

    const { data } = await firstValueFrom(
      this.http.get(`${BASE_URL}/producto`, {
        headers: HEADERS,
        params: { limit: 30, id_producto: productoId, array_sucursales: arraySucursales },
      })
    );

    // Filtrar solo las sucursales que tienen el producto
    const conProducto = (data?.sucursales ?? []).filter(
      (s: any) => !s.message
    );

    console.log('Con producto:', JSON.stringify(conProducto[0], null, 2));
    return { ...data, sucursales: conProducto };
  }
}