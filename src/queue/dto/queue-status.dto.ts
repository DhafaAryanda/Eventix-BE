import { IsUUID, IsNotEmpty } from 'class-validator';

export class QueueStatusDto {
  @IsUUID('4', { message: 'eventId harus berupa UUID yang valid' })
  @IsNotEmpty()
  eventId: string;
}
