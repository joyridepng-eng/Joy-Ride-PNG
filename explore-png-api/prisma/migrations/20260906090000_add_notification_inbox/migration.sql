CREATE TYPE "NotificationAudience" AS ENUM ('ADMIN', 'DRIVER');

CREATE TYPE "NotificationEventType" AS ENUM ('RIDE_REQUESTED', 'RIDE_ASSIGNED');

CREATE TABLE "NotificationInboxItem" (
    "id" TEXT NOT NULL,
    "audience" "NotificationAudience" NOT NULL,
    "eventType" "NotificationEventType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "deduplicationKey" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "adminId" TEXT,
    "driverId" TEXT,
    "rideId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationInboxItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "NotificationInboxItem_recipient_check" CHECK (
      (
        "audience" = 'ADMIN' AND
        "adminId" IS NOT NULL AND
        "driverId" IS NULL
      ) OR (
        "audience" = 'DRIVER' AND
        "driverId" IS NOT NULL AND
        "adminId" IS NULL
      )
    )
);

CREATE UNIQUE INDEX "NotificationInboxItem_deduplicationKey_key"
ON "NotificationInboxItem"("deduplicationKey");

CREATE INDEX "NotificationInboxItem_adminId_isRead_createdAt_idx"
ON "NotificationInboxItem"("adminId", "isRead", "createdAt");

CREATE INDEX "NotificationInboxItem_driverId_isRead_createdAt_idx"
ON "NotificationInboxItem"("driverId", "isRead", "createdAt");

CREATE INDEX "NotificationInboxItem_rideId_eventType_idx"
ON "NotificationInboxItem"("rideId", "eventType");

ALTER TABLE "NotificationInboxItem"
ADD CONSTRAINT "NotificationInboxItem_adminId_fkey"
FOREIGN KEY ("adminId")
REFERENCES "AdminAccount"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "NotificationInboxItem"
ADD CONSTRAINT "NotificationInboxItem_driverId_fkey"
FOREIGN KEY ("driverId")
REFERENCES "Driver"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "NotificationInboxItem"
ADD CONSTRAINT "NotificationInboxItem_rideId_fkey"
FOREIGN KEY ("rideId")
REFERENCES "Ride"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;