import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { Asset } from "expo-media-library";
import { useCallback, useRef, useState } from "react";

import type { TidyAction } from "./card-animation";
import { isReviewed, markReviewed, unmarkReviewed } from "./storage";
import type { TidyPhoto } from "./use-photo-batch";
import { useSaveImages } from "@/lib/use-save-image";

type HistoryEntry = {
  index: number;
  photo: TidyPhoto;
  action: TidyAction;
  itemId?: Promise<Id<"items"> | null>;
};

export type TidyCounts = {
  kept: number;
  deleted: number;
  saved: number;
};

const mimeFromUri = (uri: string): string => {
  const lower = uri.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".heic") || lower.endsWith(".heif")) return "image/heic";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
};

type Params = {
  batch: TidyPhoto[];
  noteDeleted: (count: number) => void;
};

export function useTidyActions({ batch, noteDeleted }: Params) {
  const saveImages = useSaveImages();
  const deleteItem = useMutation(api.items.deleteItem);

  const [topIndex, setTopIndex] = useState(batch.length - 1);
  const [pendingDeleteCount, setPendingDeleteCount] = useState(0);
  const [counts, setCounts] = useState<TidyCounts>({
    kept: 0,
    deleted: 0,
    saved: 0,
  });
  const [canUndo, setCanUndo] = useState(false);

  const pendingDeletesRef = useRef<TidyPhoto[]>([]);
  const historyRef = useRef<HistoryEntry[]>([]);

  const startSave = useCallback(
    (photo: TidyPhoto): Promise<Id<"items"> | null> =>
      (async () => {
        const asset = new Asset(photo.id);
        const uri = await asset.getUri();
        const location = await asset.getLocation().catch(() => null);
        const [result] = await saveImages(
          [
            {
              image: {
                uri,
                width: photo.width ?? undefined,
                height: photo.height ?? undefined,
                mimeType: mimeFromUri(uri),
                capturedAt: photo.creationTime ?? undefined,
                latitude: location?.latitude,
                longitude: location?.longitude,
              },
            },
          ],
          { saveSource: "photo_import" },
        );
        if (result.status === "saved") {
          return result.itemId;
        }
        console.warn("Tidy save failed", result.stage, result.operationId);
        unmarkReviewed(photo.id);
        return null;
      })().catch((error) => {
        console.warn("Tidy save failed", error);
        unmarkReviewed(photo.id);
        return null;
      }),
    [saveImages],
  );

  const onDecision = useCallback(
    (index: number, action: TidyAction) => {
      const photo = batch[index];
      if (!photo) return;

      const entry: HistoryEntry = { index, photo, action };

      switch (action) {
        case "keep":
          markReviewed([photo.id]);
          setCounts((c) => ({ ...c, kept: c.kept + 1 }));
          break;
        case "delete":
          pendingDeletesRef.current.push(photo);
          setPendingDeleteCount(pendingDeletesRef.current.length);
          break;
        case "save":
          markReviewed([photo.id]);
          setCounts((c) => ({ ...c, saved: c.saved + 1 }));
          entry.itemId = startSave(photo);
          break;
      }

      historyRef.current.push(entry);
      setCanUndo(true);
      setTopIndex(index - 1);
    },
    [batch, startSave],
  );

  const undo = useCallback((): number | null => {
    const entry = historyRef.current.pop();
    if (!entry) return null;

    switch (entry.action) {
      case "keep":
        unmarkReviewed(entry.photo.id);
        setCounts((c) => ({ ...c, kept: c.kept - 1 }));
        break;
      case "delete":
        pendingDeletesRef.current.pop();
        setPendingDeleteCount(pendingDeletesRef.current.length);
        break;
      case "save":
        if (isReviewed(entry.photo.id)) {
          unmarkReviewed(entry.photo.id);
        }
        setCounts((c) => ({ ...c, saved: c.saved - 1 }));
        entry.itemId?.then((itemId) => {
          if (itemId) deleteItem({ id: itemId });
        });
        break;
    }

    setCanUndo(historyRef.current.length > 0);
    setTopIndex(entry.index);
    return entry.index;
  }, [deleteItem]);

  const commitDeletes = useCallback(async () => {
    const queue = pendingDeletesRef.current;
    if (queue.length === 0) return;

    pendingDeletesRef.current = [];
    setPendingDeleteCount(0);

    const committed = new Set(queue.map((photo) => photo.id));
    const lastDeleted = Math.min(
      ...historyRef.current
        .filter((h) => h.action === "delete" && committed.has(h.photo.id))
        .map((h) => h.index),
    );

    try {
      await Asset.delete(queue.map((photo) => new Asset(photo.id)));
      markReviewed(queue.map((photo) => photo.id));
      noteDeleted(queue.length);
      setCounts((c) => ({ ...c, deleted: c.deleted + queue.length }));
      historyRef.current = historyRef.current.filter(
        (h) => h.index < lastDeleted,
      );
      setCanUndo(historyRef.current.length > 0);
    } catch (error) {
      console.warn("Tidy delete commit skipped", error);
      pendingDeletesRef.current = queue;
      setPendingDeleteCount(queue.length);
    }
  }, [noteDeleted]);

  return {
    topIndex,
    counts,
    pendingDeleteCount,
    canUndo,
    onDecision,
    undo,
    commitDeletes,
  };
}
