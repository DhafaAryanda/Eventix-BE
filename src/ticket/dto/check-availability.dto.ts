import { IsUUID, IsNotEmpty } from 'class-validator';

export class CheckAvailabilityDto {
  @IsUUID('4')
  @IsNotEmpty()
  eventId: string;
}
