-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('MUSIC', 'SPORTS', 'ARTS', 'TECHNOLOGY', 'FOOD', 'BUSINESS', 'EDUCATION', 'ENTERTAINMENT', 'HEALTH', 'SOCIAL', 'OTHER');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "eventType" "EventType",
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "Event_eventType_idx" ON "Event"("eventType");
