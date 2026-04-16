import { IsUUID, IsNotEmpty } from 'class-validator';

export class JoinQueueDto {
  @IsUUID('4', { message: 'eventId harus berupa UUID yang valid' })
  @IsNotEmpty()
  eventId: string;
}
