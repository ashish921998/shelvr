import { ScreenLoader } from "@shelvr/native-ui";

// ScreenLoader fills its parent (flex: 1) with the background colour and centres
// a spinner, so the cell gives it a phone-width frame. `label` is read by screen
// readers only; nothing visible changes with it.
const frame = {
  display: "flex",
  flexDirection: "column" as const,
  width: 390,
  height: 240,
  borderRadius: 12,
  overflow: "hidden",
};

/** Home while the shelf loads. */
export function Default() {
  return (
    <div style={frame}>
      <ScreenLoader label="Warming your shelf" />
    </div>
  );
}
