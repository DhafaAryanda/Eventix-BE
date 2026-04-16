import { IsUUID, IsNotEmpty, IsString, IsInt, Min, Max } from 'class-validator';

export class ReserveTicketDto {
  @IsUUID('4')
  @IsNotEmpty()
  eventId: string;

  @IsUUID('4')
  @IsNotEmpty()
  ticketTypeId: string;

  // Session token dari hasil antrian (fase 4)
  @IsString()
  @IsNotEmpty()
  sessionToken: string;

  @IsInt()
  @Min(1)
  @Max(10)
  quantity: number;
}
