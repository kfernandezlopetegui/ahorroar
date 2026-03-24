import { IsString, IsNumber, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateReportDto {
  @IsString()
  ean: string;

  @IsString()
  producto_nombre: string;

  @IsString()
  cadena: string;

  @IsOptional()
  @IsString()
  sucursal?: string;

  @IsOptional()
  @IsString()
  direccion?: string;

  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  precio: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  lat?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  lng?: number;
}