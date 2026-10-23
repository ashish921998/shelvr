import type { Id } from "@convex/_generated/dataModel";
import { createContext } from "react";

/** Deletes a save from its own page, under the name the header menu gives it. The item route provides it, so a save that can't be fixed offers a way out. */
export const DeleteActiveSaveContext = createContext<
  | { label: (id: Id<"items">) => string; remove: (id: Id<"items">) => void }
  | undefined
>(undefined);
