import { createContext, useContext, useState, type ReactNode } from "react";

export type SavedSection = "places" | "lists";

const savedSectionContext = createContext<{
  section: SavedSection;
  selectSection: (section: SavedSection) => void;
} | null>(null);

export function SavedSectionProvider({ children }: { children: ReactNode }) {
  const [section, selectSection] = useState<SavedSection>("places");
  return (
    <savedSectionContext.Provider value={{ section, selectSection }}>
      {children}
    </savedSectionContext.Provider>
  );
}

export function useSavedSection() {
  const value = useContext(savedSectionContext);
  if (value === null) throw new Error("Missing SavedSectionProvider");
  return value;
}
