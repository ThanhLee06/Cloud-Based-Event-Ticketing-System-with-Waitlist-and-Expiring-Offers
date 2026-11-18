import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { OfferStatus, PrismaClient, ReservationSource, ReservationStatus, WaitlistStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

interface HttpResult<T = Record<string, unknown>> {
  status: number;
  body: T;
}

function resolveIsolatedTestDb(): { adminDbUrl: string; testDbName: string; testDbUrl: string } {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run E2E DB tests in production mode.');
  }
  const envUrl = process.env.TEST_DATABASE_URL?.trim();
  const baseUrl =
    envUrl ||
    fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf8').match(/^DATABASE_URL=(.+)$/m)![1].trim().replace(/^["']|["']$/g, '');
  const parsed = new URL(baseUrl);
  if (!new Set(['localhost', '127.0.0.1', '::1']).has(parsed.hostname) && process.env.ALLOW_REMOTE_TEST_DB !== 'true') {
    throw new Error(`Refusing E2E test against non-local host "${parsed.hostname}".`);
  }
  const testDbName = `eventflow_st022_028_test_${process.pid}_${Date.now()}`;
  const testUrl = new URL(parsed.toString());
  testUrl.pathname = `/${testDbName}`;
  return { adminDbUrl: parsed.toString(), testDbName, testDbUrl: testUrl.toString() };
}

