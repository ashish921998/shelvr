import { SettingsGroup, SettingsRow } from "@shelvr/native-ui";

// Layout glue only: the screen background and side margin.
const screen = {
  padding: 16,
  borderRadius: 12,
  background: "var(--colors-background)",
};

/** Profile's list: a current value, then rows that open a screen or leave the app. */
export function Profile() {
  return (
    <div style={screen}>
      <SettingsGroup>
        <SettingsRow label="Appearance" value="System" divider={false} />
        <SettingsRow label="Import from X" onPress={() => {}} />
        <SettingsRow
          label="Send feedback"
          icon="arrow.up.right"
          onPress={() => {}}
        />
        <SettingsRow label="Settings" onPress={() => {}} />
      </SettingsGroup>
    </div>
  );
}

/** Settings' support and legal rows, each with its own trailing symbol. */
export function Support() {
  return (
    <div style={screen}>
      <SettingsGroup>
        <SettingsRow
          label="Restore Purchases"
          icon="arrow.clockwise"
          divider={false}
          onPress={() => {}}
        />
        <SettingsRow
          label="Contact Support"
          icon="arrow.up.right"
          onPress={() => {}}
        />
        <SettingsRow
          label="Terms of Service"
          icon="arrow.up.right"
          onPress={() => {}}
        />
        <SettingsRow
          label="Privacy Policy"
          icon="arrow.up.right"
          onPress={() => {}}
        />
      </SettingsGroup>
    </div>
  );
}
