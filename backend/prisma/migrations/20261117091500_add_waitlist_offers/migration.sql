-- CreateEnum
CREATE TYPE "waitlist_status" AS ENUM ('WAITING', 'OFFERED', 'FULFILLED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "offer_status" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED');

-- CreateTable
CREATE TABLE "waitlist_entries" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "sequence_no" INTEGER NOT NULL,
    "status" "waitlist_status" NOT NULL DEFAULT 'WAITING',
    "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offers" (
    "id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "waitlist_entry_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "offer_status" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMPTZ(3),

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "waitlist_entries_event_id_status_sequence_no_idx" ON "waitlist_entries"("event_id", "status", "sequence_no");

-- CreateIndex
CREATE UNIQUE INDEX "waitlist_entries_event_id_sequence_no_key" ON "waitlist_entries"("event_id", "sequence_no");

-- CreateIndex
CREATE UNIQUE INDEX "offers_reservation_id_key" ON "offers"("reservation_id");

-- CreateIndex
CREATE UNIQUE INDEX "offers_waitlist_entry_id_key" ON "offers"("waitlist_entry_id");

-- CreateIndex
CREATE INDEX "offers_status_expires_at_idx" ON "offers"("status", "expires_at");

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_waitlist_entry_id_fkey" FOREIGN KEY ("waitlist_entry_id") REFERENCES "waitlist_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Partial Unique Index: một user chỉ giữ tối đa 1 chỗ active (WAITING | OFFERED) trên cùng 1 sự kiện
CREATE UNIQUE INDEX "waitlist_entries_active_user_event_key"
ON "waitlist_entries" ("user_id", "event_id")
WHERE "status" IN ('WAITING', 'OFFERED');

-- Additional Integrity Checks
ALTER TABLE "waitlist_entries"
  ADD CONSTRAINT "waitlist_entries_sequence_no_check" CHECK ("sequence_no" >= 1);

ALTER TABLE "offers"
  ADD CONSTRAINT "offers_expires_after_created_check" CHECK ("expires_at" > "created_at");

ALTER TABLE "offers"
  ADD CONSTRAINT "offers_accepted_at_consistency_check"
  CHECK (("status" = 'ACCEPTED' AND "accepted_at" IS NOT NULL) OR ("status" <> 'ACCEPTED' AND "accepted_at" IS NULL));
