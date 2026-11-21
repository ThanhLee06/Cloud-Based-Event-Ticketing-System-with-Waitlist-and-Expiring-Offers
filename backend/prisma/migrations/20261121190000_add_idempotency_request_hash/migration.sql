-- Store a stable SHA-256 fingerprint for each idempotent request.
ALTER TABLE "idempotency_records"
ADD COLUMN "request_hash" VARCHAR(64);

-- Preserve existing rows created before request fingerprinting was introduced.
UPDATE "idempotency_records"
SET "request_hash" = repeat('0', 64)
WHERE "request_hash" IS NULL;

ALTER TABLE "idempotency_records"
ALTER COLUMN "request_hash" SET NOT NULL;
