import { createContext } from "react";

/** Deletes the save on screen. The item route provides it, so a save that can't be fixed offers a way out. */
export const DeleteActiveSaveContext = createContext<(() => void) | undefined>(
  undefined,
);
