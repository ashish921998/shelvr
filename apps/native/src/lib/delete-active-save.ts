import type { Id } from "@convex/_generated/dataModel";
import { createContext } from "react";

/** Deletes a save from its own page. The item route provides it, so a save that can't be fixed offers a way out. */
export const DeleteActiveSaveContext = createContext<
  ((id: Id<"items">) => void) | undefined
>(undefined);
