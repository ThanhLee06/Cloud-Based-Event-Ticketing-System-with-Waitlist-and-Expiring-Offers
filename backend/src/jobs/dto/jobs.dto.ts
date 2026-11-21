export interface SweepExpiredRecordsResult {
  jobId: string;
  expiredOffers: number;
  expiredDirectHolds: number;
  promotedOffers: number;
  skipped: number;
  durationMs: number;
}
