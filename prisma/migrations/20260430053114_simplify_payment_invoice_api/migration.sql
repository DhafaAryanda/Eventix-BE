/*
  Warnings:

  - You are about to drop the column `paymentMethod` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `ewalletChannel` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `ewalletCheckoutUrl` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `qrExpiresAt` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `qrString` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `vaBankCode` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `vaNumber` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `xenditPaymentId` on the `Payment` table. All the data in the column will be lost.
  - The `paymentMethod` column on the `Payment` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[xenditInvoiceId]` on the table `Payment` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Order" DROP COLUMN "paymentMethod";

-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "ewalletChannel",
DROP COLUMN "ewalletCheckoutUrl",
DROP COLUMN "qrExpiresAt",
DROP COLUMN "qrString",
DROP COLUMN "vaBankCode",
DROP COLUMN "vaNumber",
DROP COLUMN "xenditPaymentId",
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "invoiceUrl" TEXT,
ADD COLUMN     "paymentChannel" TEXT,
ADD COLUMN     "xenditInvoiceId" TEXT,
DROP COLUMN "paymentMethod",
ADD COLUMN     "paymentMethod" TEXT;

-- DropEnum
DROP TYPE "PaymentMethod";

-- CreateIndex
CREATE UNIQUE INDEX "Payment_xenditInvoiceId_key" ON "Payment"("xenditInvoiceId");

-- CreateIndex
CREATE INDEX "Payment_xenditInvoiceId_idx" ON "Payment"("xenditInvoiceId");
