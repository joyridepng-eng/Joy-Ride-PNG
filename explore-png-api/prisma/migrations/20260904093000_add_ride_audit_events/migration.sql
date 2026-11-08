ALTER TABLE "Ride"
  ADD COLUMN "quotedDistanceMeters" INTEGER,
  ADD COLUMN "quotedDurationSeconds" INTEGER,
  ADD COLUMN "farePolicyVersion" TEXT;
CREATE TYPE "RideAuditEventType" AS ENUM (
  'RIDE_REQUESTED',
  'DRIVER_ASSIGNED',
  'STATUS_CHANGED',
  'SETTLEMENT_CREATED',
  'SETTLEMENT_PAID',
  'HISTORICAL_IMPORT'
);

CREATE TYPE "RideAuditActorType" AS ENUM (
  'RIDER',
  'DRIVER',
  'ADMIN',
  'SYSTEM'
);

CREATE TABLE "RideAuditEvent" (
  "id" TEXT NOT NULL,
  "rideId" TEXT NOT NULL,
  "eventType" "RideAuditEventType" NOT NULL,
  "previousStatus" "RideStatus",
  "newStatus" "RideStatus",
  "driverId" TEXT,
  "vehicleId" TEXT,
  "actorType" "RideAuditActorType" NOT NULL,
  "actorId" TEXT,
  "notes" TEXT,
  "metadata" JSONB,
  "isApproximate" BOOLEAN NOT NULL DEFAULT false,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RideAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RideAuditEvent_rideId_occurredAt_idx"
  ON "RideAuditEvent"("rideId", "occurredAt");

CREATE INDEX "RideAuditEvent_driverId_occurredAt_idx"
  ON "RideAuditEvent"("driverId", "occurredAt");

CREATE INDEX "RideAuditEvent_eventType_occurredAt_idx"
  ON "RideAuditEvent"("eventType", "occurredAt");

CREATE INDEX "RideAuditEvent_occurredAt_idx"
  ON "RideAuditEvent"("occurredAt");

ALTER TABLE "RideAuditEvent"
  ADD CONSTRAINT "RideAuditEvent_rideId_fkey"
  FOREIGN KEY ("rideId")
  REFERENCES "Ride"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
-- Existing rides predate the audit ledger. Their original request time is
-- known, but later lifecycle timestamps cannot be reconstructed exactly.
INSERT INTO "RideAuditEvent" (
  "id",
  "rideId",
  "eventType",
  "newStatus",
  "driverId",
  "vehicleId",
  "actorType",
  "notes",
  "isApproximate",
  "occurredAt",
  "createdAt"
)
SELECT
  'audit-request-' || md5("id"),
  "id",
  'RIDE_REQUESTED',
  'REQUESTED',
  NULL,
  NULL,
  'SYSTEM',
  'Historical request imported when the audit ledger was introduced.',
  true,
  "requestedAt",
  CURRENT_TIMESTAMP
FROM "Ride"
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "RideAuditEvent" (
  "id",
  "rideId",
  "eventType",
  "newStatus",
  "driverId",
  "vehicleId",
  "actorType",
  "notes",
  "isApproximate",
  "occurredAt",
  "createdAt"
)
SELECT
  'audit-state-' || md5("id"),
  "id",
  'HISTORICAL_IMPORT',
  "status",
  "driverId",
  "vehicleId",
  'SYSTEM',
  'Historical state imported; occurredAt is based on the last Ride update.',
  true,
  "updatedAt",
  CURRENT_TIMESTAMP
FROM "Ride"
WHERE "status" <> 'REQUESTED'
ON CONFLICT ("id") DO NOTHING;
