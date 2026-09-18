import { HeaderIconButton } from "@shelvr/native-ui";

// Layout glue: a header bar on the app's cream background. Icons, labels, and
// states are the ones the app's screens pass.
const bar = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "12px 16px",
  borderRadius: 12,
  background: "var(--colors-background)",
};
const group = { display: "flex", alignItems: "center", gap: 12 };
const noop = () => {};

/** Home's header: Profile on the left, Add save on the right. */
export function HomeHeader() {
  return (
    <div style={bar}>
      <HeaderIconButton icon="person.fill" label="Profile" onPress={noop} />
      <HeaderIconButton icon="plus" label="Add save" onPress={noop} />
    </div>
  );
}

/** Tidy's delete action with a pending count; counts above 99 show as 99+. */
export function WithBadge() {
  return (
    <div style={bar}>
      <HeaderIconButton
        icon="arrow.uturn.backward"
        label="Undo"
        onPress={noop}
      />
      <div style={group}>
        <HeaderIconButton
          icon="trash"
          label="Delete reviewed photos"
          badge={3}
          onPress={noop}
        />
        <HeaderIconButton
          icon="trash"
          label="Delete reviewed photos"
          badge={128}
          onPress={noop}
        />
      </div>
    </div>
  );
}

/** The add screen before anything is entered: Back, and Save disabled. */
export function Disabled() {
  return (
    <div style={bar}>
      <HeaderIconButton
        icon="chevron.left"
        label="Back to save options"
        onPress={noop}
      />
      <HeaderIconButton icon="checkmark" label="Save" disabled onPress={noop} />
    </div>
  );
}
