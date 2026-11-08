-- Additive: existing alert coordinates, notes and migration history are preserved.
-- NULL means origin was not recorded; do not infer GPS for legacy alerts.
CREATE TYPE "EmergencyLocationSource" AS ENUM ('GPS', 'MANUAL_PIN');

ALTER TABLE "DriverEmergencyAlert"
  ADD COLUMN "locationSource" "EmergencyLocationSource";

ALTER TABLE "DriverEmergencyAlert"
  ADD CONSTRAINT "DriverEmergencyAlert_source_requires_location_check"
  CHECK ("locationSource" IS NULL OR
    ("latitude" IS NOT NULL AND "longitude" IS NOT NULL AND "locationRecordedAt" IS NOT NULL)),
  ADD CONSTRAINT "DriverEmergencyAlert_manual_accuracy_check"
  CHECK ("locationSource" IS DISTINCT FROM 'MANUAL_PIN'::"EmergencyLocationSource" OR "accuracyMeters" IS NULL);
