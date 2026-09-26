import { ImageResponse } from "next/og";

import { decodeSharedVerdict, type SharedVerdict } from "@/lib/oracleShare";

const SIZE = { width: 1200, height: 630 };
const PAPER = "#faf6ee";
const INK = "#2b2418";
const EMBER = "#e6a23c";
const EMBER_DEEP = "#9a6416";

function Card({ verdict }: { verdict?: SharedVerdict }) {
  const headline = verdict?.persona ?? "The Shelvr Oracle";
  const line =
    verdict?.tagline ??
    "Show me three things you saved and I’ll tell you who you are.";
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
        The oracle says I’m
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 24,
          fontFamily: "serif",
          fontSize: headline.length > 40 ? 60 : 80,
          lineHeight: 1.1,
        }}
      >
        {headline}
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 20,
          fontSize: 32,
          lineHeight: 1.35,
        }}
      >
        {line}
      </div>
      {verdict && verdict.spaces.length > 0 && (
        <div style={{ display: "flex", marginTop: 32, gap: 16 }}>
          {verdict.spaces.map((space, index) => (
            <div
              key={index}
              style={{
                display: "flex",
                padding: "12px 22px",
                borderRadius: 999,
                border: `2px solid ${EMBER}`,
                fontSize: 26,
              }}
            >
              {space.name}
            </div>
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
          What are you? →
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

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("c") ?? "";
  return new ImageResponse(<Card verdict={decodeSharedVerdict(code)} />, SIZE);
}
