import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsOptional,
  MinLength,
  MaxLength,
  IsUrl,
  IsEnum,
  IsArray,
} from 'class-validator';
import { EventType } from '@prisma/client';

export class CreateEventDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  @MaxLength(200)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  description: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  venue: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city: string;

  @IsDateString({}, { message: 'Format tanggal tidak valid (ISO 8601)' })
  eventDate: string;

  @IsDateString()
  saleOpenAt: string;

  @IsDateString()
  @IsOptional()
  saleCloseAt?: string;

  @IsUrl({}, { message: 'Format URL banner tidak valid' })
  @IsOptional()
  bannerUrl?: string;

  @IsEnum(EventType)
  @IsOptional()
  eventType?: EventType;

  @IsArray()
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  @IsOptional()
  tags?: string[];
}
