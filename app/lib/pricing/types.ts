import type { ServiceId } from "../services/service-id";

export interface PriceRule {
  versionId: string;
  serviceId: ServiceId;
  baseTwd: number;
  includedSongs: number;
  perSongAfterIncludedTwd: number;
  studentDiscountBps: number;
  rushBps: number;
  consultationBps: number;
  sourcePrepBps: number;
}

export interface QuoteInput {
  serviceId: ServiceId;
  songCount?: number;
  rush: boolean;
  consultation: boolean;
  sourcePrep: boolean;
  studentRequested: boolean;
}

export interface QuoteBreakdown {
  serviceBaseTwd: number;
  rushTwd: number;
  consultationTwd: number;
  sourcePrepTwd: number;
  beforeStudentDiscountTwd: number;
  studentDiscountTwd: number;
  lockedInitialTwd: number;
  studentStatus: "not_requested" | "pending_proof";
}
