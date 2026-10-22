import { AssetField, MediaType, Query, type Album } from "expo-media-library";
import { useCallback, useEffect, useRef, useState } from "react";

import { isReviewed } from "./storage";

const BATCH_SIZE = 24;

const PAGE_SIZE = 48;

export type TidyPhoto = {
  id: string;
  width: number | null;
  height: number | null;
  creationTime: number | null;
};

// expo-media-library 58 no longer exports `AssetMetadata` from the package root.
type AssetMetadata = Awaited<ReturnType<Query["exeForMetadata"]>>[number];

const toTidyPhoto = (asset: AssetMetadata): TidyPhoto => ({
  id: asset.id,
  width: asset.width,
  height: asset.height,
  creationTime: asset.creationTime,
});

type Params = {
  album: Album | null;
  sourceId: string;
  enabled: boolean;
};

export function usePhotoBatch({ album, sourceId, enabled }: Params) {
  const [batch, setBatch] = useState<TidyPhoto[] | null>(null);
  const [batchId, setBatchId] = useState(0);
  const [loadedSourceId, setLoadedSourceId] = useState<string | null>(null);
  const offsetRef = useRef(0);
  const exhaustedRef = useRef(false);
  const epochRef = useRef(0);

  const collectBatch = useCallback(
    async (epoch: number): Promise<TidyPhoto[]> => {
      const collected: TidyPhoto[] = [];
      while (collected.length < BATCH_SIZE && !exhaustedRef.current) {
        let query = new Query()
          .eq(AssetField.MEDIA_TYPE, MediaType.IMAGE)
          .orderBy({ key: AssetField.CREATION_TIME, ascending: false })
          .offset(offsetRef.current)
          .limit(PAGE_SIZE);
        if (album) {
          query = query.album(album);
        }
        const page = await query.exeForMetadata();

        if (epochRef.current !== epoch) return collected.reverse();

        let consumed = 0;
        let batchFull = false;
        for (const asset of page) {
          consumed += 1;
          if (!isReviewed(asset.id)) {
            collected.push(toTidyPhoto(asset));
            if (collected.length === BATCH_SIZE) {
              batchFull = true;
              break;
            }
          }
        }
        offsetRef.current += consumed;
        if (page.length < PAGE_SIZE) {
          exhaustedRef.current = true;
        } else if (batchFull) {
          exhaustedRef.current = false;
        }
      }
      return collected.reverse();
    },
    [album],
  );

  const loadNextBatch = useCallback(
    async (options?: { reset?: boolean }) => {
      if (options?.reset) {
        offsetRef.current = 0;
        exhaustedRef.current = false;
      }
      const collected = await collectBatch(epochRef.current);
      setBatch(collected);
      setBatchId((id) => id + 1);
      setLoadedSourceId(sourceId);
    },
    [collectBatch, sourceId],
  );

  useEffect(() => {
    if (!enabled) return;
    offsetRef.current = 0;
    exhaustedRef.current = false;
    epochRef.current += 1;
    loadNextBatch();
  }, [enabled, loadNextBatch]);

  const noteDeleted = useCallback((count: number) => {
    offsetRef.current = Math.max(0, offsetRef.current - count);
  }, []);

  const loading = loadedSourceId !== sourceId;

  return { batch, batchId, loading, loadNextBatch, noteDeleted };
}
