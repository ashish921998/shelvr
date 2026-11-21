export type Role = "admin" | "creator";
export type ReviewStatus = "needs_review" | "changes_requested" | "approved";

export const MAX_TITLE = 120;
export const MAX_BODY = 4000;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function parseStaffEmails(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map(normalizeEmail)
      .filter((email) => email.length > 0),
  );
}

export function canSetStatus(role: Role): boolean {
  return role === "admin";
}

export function canUploadVersion(role: Role, isVideoCreator: boolean): boolean {
  return role === "admin" || isVideoCreator;
}

export function canModerateComment(role: Role, isAuthor: boolean): boolean {
  return role === "admin" || isAuthor;
}

export function cleanText(raw: string, max: number): string {
  const text = raw.trim();
  if (text.length > max) {
    throw new Error(`Keep it under ${max} characters`);
  }
  return text;
}

export function cleanTimestamp(
  timestamp: number | undefined,
): number | undefined {
  if (timestamp === undefined) return undefined;
  if (!Number.isFinite(timestamp) || timestamp < 0) {
    throw new Error("Invalid timestamp");
  }
  return Math.round(timestamp * 10) / 10;
}
