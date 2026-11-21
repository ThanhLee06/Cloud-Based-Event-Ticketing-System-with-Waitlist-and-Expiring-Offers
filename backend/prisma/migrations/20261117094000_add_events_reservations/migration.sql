-- CreateEnum
CREATE TYPE "reservation_source" AS ENUM ('DIRECT', 'WAITLIST_OFFER');

-- CreateEnum
CREATE TYPE "reservation_status" AS ENUM ('HOLD', 'CONFIRMED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(180) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "description" TEXT NOT NULL,
    "venue" VARCHAR(255) NOT NULL,
    "address" VARCHAR(500) NOT NULL,
    "city" VARCHAR(100) NOT NULL,
    "poster" VARCHAR(500) NOT NULL,
    "price_vnd" INTEGER NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "sales_close_at" TIMESTAMPTZ(3) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "reserved_count" INTEGER NOT NULL DEFAULT 0,
    "sold_count" INTEGER NOT NULL DEFAULT 0,
    "organizer_id" UUID NOT NULL,
    "next_waitlist_seq" INTEGER NOT NULL DEFAULT 1,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "source" "reservation_source" NOT NULL DEFAULT 'DIRECT',
    "status" "reservation_status" NOT NULL DEFAULT 'HOLD',
    "price_vnd" INTEGER NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "ticket_code" VARCHAR(64),
    "receipt_content" JSONB,
    "confirmed_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "request_id" VARCHAR(128) NOT NULL,
    "user_id" UUID NOT NULL,
    "endpoint" VARCHAR(120) NOT NULL,
    "response_status" INTEGER NOT NULL,
    "response_body" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("request_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "events_slug_key" ON "events"("slug");

-- CreateIndex
CREATE INDEX "events_city_idx" ON "events"("city");

-- CreateIndex
CREATE INDEX "events_category_idx" ON "events"("category");

-- CreateIndex
CREATE INDEX "events_organizer_id_idx" ON "events"("organizer_id");

-- CreateIndex
CREATE INDEX "events_featured_starts_at_idx" ON "events"("featured" DESC, "starts_at" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "reservations_ticket_code_key" ON "reservations"("ticket_code");

-- CreateIndex
CREATE INDEX "reservations_status_expires_at_idx" ON "reservations"("status", "expires_at");

-- CreateIndex
CREATE INDEX "reservations_user_id_status_idx" ON "reservations"("user_id", "status");

-- CreateIndex
CREATE INDEX "reservations_event_id_idx" ON "reservations"("event_id");

-- CreateIndex
CREATE INDEX "idempotency_records_user_id_created_at_idx" ON "idempotency_records"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "idempotency_records_created_at_idx" ON "idempotency_records"("created_at");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ST-015: Partial Unique Index — mỗi user chỉ có tối đa 1 đơn active (HOLD hoặc CONFIRMED) trên mỗi sự kiện
CREATE UNIQUE INDEX "reservations_active_user_event_key"
ON "reservations" ("user_id", "event_id")
WHERE "status" IN ('HOLD', 'CONFIRMED');

-- ST-008: Ràng buộc sức chứa, giá vé và bộ đếm thứ tự hàng chờ trên events
ALTER TABLE "events"
ADD CONSTRAINT "events_capacity_positive_check" CHECK ("capacity" > 0),
ADD CONSTRAINT "events_sold_count_non_negative_check" CHECK ("sold_count" >= 0),
ADD CONSTRAINT "events_reserved_count_non_negative_check" CHECK ("reserved_count" >= 0),
ADD CONSTRAINT "events_allocation_within_capacity_check" CHECK (("sold_count" + "reserved_count") <= "capacity"),
ADD CONSTRAINT "events_price_non_negative_check" CHECK ("price_vnd" >= 0),
ADD CONSTRAINT "events_next_waitlist_seq_positive_check" CHECK ("next_waitlist_seq" >= 1);

-- ST-015: Ràng buộc toàn vẹn giá vé & mốc thời gian trạng thái trên reservations
ALTER TABLE "reservations"
ADD CONSTRAINT "reservations_price_non_negative_check" CHECK ("price_vnd" >= 0),
ADD CONSTRAINT "reservations_confirmed_at_consistency_check" CHECK ("status" <> 'CONFIRMED' OR "confirmed_at" IS NOT NULL),
ADD CONSTRAINT "reservations_cancelled_at_consistency_check" CHECK ("status" <> 'CANCELLED' OR "cancelled_at" IS NOT NULL);
