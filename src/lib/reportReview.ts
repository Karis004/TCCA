import type { ReportReview, ReportStory } from "./reportTypes";

export const maxReviewedInsights = 5;

export function selectReportInsights(review: ReportReview, selectedIds: string[], currentStory: ReportStory): ReportStory | null {
  const ids = new Set(selectedIds);
  if (!ids.size || ids.size > maxReviewedInsights || ids.size !== selectedIds.length) return null;

  const candidates = new Map(review.candidates.map(candidate => [candidate.id, candidate]));
  const selected = selectedIds.flatMap(id => candidates.get(id) ?? []);
  if (selected.length !== ids.size) return null;

  return {
    title: selectedIds[0] === review.selectedIds[0] ? currentStory.title : selected[0].title,
    insights: selected.map(({ body, evidenceIds }) => ({ body, evidenceIds }))
  };
}
