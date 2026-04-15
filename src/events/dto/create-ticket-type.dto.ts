import {
  IsString,
  IsNotEmpty,
  IsInt,
  Min,
  Max,
  IsOptional,
  MaxLength,
} from 'class-validator';

export class CreateTicketTypeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsInt()
  @Min(1000, { message: 'Harga minimal Rp1.000' })
  price: number;

  @IsInt()
  @Min(1)
  @Max(100000)
  quota: number;

  @IsInt()
  @Min(1)
  @Max(10)
  maxPerUser: number;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsInt()
  @IsOptional()
  @Min(0)
  sortOrder?: number;
}
