import { ItemCardFace } from "@shelvr/native-ui";

// Layout glue: one column of the two-column home feed on the app's cream
// background. The 4px padding is the feed cell's (`ItemCard` adds it in the app).
const column = {
  width: 170,
  padding: 4,
  boxSizing: "content-box" as const,
  borderRadius: 12,
  background: "var(--colors-background)",
};

// A flat fill standing in for the saved image; no network, no real photos.
const fill = (color: string, width: number, height: number) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${color}"/></svg>`,
  )}`;

type Item = Parameters<typeof ItemCardFace>[0]["item"];
const save = (
  id: string,
  item: Omit<Item, "_id" | "status" | "tags"> & Partial<Item>,
) => ({ _id: id as Item["_id"], status: "ready", tags: [], ...item }) as Item;

/** A link save with its hero image: title, host and the overflow control. */
export function LinkWithImage() {
  return (
    <div style={column}>
      <ItemCardFace
        menuActions={[]}
        item={save("link-image", {
          type: "link",
          title: "Weeknight Miso Ramen",
          url: "https://example.com/recipes/weeknight-miso-ramen",
          imageUrl: fill("#c98b5b", 1200, 630),
          aspectRatio: 1.91,
          tags: ["recipes", "dinner"],
        })}
      />
    </div>
  );
}

/** A photo save: the image at its own ratio (clamped to 0.5–2), title only. */
export function Photo() {
  return (
    <div style={column}>
      <ItemCardFace
        menuActions={[]}
        item={save("photo", {
          type: "image",
          title: "Belém Tower",
          imageUrl: fill("#7f9aa8", 600, 800),
          aspectRatio: 0.75,
          tags: ["travel", "lisbon"],
        })}
      />
    </div>
  );
}

/** A note: no image, the text on the primary-soft face. */
export function Note() {
  return (
    <div style={column}>
      <ItemCardFace
        menuActions={[]}
        item={save("note", {
          type: "note",
          title: "Apartment Shopping Checklist",
          note: "Lamp, shelves, linen, and a reading chair.",
          tags: ["home", "shopping"],
        })}
      />
    </div>
  );
}

/** A link with no image: the muted text face with the link glyph. */
export function LinkWithoutImage() {
  return (
    <div style={column}>
      <ItemCardFace
        menuActions={[]}
        item={save("link-text", {
          type: "link",
          title: "The Value of Craft",
          url: "https://example.com/design/value-of-craft",
          tags: ["design", "reading"],
        })}
      />
    </div>
  );
}

/** A short-form video: 9:16 cover, the play badge with the author. */
export function ShortVideo() {
  return (
    <div style={column}>
      <ItemCardFace
        menuActions={[]}
        item={save("video", {
          type: "link",
          title: "Ten-minute miso ramen",
          url: "https://www.tiktok.com/@weeknightcook/video/7300000000000000000",
          author: "@weeknightcook",
          imageUrl: fill("#5d5348", 540, 960),
          tags: ["recipes", "dinner"],
        })}
      />
    </div>
  );
}

/** Suggested into a space: the sparkle badge, tappable to accept. */
export function Suggested() {
  return (
    <div style={column}>
      <ItemCardFace
        menuActions={[]}
        suggested
        onAcceptSuggestion={() => {}}
        item={save("suggested", {
          type: "link",
          title: "Weeknight Miso Ramen",
          url: "https://example.com/recipes/weeknight-miso-ramen",
          imageUrl: fill("#6f5a48", 1200, 630),
          aspectRatio: 1.91,
          tags: ["recipes", "dinner"],
        })}
      />
    </div>
  );
}

/** Still processing: the host stands in for the title, spinner in the corner. */
export function Processing() {
  return (
    <div style={column}>
      <ItemCardFace
        menuActions={[]}
        item={save("processing", {
          type: "link",
          status: "processing",
          url: "https://example.com/design/value-of-craft",
        })}
      />
    </div>
  );
}

/** A failed save: named by what went wrong, warning glyph in the corner. */
export function Failed() {
  return (
    <div style={column}>
      <ItemCardFace
        menuActions={[]}
        item={save("failed", {
          type: "link",
          status: "failed",
          failureReason: "not_found",
          url: "https://example.com/recipes/gone",
        })}
      />
    </div>
  );
}
