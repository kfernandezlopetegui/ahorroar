import { IsString, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateWatchlistDto {
  @IsString()
  ean: string;

  @IsString()
  producto_nombre: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  precio_objetivo: number;
}