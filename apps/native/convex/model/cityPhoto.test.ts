import { describe, expect, it } from "vitest";
import {
  CITY_PHOTO_MISSING_RETRY_MS,
  CITY_PHOTO_RETRY_MS,
  commonsThumbUrl,
  isPhotoFile,
  isPlacePage,
  parseImageClaim,
  parseSummary,
  shouldLookUp,
  summaryTitle,
  widenedThumbnail,
} from "./cityPhoto";

describe("summaryTitle", () => {
  it("turns a city name into a Wikipedia title", () => {
    expect(summaryTitle("  New  York ")).toBe("New_York");
    expect(summaryTitle("São Paulo")).toBe("S%C3%A3o_Paulo");
  });
});

describe("isPlacePage", () => {
  const page = (type: string, description?: string) =>
    parseSummary({ type, description, title: "X" })!;

  it("accepts an ordinary article about a city", () => {
    expect(
      isPlacePage(page("standard", "City in Kyoto Prefecture, Japan")),
    ).toBe(true);
  });

  it("refuses a disambiguation page or an article about a namesake", () => {
    expect(isPlacePage(page("disambiguation"))).toBe(false);
    expect(isPlacePage(page("standard", "2011 film by Woody Allen"))).toBe(
      false,
    );
    expect(isPlacePage(page("standard", "Studio album by Taylor Swift"))).toBe(
      false,
    );
  });
});

describe("parseSummary", () => {
  it("reads the fields the lookup needs and ignores junk", () => {
    expect(
      parseSummary({
        type: "standard",
        title: "Kyoto",
        description: "City in Japan",
        wikibase_item: "Q34600",
        thumbnail: { source: "https://upload.wikimedia.org/a/320px-K.jpg" },
      }),
    ).toEqual({
      type: "standard",
      title: "Kyoto",
      description: "City in Japan",
      wikibaseItem: "Q34600",
      thumbnail: "https://upload.wikimedia.org/a/320px-K.jpg",
    });
    expect(parseSummary("nope")).toBeNull();
  });
});

describe("parseImageClaim", () => {
  const claims = (...files: string[]) => ({
    claims: {
      P18: files.map((value) => ({ mainsnak: { datavalue: { value } } })),
    },
  });

  it("takes the first photo and skips maps, flags and montages", () => {
    expect(
      parseImageClaim(
        claims("Kyoto montage.jpg", "Flag of Kyoto.svg", "Kiyomizu-dera.jpg"),
      ),
    ).toBe("Kiyomizu-dera.jpg");
  });

  it("has nothing for an entity without a photo", () => {
    expect(
      parseImageClaim(claims("Location map of Kyoto.png")),
    ).toBeUndefined();
    expect(parseImageClaim({ claims: {} })).toBeUndefined();
    expect(parseImageClaim(null)).toBeUndefined();
  });
});

describe("isPhotoFile", () => {
  it("allows JPEG and PNG photos only", () => {
    expect(isPhotoFile("Tbilisi old town.JPG")).toBe(true);
    expect(isPhotoFile("Skyline.png")).toBe(true);
    expect(isPhotoFile("Coat of arms of Rome.svg.png")).toBe(false);
    expect(isPhotoFile("Rome.tif")).toBe(false);
    expect(isPhotoFile("Paris collage.jpg")).toBe(false);
  });
});

describe("commonsThumbUrl", () => {
  it("builds the hashed thumbnail path Commons serves", () => {
    expect(commonsThumbUrl("Kiyomizu dera (2).jpg", "ab12cd")).toBe(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Kiyomizu_dera_(2).jpg/960px-Kiyomizu_dera_(2).jpg",
    );
  });
});

describe("widenedThumbnail", () => {
  it("asks for a wider copy of the lead thumbnail", () => {
    expect(
      widenedThumbnail(
        "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/K.jpg/320px-K.jpg",
      ),
    ).toBe(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/K.jpg/960px-K.jpg",
    );
  });

  it("drops Wikipedia's tracking query before reading the file name", () => {
    expect(
      widenedThumbnail(
        "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Texas_medical_center.jpg/330px-Texas_medical_center.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail",
      ),
    ).toBe(
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Texas_medical_center.jpg/960px-Texas_medical_center.jpg",
    );
  });

  it("skips a lead image that is a map or not a thumbnail", () => {
    expect(
      widenedThumbnail(
        "https://upload.wikimedia.org/thumb/a/ab/Map_of_X.png/320px-Map_of_X.png",
      ),
    ).toBeUndefined();
    expect(
      widenedThumbnail("https://upload.wikimedia.org/K.jpg"),
    ).toBeUndefined();
    expect(widenedThumbnail(undefined)).toBeUndefined();
  });
});

describe("shouldLookUp", () => {
  const now = 10 * CITY_PHOTO_MISSING_RETRY_MS;

  it("looks up a new city and never a found one again", () => {
    expect(shouldLookUp(null, now)).toBe(true);
    expect(shouldLookUp({ status: "found", checkedAt: 0 }, now)).toBe(false);
  });

  it("retries a failure after a day and a miss after a month", () => {
    const dayAgo = now - CITY_PHOTO_RETRY_MS - 1;
    expect(shouldLookUp({ status: "failed", checkedAt: now - 1 }, now)).toBe(
      false,
    );
    expect(shouldLookUp({ status: "failed", checkedAt: dayAgo }, now)).toBe(
      true,
    );
    expect(shouldLookUp({ status: "pending", checkedAt: dayAgo }, now)).toBe(
      true,
    );
    expect(shouldLookUp({ status: "missing", checkedAt: dayAgo }, now)).toBe(
      false,
    );
    expect(
      shouldLookUp(
        { status: "missing", checkedAt: now - CITY_PHOTO_MISSING_RETRY_MS - 1 },
        now,
      ),
    ).toBe(true);
  });
});
