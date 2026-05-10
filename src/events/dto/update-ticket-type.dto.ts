import {
  IsString,
  IsInt,
  Min,
  Max,
  IsOptional,
  MaxLength,
} from 'class-validator';

export class UpdateTicketTypeDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1000, { message: 'Harga minimal Rp1.000' })
  price?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  quota?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxPerUser?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
