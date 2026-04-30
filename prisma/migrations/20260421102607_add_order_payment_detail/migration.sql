/*
  Warnings:

  - You are about to drop the column `paymentUrl` on the `Payment` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[name]` on the table `TicketType` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `paymentMethod` to the `Payment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Payment` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('VA', 'QRIS', 'EWALLET');

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'WAITING_PAYMENT';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "paymentMethod" "PaymentMethod";

-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "paymentUrl",
ADD COLUMN     "ewalletChannel" TEXT,
ADD COLUMN     "ewalletCheckoutUrl" TEXT,
ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "paymentMethod" "PaymentMethod" NOT NULL,
ADD COLUMN     "qrExpiresAt" TIMESTAMP(3),
ADD COLUMN     "qrString" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "vaBankCode" TEXT,
ADD COLUMN     "vaNumber" TEXT,
ADD COLUMN     "xenditPaymentId" TEXT;

-- CreateIndex
CREATE INDEX "Order_expiresAt_idx" ON "Order"("expiresAt");

-- CreateIndex
CREATE INDEX "Payment_externalId_idx" ON "Payment"("externalId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TicketType_name_key" ON "TicketType"("name");
