import { translate } from "../i18n-core";
import { useAppLocale } from "@/lib/i18n";
import { Album } from "expo-media-library";
import { useEffect, useMemo, useState } from "react";

export const ALL_PHOTOS_ID = "__all__";

export type TidySource = {
  id: string;
  title: string;
  album: Album | null;
};

const ALL_PHOTOS: TidySource = {
  id: ALL_PHOTOS_ID,
  title: "",
  album: null,
};

/** All Photos first, then the named albums by title. */
export function useAlbums(enabled: boolean): [TidySource, ...TidySource[]] {
  const locale = useAppLocale();
  const [albums, setAlbums] = useState<TidySource[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    (async () => {
      try {
        const albums = await Album.getAll();
        const settled = await Promise.allSettled(
          albums.map(async (album) => ({
            id: album.id,
            title: await album.getTitle(),
            album,
          })),
        );
        const named = settled.flatMap((result) =>
          result.status === "fulfilled" ? [result.value] : [],
        );
        if (!cancelled) {
          const sorted = named
            .filter((s) => s.title)
            .sort((a, b) => a.title.localeCompare(b.title));
          setAlbums(sorted);
        }
      } catch (error) {
        console.warn("Tidy: failed to load albums", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return useMemo<[TidySource, ...TidySource[]]>(
    () => [
      { ...ALL_PHOTOS, title: translate(locale, "albums.allPhotos") },
      ...albums,
    ],
    [albums, locale],
  );
}
