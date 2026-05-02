/*
  Warnings:

  - A unique constraint covering the columns `[eventId,name]` on the table `TicketType` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "TicketType_name_key";

-- CreateIndex
CREATE UNIQUE INDEX "TicketType_eventId_name_key" ON "TicketType"("eventId", "name");
