import { IsString, IsNumber, IsOptional, IsBoolean, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateWatchlistDto {
  @IsString()
  ean: string;

  @IsString()
  producto_nombre: string;

  // Alerta cuando aparece CUALQUIER promo (2x1, %, etc.)
  @IsOptional()
  @IsBoolean()
  alert_on_promo?: boolean;

  // Alerta si el precio baja de este monto
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  precio_objetivo?: number;
}