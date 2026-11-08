/*
  Warnings:

  - You are about to drop the column `fareEstimate` on the `Ride` table. All the data in the column will be lost.
  - You are about to drop the column `passengerName` on the `Ride` table. All the data in the column will be lost.
  - You are about to drop the column `passengerPhone` on the `Ride` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Ride" DROP COLUMN "fareEstimate",
DROP COLUMN "passengerName",
DROP COLUMN "passengerPhone";
