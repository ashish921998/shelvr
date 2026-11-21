// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  cityImageName,
  clearTripCountdownWidget,
  TripCountdownWidgetSync,
} from "./trip-countdown-sync";

type Entry = { date: Date; props: Record<string, unknown> };

const env = vi.hoisted(() => ({
  os: "ios",
  native: true,
  trips: [] as unknown[],
  cities: [] as unknown[],
  queried: [] as unknown[],
  timelines: [] as Entry[][],
  images: [] as [string, string][],
  imageGate: null as Promise<void> | null,
  failImage: false,
  listed: [] as string[],
  deleted: [] as string[],
}));
const capture = vi.hoisted(() => vi.fn());

vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return env.os;
    },
  },
}));
vi.mock("convex/react", () => ({ useAction: vi.fn() }));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { variant: "production" } } },
}));
vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => (env.native ? {} : null),
}));
vi.mock("expo-widgets", () => ({ widgetsDirectory: "file:///widgets" }));
vi.mock("@/widgets/trip-countdown-widget", () => ({
  default: {
    updateTimeline: (entries: Entry[]) => env.timelines.push(entries),
  },
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture, captureError: vi.fn() },
}));
vi.mock("@convex/_generated/api", () => ({
  api: {
    tripPlannerData: { listTripPlans: "listTripPlans" },
    items: { listCities: "listCities" },
  },
}));
vi.mock("@convex-dev/react-query", () => ({
  convexQuery: (fn: string, args: unknown) => ({ fn, args }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ fn, args }: { fn: string; args: unknown }) => {
    env.queried.push(args);
    if (args === "skip") return { data: undefined };
    return {
      data: fn === "listCities" ? env.cities : { page: env.trips },
    };
  },
}));
vi.mock("expo-file-system", () => {
  class File {
    constructor(
      public uri: string,
      public name: string,
    ) {}
    get exists() {
      return true;
    }
    delete() {
      env.deleted.push(this.name);
    }
  }
  class Directory {
    constructor(public uri: string) {}
    get exists() {
      return true;
    }
    create() {}
    list() {
      return env.listed.map((name) => new File(`${this.uri}/${name}`, name));
    }
  }
  return { File, Directory, Paths: { cache: "file:///cache" } };
});
vi.mock("@/lib/widget-image", () => ({
  WIDGET_IMAGE_TIMEOUT: "widget_thumbnail_timeout",
  deleteQuietly: (file: { delete(): void }) => file.delete(),
  ensureWidgetImage: async (_dir: unknown, name: string, url: string) => {
    env.images.push([name, url]);
    if (env.imageGate) await env.imageGate;
    if (env.failImage) throw new Error("boom");
    return `file:///widgets/${name}`;
  },
}));

function isoDay(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const lisbon = {
  _id: "trip1",
  city: "Lisbon",
  startDate: isoDay(5),
  dayCount: 3,
  stopCount: 8,
  savedCount: 5,
  interests: [],
  createdAt: 1,
};
const photo = "https://cdn.example/lisbon.jpg";

async function mount() {
  const view = render(<TripCountdownWidgetSync />);
  await act(async () => {});
  return view;
}

beforeEach(() => {
  env.os = "ios";
  env.native = true;
  env.trips = [lisbon];
  env.cities = [{ city: "Lisbon", count: 3, cover: null, photo }];
  env.queried = [];
  env.timelines = [];
  env.images = [];
  env.imageGate = null;
  env.failImage = false;
  env.listed = [];
  env.deleted = [];
  capture.mockClear();
});

describe("TripCountdownWidgetSync", () => {
  it("publishes a countdown to the next trip over its city photo", async () => {
    await mount();
    expect(env.images).toEqual([[cityImageName("Lisbon", photo), photo]]);
    expect(env.timelines).toHaveLength(1);
    const [first] = env.timelines[0];
    expect(first.props).toMatchObject({
      scheme: "shelvr",
      tripId: "trip1",
      label: "Lisbon trip",
      headline: "5 days to go",
      imageUri: `file:///widgets/${cityImageName("Lisbon", photo)}`,
    });
  });

  it("removes old city photos but keeps the one in use", async () => {
    const current = cityImageName("Lisbon", photo);
    env.listed = [current, "trip-countdown-old.jpg", "recent-saves-a.jpg"];
    await mount();
    expect(env.deleted).toEqual(["trip-countdown-old.jpg"]);
  });

  it("publishes without a photo when the photo cannot be fetched", async () => {
    env.failImage = true;
    await mount();
    expect(env.timelines[0][0].props.imageUri).toBeUndefined();
    expect(env.timelines[0][0].props.headline).toBe("5 days to go");
    expect(capture).toHaveBeenCalledWith("widget_sync_failed", {
      reason: "error",
      widget: "trip_countdown",
    });
  });

  it("shows the empty state when no dated trip is ahead", async () => {
    env.trips = [{ ...lisbon, startDate: undefined }];
    await mount();
    expect(env.images).toEqual([]);
    expect(env.timelines[0]).toHaveLength(1);
    expect(env.timelines[0][0].props.emptyTitle).toBe("No trip coming up");
  });

  it("does not republish when nothing changed", async () => {
    const view = await mount();
    view.rerender(<TripCountdownWidgetSync />);
    await act(async () => {});
    expect(env.timelines).toHaveLength(1);
  });

  it("does nothing outside iOS", async () => {
    env.os = "android";
    await mount();
    expect(env.queried.every((args) => args === "skip")).toBe(true);
    expect(env.timelines).toEqual([]);
  });

  it("does nothing on a build without the widgets module", async () => {
    env.native = false;
    await mount();
    expect(env.timelines).toEqual([]);
  });
});

describe("clearTripCountdownWidget", () => {
  it("blanks the widget and deletes only its photos", async () => {
    env.listed = ["trip-countdown-a.jpg", "recent-saves-a.jpg"];
    await clearTripCountdownWidget();
    expect(env.timelines).toHaveLength(1);
    expect(env.timelines[0]).toHaveLength(1);
    expect(env.timelines[0][0].props).toEqual({});
    expect(env.deleted).toEqual(["trip-countdown-a.jpg"]);
  });

  it("keeps a sync that was mid-download from republishing the trip", async () => {
    let release!: () => void;
    env.imageGate = new Promise<void>((resolve) => (release = resolve));
    await mount();
    expect(env.images).toHaveLength(1);

    const clearing = clearTripCountdownWidget();
    release();
    await clearing;
    await act(async () => {});

    expect(env.timelines).toHaveLength(1);
    expect(env.timelines[0][0].props).toEqual({});
  });
});
