import type { ReportPeriod } from "./reportPeriods";

export type ReportStatus = "queued" | "running" | "ready" | "sparse" | "failed" | "skipped";

export type ReportInsight = {
  body: string;
  evidenceIds: string[];
};

export type ReportStory = {
  title: string;
  insights: ReportInsight[];
};

export type ReportCandidate = ReportInsight & {
  id: string;
  title: string;
};

export type ReportReview = {
  candidates: ReportCandidate[];
  selectedIds: string[];
  defaultIds: string[];
  revision: number;
};

export type ReportGeneration = {
  story: ReportStory;
  review?: ReportReview;
};

export type ReportSummary = {
  period: ReportPeriod;
  status: ReportStatus;
  title?: string;
  unread: boolean;
};

export type ReportDetail = ReportSummary & {
  story?: ReportStory;
  review?: Pick<ReportReview, "selectedIds" | "revision"> & {
    candidates: Pick<ReportCandidate, "id" | "body">[];
  };
  publishedAt?: string;
};

export type ReportShelf = {
  issues: ReportSummary[];
  annual: ReportPeriod | null;
  configured: boolean;
};
