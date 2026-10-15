import { Button } from "@shelvr/native-ui";

// Layout glue only: the screen background and the side margin a screen gives
// its main action. Button stretches to its parent's width.
const screen = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 12,
  padding: 16,
  borderRadius: 12,
  background: "var(--colors-background)",
};

/** A screen's one main step, as Tidy's finish screen shows it. */
export function Primary() {
  return (
    <div style={screen}>
      <Button title="Keep going" onPress={() => {}} />
    </div>
  );
}

/** `loading` dims the capsule and keeps the label, so nothing reflows. */
export function Loading() {
  return (
    <div style={screen}>
      <Button title="Keep going" loading onPress={() => {}} />
    </div>
  );
}

/** `disabled` drops to the theme's disabled opacity. */
export function Disabled() {
  return (
    <div style={screen}>
      <Button title="Keep going" disabled onPress={() => {}} />
    </div>
  );
}
