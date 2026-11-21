import { describe, expect, it, vi } from "vitest";

import "@/widgets/trip-countdown-widget";
import type { TripCountdownWidgetProps } from "@/widgets/trip-countdown-widget";

type Modifier = { mod: string; args: unknown[] };
type Node = {
  type: { viewName?: string };
  props: { children?: unknown; modifiers?: Modifier[]; [k: string]: unknown };
};
type Environment = {
  colorScheme: "light" | "dark";
  widgetFamily: "systemSmall" | "systemMedium";
};
type Component = (props: TripCountdownWidgetProps, env: Environment) => Node;

const registry = vi.hoisted(() => ({
  name: "",
  component: null as Component | null,
}));

vi.mock("@expo/ui/swift-ui", () => {
  const view = (name: string) => Object.assign(() => null, { viewName: name });
  return {
    Image: view("Image"),
    Rectangle: view("Rectangle"),
    Spacer: view("Spacer"),
    Text: view("Text"),
    VStack: view("VStack"),
    ZStack: view("ZStack"),
  };
});

vi.mock("@expo/ui/swift-ui/modifiers", () => {
  const modifier =
    (mod: string) =>
    (...args: unknown[]) => ({ mod, args });
  return {
    aspectRatio: modifier("aspectRatio"),
    containerBackground: modifier("containerBackground"),
    font: modifier("font"),
    foregroundStyle: modifier("foregroundStyle"),
    frame: modifier("frame"),
    lineLimit: modifier("lineLimit"),
    multilineTextAlignment: modifier("multilineTextAlignment"),
    padding: modifier("padding"),
    resizable: modifier("resizable"),
    widgetURL: modifier("widgetURL"),
  };
});

vi.mock("expo-widgets", () => ({
  createWidget: (name: string, component: Component) => {
    registry.name = name;
    registry.component = component;
    return { name };
  },
}));

function render(
  props: TripCountdownWidgetProps,
  env: Partial<Environment> = {},
): Node {
  if (registry.component === null) throw new Error("widget not registered");
  return registry.component(props, {
    colorScheme: "light",
    widgetFamily: "systemSmall",
    ...env,
  });
}

function named(node: Node, name: string): boolean {
  return node.type?.viewName === name;
}

function nodes(node: unknown): Node[] {
  if (node === null || node === undefined || typeof node !== "object")
    return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  const n = node as Node;
  return [n, ...nodes(n.props.children)];
}

function texts(tree: Node): unknown[] {
  return nodes(tree)
    .filter((n) => named(n, "Text"))
    .map((n) => n.props.children);
}

function link(tree: Node): unknown {
  return tree.props.modifiers?.find((m) => m.mod === "widgetURL")?.args[0];
}

const countdown: TripCountdownWidgetProps = {
  scheme: "shelvr",
  tripId: "trip1",
  label: "Lisbon trip",
  headline: "12 days to go",
  detail: "Dec 10 – Dec 12",
  footnote: "8 stops · 5 from your saves",
  emptyTitle: "No trip coming up",
  emptyBody: "Add dates to a trip to start the countdown",
};

describe("trip countdown widget", () => {
  it("registers under the name the config plugin declares", () => {
    expect(registry.name).toBe("TripCountdown");
  });

  it("shows the empty state, opening the app, when there is no trip", () => {
    const tree = render({
      scheme: "shelvr-dev",
      emptyTitle: "No trip coming up",
      emptyBody: "Add dates to a trip to start the countdown",
    });
    expect(texts(tree)).toEqual([
      "No trip coming up",
      "Add dates to a trip to start the countdown",
    ]);
    expect(link(tree)).toBe("shelvr-dev:///");
  });

  it("shows a cleared widget with no trip text", () => {
    const tree = render({});
    expect(texts(tree)).toEqual(["Shelvr", ""]);
    expect(link(tree)).toBe("shelvr:///");
  });

  it("opens the trip and shows its countdown", () => {
    const tree = render(countdown);
    expect(link(tree)).toBe("shelvr:///trip-plan/trip1");
    expect(texts(tree)).toEqual([
      "Lisbon trip",
      "12 days to go",
      "Dec 10 – Dec 12",
    ]);
  });

  it("adds the stops line only on the medium size", () => {
    expect(
      texts(render(countdown, { widgetFamily: "systemMedium" })),
    ).toContain("8 stops · 5 from your saves");
    expect(texts(render(countdown))).not.toContain(
      "8 stops · 5 from your saves",
    );
  });

  it("puts the city photo behind a darkening gradient", () => {
    const tree = render({ ...countdown, imageUri: "file:///w/lisbon.jpg" });
    const all = nodes(tree);
    expect(all.find((n) => named(n, "Image"))?.props.uiImage).toBe(
      "file:///w/lisbon.jpg",
    );
    expect(all.some((n) => named(n, "Rectangle"))).toBe(true);
  });

  it("draws no photo or gradient without an image", () => {
    const all = nodes(render(countdown));
    expect(all.some((n) => named(n, "Image"))).toBe(false);
    expect(all.some((n) => named(n, "Rectangle"))).toBe(false);
  });
});
