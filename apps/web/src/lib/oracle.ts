import type { LibraryRow, LibraryStats } from "@/lib/oracleLibrary";

export type OracleInput =
  | { kind: "links"; urls: string[] }
  | {
      kind: "screenshot";
      imageBase64: string;
      mediaType: "image/jpeg" | "image/png" | "image/webp";
    }
  | { kind: "tabs"; count: number; titles: string[] }
  | { kind: "library"; rows: LibraryRow[]; stats: LibraryStats };

export type OracleMode = OracleInput["kind"];

export type OracleVerdict = {
  shareCode?: string;
  persona: string;
  tagline: string;
  spaces: { name: string; reason: string }[];
  guesses: { label: string; why: string }[];
  score?: number;
  moreSpaces?: string[];
};

export type OracleInputProps = {
  busy: boolean;
  onSubmit: (input: OracleInput) => void;
};
