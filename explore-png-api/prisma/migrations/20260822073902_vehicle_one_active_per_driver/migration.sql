/*
  Warnings:

  - A unique constraint covering the columns `[driverId]` on the table `Vehicle` will be added. If there are existing duplicate values, this will fail.
  - Made the column `driverId` on table `Vehicle` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "Vehicle" DROP CONSTRAINT "Vehicle_driverId_fkey";

-- AlterTable
ALTER TABLE "Vehicle" ALTER COLUMN "driverId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_one_active_per_driver_key" ON "Vehicle"("driverId") WHERE ("status" = 'ACTIVE');

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
