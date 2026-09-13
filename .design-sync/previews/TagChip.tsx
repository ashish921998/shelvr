import { TagChip } from "@shelvr/native-ui";

// Layout glue only: the app's cream background and a wrapping row.
const row = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: 8,
  padding: 16,
  borderRadius: 12,
  background: "var(--colors-background)",
};

/** The tags the classifier attached to a save, as listed on its detail screen. */
export function Tags() {
  return (
    <div style={row}>
      <TagChip label="recipes" />
      <TagChip label="dinner" />
    </div>
  );
}

/** `emphasized` swaps to the primary-soft fill. No screen sets it today. */
export function Emphasized() {
  return (
    <div style={row}>
      <TagChip label="recipes" emphasized />
      <TagChip label="dinner" />
    </div>
  );
}
