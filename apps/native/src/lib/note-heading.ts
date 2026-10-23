const NOTE_TITLE_CUT = 80;

const FILLER_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "my",
  "of",
  "the",
  "to",
]);

function headingWords(text: string): Set<string> {
  const words = text.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return new Set(
    words.filter((word) => word.length > 1 && !FILLER_WORDS.has(word)),
  );
}

/**
 * How a note's title repeats the note's first line: "cut" when it is that line
 * cut to the 80 characters a first-line title keeps, "same" when it is the line
 * in other case, order or punctuation, and undefined when it says something else.
 */
export function firstLineRepeat(
  note: string,
  title: string,
): "cut" | "same" | undefined {
  const [first = ""] = note.trim().split("\n");
  const line = first.trim();
  const cut = title.trim();
  if (
    line.length > NOTE_TITLE_CUT &&
    line.slice(0, NOTE_TITLE_CUT).trim() === cut
  ) {
    return "cut";
  }
  const heading = headingWords(line);
  const named = headingWords(title);
  const same =
    line === cut ||
    (heading.size > 0 &&
      heading.size === named.size &&
      [...heading].every((word) => named.has(word)));
  return same ? "same" : undefined;
}
