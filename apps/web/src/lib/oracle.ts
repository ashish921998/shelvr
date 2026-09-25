import type { LibraryRow, LibraryStats } from "@/lib/oracleLibrary";

// Mirrors OracleInput and OracleVerdict in apps/native/convex/model/oracle.ts,
// which validates every request; this side only builds them.
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
  persona: string;
  tagline: string;
  spaces: { name: string; reason: string }[];
  guesses: { label: string; why: string }[];
};

export type OracleInputProps = {
  busy: boolean;
  onSubmit: (input: OracleInput) => void;
};
