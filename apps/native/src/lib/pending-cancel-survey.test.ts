import { beforeEach, expect, it, vi } from "vitest";
import {
  getPendingCancelSurvey,
  setPendingCancelSurvey,
} from "./pending-cancel-survey";

const storage = vi.hoisted(() => new Map<string, string>());
vi.mock("expo-secure-store", () => ({
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
}));
beforeEach(() => storage.clear());

it("retains bounded replies independently for each account and clears acknowledged replies", () => {
  setPendingCancelSurvey("first", {
    outcome: "submitted",
    reason: "too_expensive",
  });
  expect(getPendingCancelSurvey("second")).toBeNull();
  setPendingCancelSurvey("second", { outcome: "dismissed" });
  expect(getPendingCancelSurvey("first")).toEqual({
    outcome: "submitted",
    reason: "too_expensive",
  });
  setPendingCancelSurvey("first", null);
  expect(getPendingCancelSurvey("first")).toBeNull();
  expect(getPendingCancelSurvey("second")).toEqual({ outcome: "dismissed" });
});

it.each([
  "{invalid",
  "null",
  "{}",
  '{"outcome":"submitted","reason":"unrecognized"}',
  '{"outcome":"arbitrary"}',
])("ignores malformed saved replies: %s", (raw) => {
  storage.set("shelvr.cancel-survey.first", raw);
  expect(getPendingCancelSurvey("first")).toBeNull();
});
