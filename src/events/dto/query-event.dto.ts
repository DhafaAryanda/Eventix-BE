import { EventStatus, EventType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export enum EventSortBy {
  NEWEST = 'NEWEST',
  NEAREST = 'NEAREST',
  LOWEST_PRICE = 'LOWEST_PRICE',
  HIGHEST_PRICE = 'HIGHEST_PRICE',
}

export class QueryEventDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;

  @IsOptional()
  @IsEnum(EventType)
  eventType?: EventType;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsEnum(EventSortBy)
  sortBy?: EventSortBy;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 12;
}
