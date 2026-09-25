// The widget extension's JS runtime renders through @expo/ui's SwiftUI
// intrinsics, which need a native host. The component is invoked directly
// here (no rendering): each intrinsic is an identity registered in
// `fsx.views`, and every modifier becomes a tagged descriptor, so the tests
// assert on the element tree the widget would hand the runtime.
import { describe, expect, it, vi } from "vitest";

// Importing the module runs createWidget, which registers the component in
// the expo-widgets mock below (vi.mock factories hoist above imports).
import "@/widgets/recent-saves-widget";

type WidgetSaveItem = {
  id: string;
  title: string;
  subtitle: string;
  kind: "image" | "link" | "note";
  imageUri?: string;
};

type WidgetSnapshotProps = {
  items?: WidgetSaveItem[];
  emptyTitle?: string;
  emptyHint?: string;
  locked?: boolean;
  validUntil?: number;
};

type WidgetEnvironment = {
  colorScheme: "light" | "dark";
  widgetFamily: "systemSmall" | "systemMedium";
  date?: Date;
};

/** One element of the tree the component returns. */
type WidgetElement = {
  type: unknown;
  props: {
    children?: WidgetElement[];
    modifiers?: { mod: string; args: unknown[] }[];
    [field: string]: unknown;
  };
};

type WidgetComponent = (
  props: WidgetSnapshotProps,
  environment: WidgetEnvironment,
) => WidgetElement;

const fsx = vi.hoisted(() => ({
  component: null as WidgetComponent | null,
  views: {} as Record<string, unknown>,
}));

vi.mock("@expo/ui/swift-ui", () => {
  const intrinsic = (name: string) => {
    const view = (props: Record<string, unknown>) => ({ name, props });
    fsx.views[name] = view;
    return view;
  };
  return {
    HStack: intrinsic("HStack"),
    Image: intrinsic("Image"),
    Rectangle: intrinsic("Rectangle"),
    Spacer: intrinsic("Spacer"),
    Text: intrinsic("Text"),
    VStack: intrinsic("VStack"),
    ZStack: intrinsic("ZStack"),
  };
});

vi.mock("@expo/ui/swift-ui/modifiers", () => {
  const modifier =
    (mod: string) =>
    (...args: unknown[]) => ({ mod, args });
  return {
    aspectRatio: modifier("aspectRatio"),
    clipShape: modifier("clipShape"),
    containerBackground: modifier("containerBackground"),
    containerRelativeFrame: modifier("containerRelativeFrame"),
    font: modifier("font"),
    foregroundStyle: modifier("foregroundStyle"),
    frame: modifier("frame"),
    lineLimit: modifier("lineLimit"),
    padding: modifier("padding"),
    resizable: modifier("resizable"),
    widgetURL: modifier("widgetURL"),
  };
});

vi.mock("expo-widgets", () => ({
  createWidget: (_name: string, component: WidgetComponent) => {
    fsx.component = component;
    return { name: _name };
  },
}));

const smallLight = {
  colorScheme: "light",
  widgetFamily: "systemSmall",
} as const;

function widget(): WidgetComponent {
  if (fsx.component === null) {
    throw new Error("recent-saves-widget did not register its component");
  }
  return fsx.component;
}

/** The `index`th child of an element's children, failing loudly if absent. */
function childView(tree: WidgetElement, index: number): WidgetElement {
  const child = (tree.props.children ?? [])[index];
  if (child === undefined) {
    throw new Error(`widget tree has no child ${index}`);
  }
  return child;
}

/** The first text child of the `index`th child view. JSX hands a single
 * child over as the raw value and multiple children as an array, so
 * normalize before comparing. */
function textOf(tree: WidgetElement, index: number): unknown {
  const children = childView(tree, index).props.children;
  return Array.isArray(children) ? children[0] : children;
}

/** The URL the whole widget taps through to, or undefined if none is set. */
function widgetUrl(tree: WidgetElement): unknown {
  return (
    (tree.props.modifiers ?? []).find((m) => m.mod === "widgetURL")?.args[0] ??
    undefined
  );
}

describe("RecentSavesWidget", () => {
  it("renders the Pro upsell for a locked empty snapshot", () => {
    const tree = widget()(
      {
        items: [],
        emptyTitle: "Shelvr Pro",
        emptyHint: "Unlock your latest saves",
        locked: true,
      },
      smallLight,
    );

    // Lock icon instead of the tray, with the localized Pro copy under it.
    expect(childView(tree, 0).type).toBe(fsx.views.Image);
    expect(childView(tree, 0).props.systemName).toBe("lock.fill");
    expect(textOf(tree, 1)).toBe("Shelvr Pro");
    expect(textOf(tree, 2)).toBe("Unlock your latest saves");
    // Tapping a locked widget goes to the paywall.
    expect(widgetUrl(tree)).toBe("shelvr:///paywall");
  });

  it("fails closed to the Pro state before the app writes a snapshot", () => {
    const tree = widget()({}, smallLight);

    expect(childView(tree, 0).props.systemName).toBe("lock.fill");
    expect(widgetUrl(tree)).toBe("shelvr:///paywall");
  });

  it("renders the normal empty state for an entitled user", () => {
    const tree = widget()(
      {
        items: [],
        emptyTitle: "No saves yet",
        emptyHint: "Add something to your shelf",
        locked: false,
      },
      smallLight,
    );

    expect(childView(tree, 0).props.systemName).toBe("tray");
    expect(textOf(tree, 1)).toBe("No saves yet");
    expect(widgetUrl(tree)).toBe("shelvr:///add");
  });

  it("shows saves, never the lock, for an entitled user with saves", () => {
    const tree = widget()(
      {
        items: [
          { id: "a", title: "Chair", subtitle: "example.com", kind: "link" },
        ],
        locked: false,
      },
      smallLight,
    );

    expect(widgetUrl(tree)).toBe("shelvr:///");
    const rendered = JSON.stringify(tree);
    expect(rendered).toContain("Chair");
    expect(rendered).not.toContain("lock.fill");
    expect(rendered).not.toContain("paywall");
  });

  it("keeps showing saves while its clock is before the expiry", () => {
    const tree = widget()(
      {
        items: [
          { id: "a", title: "Chair", subtitle: "example.com", kind: "link" },
        ],
        locked: false,
        validUntil: 2_000,
      },
      { ...smallLight, date: new Date(1_000) },
    );

    expect(widgetUrl(tree)).toBe("shelvr:///");
    const rendered = JSON.stringify(tree);
    expect(rendered).toContain("Chair");
    expect(rendered).not.toContain("lock.fill");
  });

  it("locks and hides saves once its clock passes the expiry", () => {
    const tree = widget()(
      {
        items: [
          { id: "a", title: "Chair", subtitle: "example.com", kind: "link" },
        ],
        emptyTitle: "Shelvr Pro",
        emptyHint: "Unlock your latest saves",
        locked: false,
        validUntil: 1_000,
      },
      { ...smallLight, date: new Date(2_000) },
    );

    // The lapsed entitlement collapses to the Pro upsell — no saved content.
    expect(childView(tree, 0).props.systemName).toBe("lock.fill");
    expect(widgetUrl(tree)).toBe("shelvr:///paywall");
    expect(JSON.stringify(tree)).not.toContain("Chair");
  });
});
