-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "isAuthActive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "passwordHash" TEXT,
ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Ride" ADD COLUMN     "riderId" TEXT;

-- CreateTable
CREATE TABLE "RiderAccount" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiderAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RiderAccount_phone_key" ON "RiderAccount"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "RiderAccount_email_key" ON "RiderAccount"("email");

-- CreateIndex
CREATE INDEX "Ride_riderId_requestedAt_idx" ON "Ride"("riderId", "requestedAt");

-- AddForeignKey
ALTER TABLE "Ride" ADD CONSTRAINT "Ride_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "RiderAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
