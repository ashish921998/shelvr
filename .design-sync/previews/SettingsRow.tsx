import { SettingsGroup, SettingsRow } from "@shelvr/native-ui";

// Layout glue only: the screen background and side margin. A row always sits
// inside a SettingsGroup, which draws the card around it.
const screen = {
  padding: 16,
  borderRadius: 12,
  background: "var(--colors-background)",
};

/** A row showing its current value beside the default chevron. */
export function WithValue() {
  return (
    <div style={screen}>
      <SettingsGroup>
        <SettingsRow
          label="Appearance"
          value="System"
          divider={false}
          onPress={() => {}}
        />
      </SettingsGroup>
    </div>
  );
}

/** `disabled` dims the row while its action runs. */
export function Disabled() {
  return (
    <div style={screen}>
      <SettingsGroup>
        <SettingsRow
          label="Restore Purchases"
          icon="arrow.clockwise"
          divider={false}
          disabled
          onPress={() => {}}
        />
      </SettingsGroup>
    </div>
  );
}
