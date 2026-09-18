import { SuggestedBadge } from "@shelvr/native-ui";

// Layout glue: a stand-in for the photo the badge always sits on. A mid tone,
// because the web glass fallback is a faint white circle that vanishes on a
// light surface. On web the circle is translucent, not liquid glass.
const tile = (size: number) => ({
  position: "relative" as const,
  width: size,
  height: size,
  borderRadius: 11,
  background: "linear-gradient(160deg, #7a6a55 0%, #4f4336 100%)",
});
const corner = (inset: number) => ({
  position: "absolute" as const,
  top: inset,
  right: inset,
});
const surface = {
  display: "flex",
  alignItems: "flex-start",
  gap: 16,
  padding: 16,
  borderRadius: 12,
  background: "var(--colors-background)",
};

/** On a feed card: default 26px, tappable to accept the suggestion. */
export function OnCard() {
  return (
    <div style={surface}>
      <div style={tile(160)}>
        <div style={corner(10)}>
          <SuggestedBadge onPress={() => {}} />
        </div>
      </div>
    </div>
  );
}

/** In the spaces list: 22px, display only. */
export function SpacesList() {
  return (
    <div style={surface}>
      <div style={tile(96)}>
        <div style={corner(6)}>
          <SuggestedBadge size={22} />
        </div>
      </div>
    </div>
  );
}