async function reqJson<T = Record<string, unknown>>(
  base: string,
  method: string,
  route: string,
  token?: string,
  payload?: unknown,
  extraHeaders?: Record<string, string>
): Promise<HttpResult<T>> {
  const headers: Record<string, string> = { ...extraHeaders };
  if (payload !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${route}`, {
    method,
    headers,
    body: payload !== undefined ? JSON.stringify(payload) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : {}) as T };
}

async function seedEvent(prisma: PrismaClient, organizerId: string, slug: string, capacity = 20, sold = capacity) {
  const now = Date.now();
  return prisma.event.create({
    data: {
      slug,
      title: `Event ${slug}`,
      category: 'CONCERT',
      description: 'Core E2E test event',
      venue: 'Main Hall',
      address: '01 Test St',
      city: 'TP. Hồ Chí Minh',
      poster: 'https://example.com/poster.jpg',
      priceVnd: 200000,
      startsAt: new Date(now + 7 * 86400_000),
      salesCloseAt: new Date(now + 6 * 86400_000),
      capacity,
      soldCount: sold,
      reservedCount: 0,
      nextWaitlistSeq: 1,
      organizerId,
    },
  });
}

async function seedOfferForUser(
  prisma: PrismaClient,
  organizerId: string,
  slugPrefix: string,
  userId: string,
  expired = false
) {
  const now = Date.now();
  const createdAt = new Date(now - (expired ? 10 : 1) * 60_000);
  const expiresAt = new Date(now + (expired ? -5 : 5) * 60_000);
  const event = await prisma.event.create({
    data: {
      slug: `${slugPrefix}-${now}-${Math.floor(Math.random() * 10000)}`,
      title: `Event ${slugPrefix}`,
      category: 'CONCERT',
      description: 'Offer test event',
      venue: 'Grand Hall',
      address: '123 Test St',
      city: 'TP. Hồ Chí Minh',
      poster: 'https://example.com/poster.jpg',
      priceVnd: 200000,
      startsAt: new Date(now + 7 * 86400_000),
      salesCloseAt: new Date(now + 6 * 86400_000),
      capacity: 10,
      soldCount: 9,
      reservedCount: 1,
      nextWaitlistSeq: 2,
      organizerId,
    },
  });
  const entry = await prisma.waitlistEntry.create({
    data: { eventId: event.id, userId, sequenceNo: 1, status: WaitlistStatus.OFFERED, joinedAt: createdAt },
  });
  const reservation = await prisma.reservation.create({
    data: {
      eventId: event.id,
      userId,
      source: ReservationSource.WAITLIST_OFFER,
      status: ReservationStatus.HOLD,
      priceVnd: 200000,
      createdAt,
      expiresAt,
    },
  });
  const offer = await prisma.offer.create({
    data: {
      reservationId: reservation.id,
      waitlistEntryId: entry.id,
      eventId: event.id,
      userId,
      status: OfferStatus.PENDING,
      createdAt,
      expiresAt,
    },
  });
  return { event, entry, reservation, offer };
}

async function seedDirectHold(
  prisma: PrismaClient,
  organizerId: string,
  slugPrefix: string,
  userId: string,
  expired = true
) {
  const now = Date.now();
  const createdAt = new Date(now - 10 * 60_000);
  const expiresAt = new Date(now + (expired ? -5 : 5) * 60_000);
  const event = await prisma.event.create({
    data: {
      slug: `${slugPrefix}-${now}-${Math.floor(Math.random() * 10000)}`,
      title: `Event ${slugPrefix}`,
      category: 'CONCERT',
      description: 'Direct hold test',
      venue: 'Grand Hall',
      address: '123 Test St',
      city: 'TP. Hồ Chí Minh',
      poster: 'https://example.com/poster.jpg',
      priceVnd: 200000,
      startsAt: new Date(now + 7 * 86400_000),
      salesCloseAt: new Date(now + 6 * 86400_000),
      capacity: 10,
      soldCount: 9,
      reservedCount: 1,
      nextWaitlistSeq: 1,
      organizerId,
    },
  });
  const reservation = await prisma.reservation.create({
    data: {
      eventId: event.id,
      userId,
      source: ReservationSource.DIRECT,
      status: ReservationStatus.HOLD,
      priceVnd: 200000,
      createdAt,
      expiresAt,
    },
  });
  return { event, reservation };
}

async function main(): Promise<void> {
  const { adminDbUrl, testDbName, testDbUrl } = resolveIsolatedTestDb();
  process.env.DATABASE_URL = testDbUrl;
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'st022-028-isolated-test-jwt-secret-key';
  process.env.AUTH_LOGIN_RATE_LIMIT = '1000';
  process.env.PORT = '0';

  const adminPrisma = new PrismaClient({ datasources: { db: { url: adminDbUrl } } });
  let dbCreated = false;
  let prismaClient: PrismaClient | undefined;
  let app: NestExpressApplication | undefined;
  const passed: Array<{ st: string; id: string; detail: string }> = [];
  const record = (st: string, id: string, detail: string) => passed.push({ st, id, detail });

  try {
    await adminPrisma.$executeRawUnsafe(`CREATE DATABASE "${testDbName}"`);
    dbCreated = true;
    execSync('pnpm exec prisma migrate deploy', {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, DATABASE_URL: testDbUrl },
      stdio: 'pipe',
    });
    const { AppModule } = await import('../src/app.module');
    app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    const addr = app.getHttpServer().address();
    const api = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 4000}/api`;
    const prisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });
    prismaClient = prisma;
    const password = 'TestPassword@123';
    const passwordHash = await bcrypt.hash(password, 6);
    const organizer = await prisma.user.create({
      data: { name: 'Organizer', email: 'org@test.local', passwordHash, role: 'ORGANIZER', emailVerifiedAt: new Date() },
    });
    await prisma.user.createMany({
      data: Array.from({ length: 75 }, (_, i) => ({
        name: `Student ${String(i + 1).padStart(3, '0')}`,
        email: `student${String(i + 1).padStart(3, '0')}@test.local`,
        passwordHash,
        role: 'CUSTOMER' as const,
        // Từ khi có OTP (ST-002), tài khoản chưa xác thực email không đăng nhập được.
        emailVerifiedAt: new Date(),
      })),
    });
    const users = await prisma.user.findMany({ where: { role: 'CUSTOMER' }, orderBy: { email: 'asc' } });
    const tokens: string[] = [];
    for (let i = 0; i < users.length; i += 25) {
      const batch = await Promise.all(
        users.slice(i, i + 25).map(async (u) => {
          const r = await reqJson<{ accessToken: string }>(api, 'POST', '/auth/login', undefined, { email: u.email, password });
          assert.equal(r.status, 200);
          return r.body.accessToken;
        })
      );
      tokens.push(...batch);
    }
    const dummyId = '550e8400-e29b-41d4-a716-446655440000';
    // ST-023: Tham gia hàng chờ FIFO
    const evAvail = await seedEvent(prisma, organizer.id, 'st23-avail', 10, 9);
    assert.equal((await reqJson(api, 'POST', '/waitlist', undefined, { eventId: dummyId })).status, 401);
    assert.equal((await reqJson(api, 'POST', '/waitlist', tokens[0], { eventId: 'bad-uuid' })).status, 400);
    assert.equal((await reqJson(api, 'POST', '/waitlist', tokens[0], { eventId: dummyId, sequenceNo: 1 })).status, 400);
    assert.equal((await reqJson(api, 'POST', '/waitlist', tokens[0], { eventId: dummyId })).status, 404);
    assert.equal((await reqJson(api, 'POST', '/waitlist', tokens[0], { eventId: evAvail.id })).status, 400);
    record('ST-023', 'TC01', 'Auth/UUID/404/available-event guards verified');
    const evCore = await seedEvent(prisma, organizer.id, 'st23-core');
    const j1 = await reqJson<{ id: string; sequenceNo: number; status: string; currentRank: number }>(api, 'POST', '/waitlist', tokens[0], { eventId: evCore.id });
    assert.equal(j1.status, 201);
    assert.equal(j1.body.sequenceNo, 1);
    assert.equal(j1.body.currentRank, 1);
    assert.equal((await reqJson(api, 'POST', '/waitlist', tokens[0], { eventId: evCore.id })).status, 409);
    await prisma.waitlistEntry.update({ where: { id: j1.body.id }, data: { status: WaitlistStatus.CANCELLED } });
    const jRejoin = await reqJson<{ sequenceNo: number }>(api, 'POST', '/waitlist', tokens[0], { eventId: evCore.id });
    assert.equal(jRejoin.status, 201);
    assert.equal(jRejoin.body.sequenceNo, 2);
    await prisma.reservation.create({
      data: { eventId: evCore.id, userId: users[1].id, status: ReservationStatus.CONFIRMED, confirmedAt: new Date(), ticketCode: 'TKT-ST23-OWN', priceVnd: 200000, expiresAt: new Date(Date.now() + 600_000) },
    });
    assert.equal((await reqJson(api, 'POST', '/waitlist', tokens[1], { eventId: evCore.id })).status, 409);
    record('ST-023', 'TC02', 'Join sold-out, duplicate/ticket conflict 409, rejoin sequence bump');
    const evRb = await seedEvent(prisma, organizer.id, 'st23-rollback');
    await prisma.$transaction(async (tx) => {
      await tx.event.update({ where: { id: evRb.id }, data: { nextWaitlistSeq: { increment: 1 } } });
      await tx.waitlistEntry.create({ data: { eventId: evRb.id, userId: users[2].id, sequenceNo: -1 } });
    }).catch(() => {});
    assert.equal((await prisma.event.findUniqueOrThrow({ where: { id: evRb.id } })).nextWaitlistSeq, 1);
    record('ST-023', 'TC03', 'Failed transaction cleanly rolls back nextWaitlistSeq');
    const evBurst = await seedEvent(prisma, organizer.id, 'st23-burst');
    const burst = await Promise.all(
      Array.from({ length: 25 }, (_, i) => reqJson<{ sequenceNo: number }>(api, 'POST', '/waitlist', tokens[3 + i], { eventId: evBurst.id }))
    );
    assert.ok(burst.every((r) => r.status === 201));
    assert.deepEqual(burst.map((r) => r.body.sequenceNo).sort((a, b) => a - b), Array.from({ length: 25 }, (_, i) => i + 1));
    const dupRace = await Promise.all(Array.from({ length: 10 }, () => reqJson(api, 'POST', '/waitlist', tokens[28], { eventId: evBurst.id })));
    assert.equal(dupRace.filter((r) => r.status === 201).length, 1);
    assert.equal(dupRace.filter((r) => r.status === 409).length, 9);
    record('ST-023', 'TC04', '25-user parallel burst contiguous 1..25 & 10x single-user race -> 1x 201, 9x 409');
    const evIso = await seedEvent(prisma, organizer.id, 'st23-iso', 5, 5);
    const isoJoin = await reqJson<{ sequenceNo: number }>(api, 'POST', '/waitlist', tokens[0], { eventId: evIso.id });
    assert.equal(isoJoin.status, 201);
    assert.equal(isoJoin.body.sequenceNo, 1);
    assert.equal((await prisma.event.findUniqueOrThrow({ where: { id: evIso.id } })).reservedCount, 0);
    record('ST-023', 'TC05', 'Cross-event sequence isolation & zero reservation side effects');

    // ST-024 & ST-025: Xem vị trí & rời hàng chờ
    assert.equal((await reqJson(api, 'GET', '/waitlist/me')).status, 401);
    assert.deepEqual((await reqJson<Array<unknown>>(api, 'GET', '/waitlist/me', tokens[74])).body, []);
    const ev24 = await seedEvent(prisma, organizer.id, 'st24-rank');
    const w1 = await reqJson<{ id: string }>(api, 'POST', '/waitlist', tokens[30], { eventId: ev24.id });
    await reqJson<{ id: string }>(api, 'POST', '/waitlist', tokens[31], { eventId: ev24.id });
    const w3 = await reqJson<{ id: string; currentRank: number }>(api, 'POST', '/waitlist', tokens[32], { eventId: ev24.id });
    assert.equal(w3.body.currentRank, 3);
    assert.equal((await reqJson(api, 'DELETE', `/waitlist/${w1.body.id}`, tokens[31])).status, 403);
    assert.equal((await reqJson(api, 'DELETE', `/waitlist/${dummyId}`, tokens[30])).status, 404);
    assert.equal((await reqJson(api, 'DELETE', `/waitlist/${w1.body.id}`, tokens[30])).status, 200);
    const w3Me = (await reqJson<Array<{ id: string; sequenceNo: number; currentRank: number | null; event: { title: string; slug: string }; pendingOffer: unknown }>>(api, 'GET', '/waitlist/me', tokens[32])).body.find((x) => x.id === w3.body.id);
    assert.equal(w3Me?.currentRank, 2);
    assert.equal(w3Me?.sequenceNo, 3);
    assert.equal(w3Me?.event.title, `Event ${ev24.slug}`);
    assert.equal(w3Me?.pendingOffer, null);
    record('ST-024', 'T01', 'Dynamic currentRank drops #3->#2 on leave; ownership 403/404; sequenceNo preserved');
    const [d1, d2] = await Promise.all([
      reqJson(api, 'DELETE', `/waitlist/${w3.body.id}`, tokens[32]),
      reqJson(api, 'DELETE', `/waitlist/${w3.body.id}`, tokens[32]),
    ]);
    assert.deepEqual([d1.status, d2.status].sort(), [200, 409]);
    const { entry: offeredEntry } = await seedOfferForUser(prisma, organizer.id, 'st24-offered', users[33].id);
    assert.equal((await reqJson(api, 'DELETE', `/waitlist/${offeredEntry.id}`, tokens[33])).status, 409);
    const offeredMe = (await reqJson<Array<{ id: string; status: string; pendingOffer: { id: string; status: string; expiresAt: string } | null }>>(api, 'GET', '/waitlist/me', tokens[33])).body.find((x) => x.id === offeredEntry.id);
    assert.equal(offeredMe?.status, 'OFFERED');
    assert.ok(offeredMe?.pendingOffer?.id && offeredMe?.pendingOffer?.expiresAt);
    record('ST-024', 'T02', 'Concurrent DELETE race (200/409), OFFERED delete blocked 409, ST-025 payload verified');

    // ST-026: Cấp offer tự động theo thứ tự FIFO
    const { WaitlistService } = await import('../src/waitlist/waitlist.service');
    const waitlistService = app.get(WaitlistService);
    assert.deepEqual(await waitlistService.promoteNextWaitlist(dummyId), { promoted: false, reason: 'EVENT_NOT_FOUND' });
    const evPFull = await seedEvent(prisma, organizer.id, 'st26-full', 1, 1);
    assert.deepEqual(await waitlistService.promoteNextWaitlist(evPFull.id), { promoted: false, reason: 'NO_CAPACITY' });
    const evPEmpty = await seedEvent(prisma, organizer.id, 'st26-empty', 1, 0);
    assert.deepEqual(await waitlistService.promoteNextWaitlist(evPEmpty.id), { promoted: false, reason: 'NO_WAITING_ENTRIES' });
    record('ST-026', 'P01', 'Noop reasons verified: EVENT_NOT_FOUND, NO_CAPACITY, NO_WAITING_ENTRIES');
    const evP = await seedEvent(prisma, organizer.id, 'st26-fifo', 10, 10);
    await reqJson(api, 'POST', '/waitlist', tokens[34], { eventId: evP.id });
    await reqJson(api, 'POST', '/waitlist', tokens[35], { eventId: evP.id });
    await prisma.event.update({ where: { id: evP.id }, data: { soldCount: 8 } });
    const p1 = await waitlistService.promoteNextWaitlist(evP.id);
    assert.equal(p1.promoted, true);
    if (p1.promoted) assert.equal(p1.sequenceNo, 1);
    const pMulti = await Promise.all(Array.from({ length: 6 }, () => waitlistService.promoteNextWaitlist(evP.id)));
    assert.equal(pMulti.filter((r) => r.promoted).length, 1);
    assert.equal((await prisma.event.findUniqueOrThrow({ where: { id: evP.id } })).reservedCount, 2);
    record('ST-026', 'P02', 'FIFO promotion + parallel capacity guard exact');
    const evInelig = await seedEvent(prisma, organizer.id, 'st26-inelig', 10, 10);
    const badWait = await reqJson<{ id: string }>(api, 'POST', '/waitlist', tokens[36], { eventId: evInelig.id });
    await prisma.reservation.create({
      data: { eventId: evInelig.id, userId: users[36].id, status: ReservationStatus.CONFIRMED, confirmedAt: new Date(), ticketCode: 'TKT-INELIG', priceVnd: 200000, expiresAt: new Date(Date.now() + 600_000) },
    });
    await prisma.event.update({ where: { id: evInelig.id }, data: { soldCount: 9 } });
    await assert.rejects(() => waitlistService.promoteNextWaitlist(evInelig.id));
    assert.equal((await prisma.waitlistEntry.findUniqueOrThrow({ where: { id: badWait.body.id } })).status, WaitlistStatus.WAITING);
    const evOuter = await seedEvent(prisma, organizer.id, 'st26-outer', 10, 10);
    const uOuter = await reqJson<{ id: string }>(api, 'POST', '/waitlist', tokens[37], { eventId: evOuter.id });
    assert.equal(uOuter.status, 201);
    await prisma.event.update({ where: { id: evOuter.id }, data: { soldCount: 9 } });
    await prisma.$transaction(async (tx) => {
      const r = await waitlistService.promoteNextWaitlist(evOuter.id, tx);
      assert.equal(r.promoted, true);
      throw new Error('ROLLBACK_OUTER');
    }).catch(() => {});
    assert.equal((await prisma.waitlistEntry.findUniqueOrThrow({ where: { id: uOuter.body.id } })).status, WaitlistStatus.WAITING);
    // Xung đột giữa rời hàng và cấp offer
    const evDp = await seedEvent(prisma, organizer.id, 'st26-del-race', 10, 10);
    const dpJoin = await reqJson<{ id: string }>(api, 'POST', '/waitlist', tokens[57], { eventId: evDp.id });
    await prisma.event.update({ where: { id: evDp.id }, data: { soldCount: 9 } });
    const [dpDel, dpProm] = await Promise.all([
      reqJson(api, 'DELETE', `/waitlist/${dpJoin.body.id}`, tokens[57]),
      waitlistService.promoteNextWaitlist(evDp.id),
    ]);
    assert.ok((dpDel.status === 200 && !dpProm.promoted) || (dpDel.status === 409 && dpProm.promoted));
    record('ST-026', 'P03', 'Ineligible FIFO head, externalTx rollback, and DELETE vs promote race verified');

    // ST-027: Xem, chấp nhận và từ chối offer
    const { offer: off01, event: ev01 } = await seedOfferForUser(prisma, organizer.id, 'st27-acc', users[38].id);
    assert.equal((await reqJson(api, 'GET', `/offers/${off01.id}`)).status, 401);
    assert.equal((await reqJson(api, 'GET', `/offers/${off01.id}`, tokens[39])).status, 403);
    assert.equal((await reqJson(api, 'GET', `/offers/${off01.id}`, tokens[38])).status, 200);
    await prisma.event.update({ where: { id: ev01.id }, data: { priceVnd: 999000 } });
    const [acc1, acc2] = await Promise.all([
      reqJson<{ ticketCode: string; receiptContent: { priceVnd: number } }>(api, 'POST', `/offers/${off01.id}/accept`, tokens[38]),
      reqJson<{ ticketCode: string }>(api, 'POST', `/offers/${off01.id}/accept`, tokens[38]),
    ]);
    assert.equal(acc1.status, 200);
    assert.equal(acc2.status, 200);
    assert.equal(acc1.body.ticketCode, acc2.body.ticketCode);
    assert.equal(acc1.body.receiptContent.priceVnd, 200000);
    const ev01Db = await prisma.event.findUniqueOrThrow({ where: { id: ev01.id } });
    assert.equal(ev01Db.soldCount, 10);
    assert.equal(ev01Db.reservedCount, 0);
    record('ST-027', 'O01', 'Accept idempotent & parallel-safe, locks price from reservation, counters updated');
    const { offer: offExp } = await seedOfferForUser(prisma, organizer.id, 'st27-exp', users[40].id, true);
    assert.equal((await reqJson(api, 'POST', `/offers/${offExp.id}/accept`, tokens[40])).status, 410);
    const { offer: offDec, event: evDec } = await seedOfferForUser(prisma, organizer.id, 'st27-dec', users[41].id);
    const waitNext = await reqJson<{ id: string }>(api, 'POST', '/waitlist', tokens[42], { eventId: evDec.id });
    const decRes = await reqJson<{ declined: boolean; promotedNext: boolean }>(api, 'POST', `/offers/${offDec.id}/decline`, tokens[41]);
    assert.equal(decRes.status, 200);
    assert.equal(decRes.body.promotedNext, true);
    assert.equal((await prisma.waitlistEntry.findUniqueOrThrow({ where: { id: waitNext.body.id } })).status, WaitlistStatus.OFFERED);
    const { offer: offRace } = await seedOfferForUser(prisma, organizer.id, 'st27-race', users[43].id);
    const [rAcc, rDec] = await Promise.all([
      reqJson(api, 'POST', `/offers/${offRace.id}/accept`, tokens[43]),
      reqJson(api, 'POST', `/offers/${offRace.id}/decline`, tokens[43]),
    ]);
    assert.deepEqual([rAcc.status, rDec.status].sort(), [200, 409]);
    record('ST-027', 'O02', 'Expired->410, Decline promotes FIFO next, Accept vs Decline mutually exclusive');

    // ST-028: Worker quét hết hạn và endpoint nội bộ
    const { ExpirySweepService } = await import('../src/jobs/expiry-sweep.service');
    const sweeper = app.get(ExpirySweepService);
    await sweeper.sweepExpiredRecords();
    const { offer: swOff, event: evSw } = await seedOfferForUser(prisma, organizer.id, 'st28-off', users[44].id, true);
    const waitSw = await reqJson<{ id: string }>(api, 'POST', '/waitlist', tokens[45], { eventId: evSw.id });
    const { reservation: swHold, event: evHold } = await seedDirectHold(prisma, organizer.id, 'st28-hold', users[46].id, true);
    const { offer: keepOff } = await seedOfferForUser(prisma, organizer.id, 'st28-keep', users[47].id, false);
    const sweepRes = await sweeper.sweepExpiredRecords();
    assert.equal(sweepRes.expiredOffers, 1);
    assert.equal(sweepRes.expiredDirectHolds, 1);
    assert.equal(sweepRes.promotedOffers, 1);
    assert.equal((await prisma.offer.findUniqueOrThrow({ where: { id: swOff.id } })).status, OfferStatus.EXPIRED);
    assert.equal((await prisma.waitlistEntry.findUniqueOrThrow({ where: { id: waitSw.body.id } })).status, WaitlistStatus.OFFERED);
    assert.equal((await prisma.reservation.findUniqueOrThrow({ where: { id: swHold.id } })).status, ReservationStatus.EXPIRED);
    assert.equal((await prisma.event.findUniqueOrThrow({ where: { id: evHold.id } })).reservedCount, 0);
    assert.equal((await prisma.offer.findUniqueOrThrow({ where: { id: keepOff.id } })).status, OfferStatus.PENDING);
    record('ST-028', 'E01', 'Sweeps expired Offer & Direct HOLD with auto-promote; unexpired untouched');
    process.env.INTERNAL_JOB_SECRET = 'secret-st028-test';
    assert.equal((await reqJson(api, 'POST', '/internal/jobs/expire-sweep')).status, 401);
    assert.equal((await reqJson(api, 'POST', '/internal/jobs/expire-sweep', undefined, undefined, { 'x-internal-job-secret': 'wrong' })).status, 401);
    const intOk = await reqJson<{ jobId: string }>(api, 'POST', '/internal/jobs/expire-sweep', undefined, undefined, { 'x-internal-job-secret': 'secret-st028-test' });
    assert.equal(intOk.status, 200);
    assert.ok(intOk.body.jobId);
    record('ST-028', 'E02', 'Internal endpoint secret guard 401/200 & jobId verified');
    // Chặn sai lệch eventId khi quét hết hạn
    const { offer: staleOff, event: staleEv } = await seedOfferForUser(prisma, organizer.id, 'st28-stale1', users[48].id, true);
    const { reservation: staleHold, event: staleHoldEv } = await seedDirectHold(prisma, organizer.id, 'st28-stale2', users[49].id, true);
    const wrongEv = await seedEvent(prisma, organizer.id, 'st28-wrong-ev', 10, 0);
    const staleRes1 = await prisma.$transaction((tx) => sweeper.processExpiredOfferInTx(tx, staleOff.id, wrongEv.id, 'job-s1'));
    const staleRes2 = await prisma.$transaction((tx) => sweeper.processExpiredDirectHoldInTx(tx, staleHold.id, wrongEv.id, 'job-s2'));
    assert.deepEqual(staleRes1, { processed: false, promoted: false });
    assert.deepEqual(staleRes2, { processed: false, promoted: false });
    assert.equal((await prisma.event.findUniqueOrThrow({ where: { id: staleEv.id } })).reservedCount, 1);
    assert.equal((await prisma.event.findUniqueOrThrow({ where: { id: staleHoldEv.id } })).reservedCount, 1);
    await sweeper.sweepExpiredRecords();
    record('ST-028', 'E03', 'Stale eventId safely skipped for Offer & Direct HOLD without counter mutation');
    // Chống nghẽn batch khi 6 bản ghi lỗi đứng trước 1 bản ghi hợp lệ
    sweeper.resetPersistentCursors();
    const baseTime = Date.now() - 30 * 60_000;
    const invIds: string[] = [];
    for (let i = 0; i < 6; i++) {
      const { offer: invOff, reservation: invRes } = await seedOfferForUser(prisma, organizer.id, `st28-inv-${i}`, users[50 + i].id, true);
      await prisma.reservation.update({ where: { id: invRes.id }, data: { status: ReservationStatus.CANCELLED, cancelledAt: new Date() } });
      await prisma.offer.update({ where: { id: invOff.id }, data: { createdAt: new Date(baseTime - 60_000), expiresAt: new Date(baseTime + i * 1_000) } });
      invIds.push(invOff.id);
    }
    const { offer: validAfter6, event: validEv } = await seedOfferForUser(prisma, organizer.id, 'st28-valid7', users[56].id, true);
    await prisma.offer.update({ where: { id: validAfter6.id }, data: { createdAt: new Date(baseTime - 60_000), expiresAt: new Date(baseTime + 10_000) } });
    const s1 = await sweeper.sweepExpiredRecords(undefined, 1);
    assert.equal(s1.expiredOffers, 0);
    assert.equal(s1.skipped, 5);
    const s2 = await sweeper.sweepExpiredRecords(undefined, 1);
    assert.equal(s2.expiredOffers, 1);
    assert.equal(s2.skipped, 1);
    assert.equal((await prisma.offer.findUniqueOrThrow({ where: { id: validAfter6.id } })).status, OfferStatus.EXPIRED);
    assert.equal((await prisma.event.findUniqueOrThrow({ where: { id: validEv.id } })).reservedCount, 0);
    await prisma.offer.updateMany({ where: { id: { in: invIds } }, data: { status: OfferStatus.EXPIRED } });
    record('ST-028', 'E04', 'Keyset continuation prevents batch starvation across sweeps (6 invalid -> 1 valid)');
    // Hai worker chạy song song không xử lý trùng
    sweeper.resetPersistentCursors();
    await seedOfferForUser(prisma, organizer.id, 'st28-conc1', users[58].id, true);
    await seedOfferForUser(prisma, organizer.id, 'st28-conc2', users[59].id, true);
    const [cw1, cw2] = await Promise.all([sweeper.sweepExpiredRecords(), sweeper.sweepExpiredRecords()]);
    assert.equal(cw1.expiredOffers + cw2.expiredOffers, 2);
    record('ST-028', 'E05', 'Concurrent sweepers process 2/2 expired offers via SKIP LOCKED with 0 duplicates');
    console.log(`CORE E2E PASS: ${passed.length}/${passed.length} tests`);
    console.log(JSON.stringify(passed, null, 2));
  } finally {
    await prismaClient?.$disconnect();
    await app?.close();
    if (dbCreated) await adminPrisma.$executeRawUnsafe(`DROP DATABASE "${testDbName}"`);
    await adminPrisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('E2E FAILURE:', err);
  process.exit(1);
});
