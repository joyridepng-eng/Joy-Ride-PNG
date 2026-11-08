-- DRAFT ONLY: not registered with Prisma Migrate. Do not run on production.
-- Requires disposable PostgreSQL integration tests before promotion.
BEGIN;
CREATE TYPE "FeedbackReviewStatus" AS ENUM ('NEW', 'REVIEWED', 'FOLLOW_UP', 'CLOSED');
CREATE TYPE "EmergencyAlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');
CREATE TYPE "EmergencyAlertAction" AS ENUM ('CREATED', 'ACKNOWLEDGED', 'RESOLVED');

CREATE TABLE "RideFeedback" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "rideId" TEXT NOT NULL,
 "riderId" TEXT NOT NULL,
 "driverId" TEXT NOT NULL,
 "overallRating" INTEGER NOT NULL,
 "customerCareRating" INTEGER,
 "professionalismRating" INTEGER,
 "drivingRating" INTEGER,
 "cleanlinessRating" INTEGER,
 "comment" VARCHAR(1000),
 "reviewStatus" "FeedbackReviewStatus" NOT NULL DEFAULT 'NEW',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "RideFeedback_ratings_check" CHECK (
  "overallRating" BETWEEN 1 AND 5 AND
  ("customerCareRating" IS NULL OR "customerCareRating" BETWEEN 1 AND 5) AND
  ("professionalismRating" IS NULL OR "professionalismRating" BETWEEN 1 AND 5) AND
  ("drivingRating" IS NULL OR "drivingRating" BETWEEN 1 AND 5) AND
  ("cleanlinessRating" IS NULL OR "cleanlinessRating" BETWEEN 1 AND 5)),
 CONSTRAINT "RideFeedback_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "Ride"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "RideFeedback_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "RiderAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "RideFeedback_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RideFeedback_rideId_key" ON "RideFeedback"("rideId");
CREATE INDEX "RideFeedback_driverId_createdAt_idx" ON "RideFeedback"("driverId", "createdAt");
CREATE INDEX "RideFeedback_riderId_createdAt_idx" ON "RideFeedback"("riderId", "createdAt");
CREATE INDEX "RideFeedback_reviewStatus_createdAt_idx" ON "RideFeedback"("reviewStatus", "createdAt");

CREATE TABLE "FeedbackReviewEvent" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "feedbackId" TEXT NOT NULL,
 "adminId" TEXT NOT NULL,
 "previousStatus" "FeedbackReviewStatus" NOT NULL,
 "newStatus" "FeedbackReviewStatus" NOT NULL,
 "note" VARCHAR(1000),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "FeedbackReviewEvent_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "RideFeedback"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "FeedbackReviewEvent_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "AdminAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "FeedbackReviewEvent_feedbackId_createdAt_idx" ON "FeedbackReviewEvent"("feedbackId", "createdAt");

CREATE TABLE "DriverEmergencyAlert" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "clientRequestId" VARCHAR(64) NOT NULL,
 "driverId" TEXT NOT NULL,
 "rideId" TEXT,
 "status" "EmergencyAlertStatus" NOT NULL DEFAULT 'OPEN',
 "message" VARCHAR(500),
 "latitude" DOUBLE PRECISION,
 "longitude" DOUBLE PRECISION,
 "accuracyMeters" DOUBLE PRECISION,
 "locationRecordedAt" TIMESTAMP(3),
 "clientOccurredAt" TIMESTAMP(3),
 "acknowledgedAt" TIMESTAMP(3),
 "resolvedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "DriverEmergencyAlert_request_check" CHECK (length(btrim("clientRequestId")) > 0),
 CONSTRAINT "DriverEmergencyAlert_location_check" CHECK (
  ("latitude" IS NULL AND "longitude" IS NULL AND "accuracyMeters" IS NULL AND "locationRecordedAt" IS NULL)
  OR ("latitude" IS NOT NULL AND "longitude" IS NOT NULL AND "locationRecordedAt" IS NOT NULL
   AND "latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180
   AND ("accuracyMeters" IS NULL OR ("accuracyMeters" >= 0 AND "accuracyMeters" < 'Infinity'::float8)))),
 CONSTRAINT "DriverEmergencyAlert_status_check" CHECK (
  ("status" = 'OPEN' AND "acknowledgedAt" IS NULL AND "resolvedAt" IS NULL) OR
  ("status" = 'ACKNOWLEDGED' AND "acknowledgedAt" IS NOT NULL AND "resolvedAt" IS NULL) OR
  ("status" = 'RESOLVED' AND "acknowledgedAt" IS NOT NULL AND "resolvedAt" IS NOT NULL AND "resolvedAt" >= "acknowledgedAt")),
 CONSTRAINT "DriverEmergencyAlert_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "DriverEmergencyAlert_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "Ride"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DriverEmergencyAlert_driverId_clientRequestId_key" ON "DriverEmergencyAlert"("driverId", "clientRequestId");
CREATE INDEX "DriverEmergencyAlert_status_createdAt_idx" ON "DriverEmergencyAlert"("status", "createdAt");
CREATE INDEX "DriverEmergencyAlert_driverId_createdAt_idx" ON "DriverEmergencyAlert"("driverId", "createdAt");
CREATE INDEX "DriverEmergencyAlert_rideId_idx" ON "DriverEmergencyAlert"("rideId");

CREATE TABLE "EmergencyAlertEvent" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "alertId" TEXT NOT NULL,
 "action" "EmergencyAlertAction" NOT NULL,
 "adminId" TEXT,
 "note" VARCHAR(1000),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "EmergencyAlertEvent_actor_check" CHECK (
  ("action" = 'CREATED' AND "adminId" IS NULL) OR
  ("action" IN ('ACKNOWLEDGED', 'RESOLVED') AND "adminId" IS NOT NULL)),
 CONSTRAINT "EmergencyAlertEvent_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "DriverEmergencyAlert"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "EmergencyAlertEvent_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "AdminAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "EmergencyAlertEvent_alertId_action_key" ON "EmergencyAlertEvent"("alertId", "action");
CREATE INDEX "EmergencyAlertEvent_alertId_createdAt_idx" ON "EmergencyAlertEvent"("alertId", "createdAt");
-- Inbox integration is additive. The new enum value is used only after COMMIT.
ALTER TYPE "NotificationEventType" ADD VALUE 'DRIVER_EMERGENCY_ALERT';
ALTER TABLE "NotificationInboxItem" ADD COLUMN "emergencyAlertId" TEXT;
ALTER TABLE "NotificationInboxItem" ADD CONSTRAINT "NotificationInboxItem_emergencyAlertId_fkey"
 FOREIGN KEY ("emergencyAlertId") REFERENCES "DriverEmergencyAlert"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "NotificationInboxItem_emergencyAlertId_idx" ON "NotificationInboxItem"("emergencyAlertId");
COMMIT;
