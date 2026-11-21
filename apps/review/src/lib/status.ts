export type ReviewStatus = "needs_review" | "changes_requested" | "approved";

export const STATUS_LABEL: Record<ReviewStatus, string> = {
  needs_review: "Needs review",
  changes_requested: "Changes requested",
  approved: "Approved",
};

export const STATUS_CLASS: Record<ReviewStatus, string> = {
  needs_review: "bg-amber-400/15 text-amber-300 ring-amber-400/30",
  changes_requested: "bg-rose-500/15 text-rose-300 ring-rose-400/30",
  approved: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30",
};

export const STATUS_ORDER: ReviewStatus[] = [
  "needs_review",
  "changes_requested",
  "approved",
];
