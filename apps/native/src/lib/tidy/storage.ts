import { createMMKV } from "react-native-mmkv";

const store = createMMKV({ id: "tidy" });

const key = (assetId: string) => `reviewed:${assetId}`;

export function isReviewed(assetId: string): boolean {
  return store.contains(key(assetId));
}

export function markReviewed(assetIds: string[]) {
  for (const id of assetIds) {
    store.set(key(id), true);
  }
}

export function unmarkReviewed(assetId: string) {
  store.remove(key(assetId));
}

const SELECTED_ALBUM_KEY = "selectedAlbumId";

export function getSelectedAlbumId(): string | null {
  return store.getString(SELECTED_ALBUM_KEY) ?? null;
}

export function setSelectedAlbumId(albumId: string | null) {
  if (albumId === null) {
    store.remove(SELECTED_ALBUM_KEY);
  } else {
    store.set(SELECTED_ALBUM_KEY, albumId);
  }
}
