-- CreateEnum
CREATE TYPE "RideSettlementStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');

-- CreateTable
CREATE TABLE "RideSettlement" (
    "id" TEXT NOT NULL,
    "rideId" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "driverId" TEXT,
    "vehicleId" TEXT,
    "finalFare" DECIMAL(10,2) NOT NULL,
    "driverShare" DECIMAL(10,2) NOT NULL,
    "companyShare" DECIMAL(10,2) NOT NULL,
    "driverSharePercent" DECIMAL(5,2) NOT NULL DEFAULT 80.00,
    "companySharePercent" DECIMAL(5,2) NOT NULL DEFAULT 20.00,
    "status" "RideSettlementStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RideSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RideSettlement_rideId_key" ON "RideSettlement"("rideId");

-- CreateIndex
CREATE UNIQUE INDEX "RideSettlement_receiptNumber_key" ON "RideSettlement"("receiptNumber");

-- AddForeignKey
ALTER TABLE "RideSettlement" ADD CONSTRAINT "RideSettlement_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "Ride"("id") ON DELETE CASCADE ON UPDATE CASCADE;
