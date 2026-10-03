import { ThemedText } from "@shelvr/native-ui";

// Layout glue only: the screen background and a stacked column.
const column = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 10,
  padding: 16,
  borderRadius: 12,
  background: "var(--colors-background)",
};

/** The display steps: Crimson Pro, for titles and headers. */
export function Display() {
  return (
    <div style={column}>
      <ThemedText variant="hero">Shelvr</ThemedText>
      <ThemedText variant="largeTitle">Save it for later</ThemedText>
      <ThemedText variant="sheetTitle">New space</ThemedText>
      <ThemedText variant="title">Weekly shelf</ThemedText>
      <ThemedText variant="header">Spaces</ThemedText>
      <ThemedText variant="displaySmall">Recipes</ThemedText>
    </div>
  );
}

/** The reading and body steps: Satoshi regular, medium, and bold. */
export function Body() {
  return (
    <div style={column}>
      <ThemedText variant="headline">App updates</ThemedText>
      <ThemedText variant="reader">
        The article body, set a step larger for long reading.
      </ThemedText>
      <ThemedText variant="body">
        Tap + to drop in a link, a photo, or a stray thought.
      </ThemedText>
      <ThemedText variant="bodyLabel">Appearance</ThemedText>
      <ThemedText variant="button">Keep going</ThemedText>
      <ThemedText variant="subhead">
        A few unopened saves every Sunday
      </ThemedText>
      <ThemedText variant="subheadLabel">Import from X</ThemedText>
      <ThemedText variant="subheadStrong">Weekly shelf</ThemedText>
      <ThemedText variant="footnote">
        Running the version this build shipped with.
      </ThemedText>
      <ThemedText variant="secondaryLabel">Not now</ThemedText>
    </div>
  );
}

/** The small steps: captions, labels, fine print, and the badge. */
export function Small() {
  return (
    <div style={column}>
      <ThemedText variant="caption">You’re on the latest version.</ThemedText>
      <ThemedText variant="label">Check for updates</ThemedText>
      <ThemedText variant="labelStrong">Restore Purchases</ThemedText>
      <ThemedText variant="captionLabel">recipes</ThemedText>
      <ThemedText variant="captionStrong">dinner</ThemedText>
      <ThemedText variant="finePrint">Terms of Service</ThemedText>
      <ThemedText variant="badge">SUGGESTED</ThemedText>
    </div>
  );
}
