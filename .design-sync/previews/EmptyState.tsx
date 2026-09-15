import { EmptyState } from "@shelvr/native-ui";

// EmptyState fills its parent (flex: 1) and centres itself, so each cell gives
// it a phone-sized frame. The width is fixed: the messages carry authored line
// breaks sized for a phone, and a narrower frame re-wraps them. Copy is the app's own.
const frame = {
  display: "flex",
  flexDirection: "column" as const,
  width: 390,
  height: 300,
  borderRadius: 12,
  background: "var(--colors-background)",
};

/** Home, before the first save. */
export function HomeTab() {
  return (
    <div style={frame}>
      <EmptyState
        title="Save it for later"
        message={
          "Tap + to drop in a link, a photo, or a stray thought.\nShelvr keeps it warm until you need it."
        }
      />
    </div>
  );
}

/** Spaces, before the first space exists. */
export function SpacesTab() {
  return (
    <div style={frame}>
      <EmptyState
        title="Make a space"
        message={
          "Spaces are shelves for a theme — design inspiration,\nrecipes, gift ideas. Shelvr suggests saves that fit;\nyou choose what sticks."
        }
      />
    </div>
  );
}

/** Map, when no save carries a location. */
export function MapTab() {
  return (
    <div style={frame}>
      <EmptyState
        title="Nothing on the map yet"
        message={
          "Photos you save keep the place they were taken.\nNew saves with location data will show up here."
        }
      />
    </div>
  );
}
