import { Event, TicketType } from '@prisma/client';

// Type untuk event lengkap dengan ticket types
// Dipakai sebagai return type di service & cache
export type EventWithTicketTypes = Event & {
  ticketTypes: TicketType[];
  creator: {
    id: string;
    name: string;
  };
};

// Type untuk response list (tidak semua field ditampilkan)
export type EventListItem = Pick<
  Event,
  | 'id'
  | 'title'
  | 'venue'
  | 'city'
  | 'eventDate'
  | 'saleOpenAt'
  | 'saleCloseAt'
  | 'status'
  | 'bannerUrl'
  | 'eventType'
  | 'tags'
> & {
  ticketTypes: Pick<TicketType, 'id' | 'name' | 'price' | 'quota'>[];
  lowestPrice: number; // harga tiket termurah, computed
};
