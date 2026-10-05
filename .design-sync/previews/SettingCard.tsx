import { SettingCard } from "@shelvr/native-ui";

// Layout glue only: the Settings screen's background and side margin.
const screen = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 12,
  padding: 16,
  borderRadius: 12,
  background: "var(--colors-background)",
};

// Stands in for the native Switch the app passes as `accessory`
// (ui/animated-switch.tsx), which has no web build.
const track = {
  width: 51,
  height: 31,
  borderRadius: 999,
  background: "var(--colors-primary)",
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  padding: 2,
  boxSizing: "border-box" as const,
  flexShrink: 0,
};
const thumb = { width: 27, height: 27, borderRadius: 999, background: "#fff" };
const Toggle = () => (
  <div style={track}>
    <div style={thumb} />
  </div>
);

/** A setting with an inline control, as the notification settings use it. */
export function WithAccessory() {
  return (
    <div style={screen}>
      <SettingCard
        title="Weekly shelf"
        description="A few unopened saves every Sunday"
        accessory={<Toggle />}
      />
      <SettingCard
        title="Save reminders"
        description="An article you haven’t read or a recipe to try, never more than once a day"
        accessory={<Toggle />}
      />
    </div>
  );
}

/** A setting with a text action and a status note, as App updates uses it. */
export function WithAction() {
  return (
    <div style={screen}>
      <SettingCard
        title="App updates"
        description="Running the version this build shipped with."
        action={{ label: "Check for updates", onPress: () => {} }}
        note="You’re on the latest version."
      />
    </div>
  );
}
