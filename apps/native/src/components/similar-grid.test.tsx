// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
import type { DetailItem } from "./item-detail";
import { SimilarGrid } from "./similar-grid";

vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: vi.fn(),
}));
vi.mock("react-native", () => ({
  View: vi.fn(({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  )),
  Text: vi.fn(({ children }: { children?: ReactNode }) => (
    <span>{children}</span>
  )),
  Pressable: vi.fn(({ children }: { children?: ReactNode }) => (
    <button>{children}</button>
  )),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
}));
vi.mock("expo-image", () => ({ Image: vi.fn(() => <img alt="" />) }));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const save = (fields: Partial<DetailItem>) =>
  ({
    _id: fields.title ?? "item",
    _creationTime: 0,
    type: "link",
    status: "ready",
    tags: [],
    ...fields,
  }) as DetailItem;

it("names a text card once and puts its site under it", () => {
  render(
    <SimilarGrid
      items={[
        save({
          title: "How to Do Great Work",
          url: "https://paulgraham.com/greatwork.html",
        }),
      ]}
    />,
  );
  expect(screen.getAllByText("How to Do Great Work")).toHaveLength(1);
  expect(screen.getByText("paulgraham.com")).toBeTruthy();
});

it("keeps the title under a photo", () => {
  render(
    <SimilarGrid
      items={[
        save({
          title: "Lou's Diner",
          type: "image",
          imageUrl: "https://example.convex.cloud/api/storage/1",
        }),
      ]}
    />,
  );
  expect(screen.getByText("Lou's Diner")).toBeTruthy();
});

it("shows a note's text once", () => {
  render(
    <SimilarGrid items={[save({ type: "note", note: "Call the landlord" })]} />,
  );
  expect(screen.getAllByText("Call the landlord")).toHaveLength(1);
});
