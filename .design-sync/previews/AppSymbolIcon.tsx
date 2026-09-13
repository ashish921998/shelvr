import { AppSymbolIcon } from "@shelvr/native-ui";

// Layout glue: the app's cream background. On web every name renders as its
// mapped Material Symbol, not the SF Symbol iOS shows.
const surface = {
  display: "flex",
  flexWrap: "wrap" as const,
  alignItems: "center",
  gap: 20,
  padding: 16,
  borderRadius: 12,
  background: "var(--colors-background)",
};

/** Sizes the app uses: 13 in card captions, 20 in the search field, 40 on the add screen. */
export function Sizes() {
  return (
    <div style={surface}>
      <AppSymbolIcon name="link" size={13} tintColor="var(--colors-faint)" />
      <AppSymbolIcon
        name="magnifyingglass"
        size={20}
        tintColor="var(--colors-muted)"
      />
      <AppSymbolIcon name="camera" size={40} tintColor="var(--colors-muted)" />
    </div>
  );
}

/** Tints from the theme: foreground, primary text, and danger. */
export function Tints() {
  return (
    <div style={surface}>
      <AppSymbolIcon
        name="gearshape"
        size={24}
        tintColor="var(--colors-foreground)"
      />
      <AppSymbolIcon
        name="sparkles"
        size={24}
        tintColor="var(--colors-primary-text)"
      />
      <AppSymbolIcon
        name="exclamationmark.triangle.fill"
        size={24}
        tintColor="var(--colors-danger)"
      />
    </div>
  );
}

// Every name the component accepts, in symbol.tsx order.
const NAMES = [
  "xmark",
  "checkmark",
  "plus",
  "ellipsis",
  "arrow.up.right",
  "checkmark.circle.fill",
  "exclamationmark.triangle.fill",
  "exclamationmark.circle",
  "info.circle",
  "person.fill",
  "envelope",
  "message",
  "phone",
  "camera",
  "photo.on.rectangle",
  "photo.on.rectangle.angled",
  "photo.stack",
  "square.grid.2x2",
  "square.grid.2x2.fill",
  "star.fill",
  "heart",
  "play.rectangle",
  "play.fill",
  "rectangle.stack",
  "rectangle.stack.fill",
  "link",
  "safari",
  "map",
  "magnifyingglass",
  "bag",
  "square.and.arrow.up",
  "square.and.pencil",
  "sparkles",
  "trash",
  "doc.on.doc",
  "calendar",
  "arrow.up.right.square",
  "chevron.left",
  "chevron.right",
  "arrow.uturn.backward",
  "house.fill",
  "gearshape",
  "gearshape.fill",
  "arrow.2.circlepath",
  "arrow.clockwise",
  "speedometer",
  "viewfinder",
  "figure.run",
  "hand.tap",
  "tray.and.arrow.up",
  "arrow.up",
  "doc.text",
  "arrow.triangle.2.circlepath.camera",
] as const;

const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
  gap: 12,
  padding: 16,
  borderRadius: 12,
  background: "var(--colors-background)",
};
const item = {
  display: "flex",
  flexDirection: "column" as const,
  alignItems: "center",
  gap: 6,
};
const caption = {
  fontFamily: "var(--fonts-regular)",
  fontSize: 10,
  color: "var(--colors-muted)",
  textAlign: "center" as const,
  overflowWrap: "anywhere" as const,
};

/** The full icon vocabulary, labelled with the name to pass. */
export function IconSet() {
  return (
    <div style={grid}>
      {NAMES.map((name) => (
        <div key={name} style={item}>
          <AppSymbolIcon
            name={name}
            size={22}
            tintColor="var(--colors-foreground)"
          />
          <span style={caption}>{name}</span>
        </div>
      ))}
    </div>
  );
}
