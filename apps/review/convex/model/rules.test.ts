import { describe, expect, test } from "vitest";
import {
  canModerateComment,
  canSetStatus,
  canUploadVersion,
  cleanText,
  cleanTimestamp,
  isEmail,
  parseStaffEmails,
} from "./rules";

describe("rules", () => {
  test("staff emails are trimmed, lowercased and split", () => {
    expect(parseStaffEmails(" A@b.co, ,c@D.co ")).toEqual(
      new Set(["a@b.co", "c@d.co"]),
    );
    expect(parseStaffEmails(undefined).size).toBe(0);
  });

  test("permissions", () => {
    expect(canSetStatus("admin")).toBe(true);
    expect(canSetStatus("creator")).toBe(false);
    expect(canUploadVersion("creator", true)).toBe(true);
    expect(canUploadVersion("creator", false)).toBe(false);
    expect(canUploadVersion("admin", false)).toBe(true);
    expect(canModerateComment("creator", false)).toBe(false);
    expect(canModerateComment("creator", true)).toBe(true);
  });

  test("text and timestamps are cleaned", () => {
    expect(cleanText("  hi ", 5)).toBe("hi");
    expect(() => cleanText("toolong", 3)).toThrow("under 3");
    expect(cleanTimestamp(undefined)).toBeUndefined();
    expect(cleanTimestamp(1.26)).toBe(1.3);
    expect(() => cleanTimestamp(-1)).toThrow("Invalid");
    expect(() => cleanTimestamp(Number.NaN)).toThrow("Invalid");
    expect(isEmail("a@b.co")).toBe(true);
    expect(isEmail("a@b")).toBe(false);
  });
});
