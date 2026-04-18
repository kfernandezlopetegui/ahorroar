import { IsString, IsNumber, IsOptional, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateWatchlistDto {
  @IsString()
  ean: string;

  @IsString()
  producto_nombre: string;

  
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  precio_objetivo?: number;

 
  @IsOptional()
  @IsNumber()
  @Min(5)
  @Max(80)
  @Type(() => Number)
  discount_threshold?: number;
}