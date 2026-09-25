import { ImageResponse } from "next/og";

import { isLens, LENSES } from "@/lib/reveal/lenses";
import {
  byLens,
  type LensTable,
  type Reveal,
  revealHeadline,
} from "@/lib/reveal/schema";
import { decodeReveal } from "@/lib/reveal/shareCode";

const SIZE = { width: 1200, height: 630 };
const PAPER = "#faf6ee";
const INK = "#2b2418";
const EMBER = "#e6a23c";
const EMBER_DEEP = "#9a6416";

type CardBody = { lines: string[]; palette?: string[] };

const BODIES: LensTable<CardBody> = {
  era: (r) => ({ lines: [r.tagline] }),
  roast: (r) => ({ lines: r.lines.slice(1, 3) }),
  taste: (r) => ({
    lines: [r.description, r.keywords.join(" · ")],
    palette: r.palette,
  }),
  find: (r) => ({
    lines: r.matches.map((m) => `${m.guess} (${m.confidence} confidence)`),
  }),
};

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function Card({ reveal }: { reveal?: Reveal }) {
  const headline = reveal ? clip(revealHeadline(reveal), 120) : "Shelvr";
  const body: CardBody = reveal
    ? byLens(BODIES, reveal)
    : { lines: ["A quieter place for everything interesting."] };
  return (
    <div
      style={{
        ...SIZE,
        display: "flex",
        flexDirection: "column",
        padding: 72,
        background: PAPER,
        color: INK,
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 26,
          letterSpacing: 5,
          textTransform: "uppercase",
          color: EMBER_DEEP,
        }}
      >
        {reveal ? LENSES[reveal.lens].name : "Save it for later"}
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 28,
          fontFamily: "serif",
          fontSize: headline.length > 60 ? 54 : 76,
          lineHeight: 1.1,
        }}
      >
        {headline}
      </div>
      {body.lines.slice(0, 3).map((line, index) => (
        <div
          key={index}
          style={{
            display: "flex",
            marginTop: 20,
            fontSize: 30,
            lineHeight: 1.35,
          }}
        >
          {clip(line, 150)}
        </div>
      ))}
      {body.palette && (
        <div
          style={{
            display: "flex",
            marginTop: 32,
            height: 72,
            border: "2px solid #dfd2bb",
          }}
        >
          {body.palette.map((color, index) => (
            <div key={index} style={{ flex: 1, background: color }} />
          ))}
        </div>
      )}
      <div
        style={{
          display: "flex",
          marginTop: "auto",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 28,
        }}
      >
        <div style={{ display: "flex", fontFamily: "serif", fontSize: 40 }}>
          shelvr
        </div>
        <div style={{ display: "flex", color: EMBER_DEEP }}>
          {reveal ? `${LENSES[reveal.lens].shareVerb} →` : ""}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: SIZE.width,
          height: 12,
          background: EMBER,
        }}
      />
    </div>
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ lens: string }> },
) {
  const { lens } = await params;
  const code = new URL(request.url).searchParams.get("c") ?? "";
  const reveal = isLens(lens) ? decodeReveal(code) : undefined;
  return new ImageResponse(
    <Card reveal={reveal?.lens === lens ? reveal : undefined} />,
    SIZE,
  );
}
