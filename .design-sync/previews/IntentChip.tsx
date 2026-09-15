import { IntentChip } from "@shelvr/native-ui";

// Layout glue: the item detail screen's cream background and a wrapping row.
// Labels are written by the classifier per save; these are representative.
const row = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: 8,
  padding: 16,
  borderRadius: 12,
  background: "var(--colors-background)",
};
const noop = () => {};

/** The actions offered on a saved recipe (labels from convex/devFixtures.ts). */
export function Recipe() {
  return (
    <div style={row}>
      <IntentChip kind="open_url" label="Open recipe" onPress={noop} />
      <IntentChip kind="web_search" label="Find recipes" onPress={noop} />
    </div>
  );
}

/** Every intent kind, each with the icon the app maps to it. */
export function AllKinds() {
  return (
    <div style={row}>
      <IntentChip kind="open_url" label="Open recipe" onPress={noop} />
      <IntentChip kind="web_search" label="Find recipes" onPress={noop} />
      <IntentChip kind="open_maps" label="Open in Maps" onPress={noop} />
      <IntentChip kind="call" label="Call the restaurant" onPress={noop} />
      <IntentChip kind="email" label="Email the host" onPress={noop} />
      <IntentChip kind="message" label="Text Sam" onPress={noop} />
      <IntentChip kind="add_event" label="Add to calendar" onPress={noop} />
      <IntentChip kind="copy" label="Copy discount code" onPress={noop} />
    </div>
  );
}
