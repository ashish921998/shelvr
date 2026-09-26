import { ImageResponse } from "next/og";

import { decodeSharedVerdict, type SharedVerdict } from "@/lib/oracleShare";

// The link preview is 1200×630. The story cut is 9:16, for saving to the
// camera roll and posting to Stories.
const SIZES = {
  link: { width: 1200, height: 630 },
  story: { width: 1080, height: 1920 },
} as const;
type Format = keyof typeof SIZES;

const PAPER = "#faf6ee";
const INK = "#2b2418";
const EMBER = "#e6a23c";
const EMBER_DEEP = "#9a6416";

function Score({ score, story }: { score: number; story: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        marginTop: story ? 72 : 28,
        width: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          fontSize: story ? 40 : 26,
        }}
      >
        <div style={{ display: "flex", color: EMBER_DEEP }}>Someday score</div>
        <div
          style={{
            display: "flex",
            fontFamily: "serif",
            fontSize: story ? 120 : 56,
          }}
        >
          {`${score}%`}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          marginTop: story ? 20 : 10,
          width: "100%",
          height: story ? 28 : 16,
          borderRadius: 999,
          background: "#efe6d4",
        }}
      >
        <div
          style={{
            display: "flex",
            width: `${score}%`,
            height: "100%",
            borderRadius: 999,
            background: EMBER,
          }}
        />
      </div>
    </div>
  );
}

function Card({
  verdict,
  format,
}: {
  verdict?: SharedVerdict;
  format: Format;
}) {
  const size = SIZES[format];
  const story = format === "story";
  const headline = verdict?.persona ?? "The Shelvr Oracle";
  const line =
    verdict?.tagline ?? "Show me what you saved and I’ll tell you who you are.";
  const headlineSize = story
    ? headline.length > 40
      ? 96
      : 128
    : headline.length > 40
      ? 60
      : 80;
  return (
    <div
      style={{
        ...size,
        display: "flex",
        flexDirection: "column",
        padding: story ? "160px 96px 120px" : 72,
        background: PAPER,
        color: INK,
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: story ? 40 : 26,
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
          marginTop: story ? 40 : 24,
          fontFamily: "serif",
          fontSize: headlineSize,
          lineHeight: 1.1,
        }}
      >
        {headline}
      </div>
      <div
        style={{
          display: "flex",
          marginTop: story ? 36 : 20,
          fontSize: story ? 48 : 32,
          lineHeight: 1.35,
        }}
      >
        {line}
      </div>
      {verdict?.score !== undefined && (
        <Score score={verdict.score} story={story} />
      )}
      {verdict && verdict.spaces.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: story ? "column" : "row",
            alignItems: "flex-start",
            marginTop: story ? 72 : 28,
            gap: story ? 24 : 16,
          }}
        >
          {verdict.spaces.map((space, index) => (
            <div
              key={index}
              style={{
                display: "flex",
                padding: story ? "18px 36px" : "12px 22px",
                borderRadius: 999,
                border: `${story ? 3 : 2}px solid ${EMBER}`,
                fontSize: story ? 44 : 26,
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
          fontSize: story ? 44 : 28,
        }}
      >
        <div
          style={{
            display: "flex",
            fontFamily: "serif",
            fontSize: story ? 64 : 40,
          }}
        >
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
          width: size.width,
          height: story ? 20 : 12,
          background: EMBER,
        }}
      />
    </div>
  );
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const format: Format = params.get("format") === "story" ? "story" : "link";
  const verdict = decodeSharedVerdict(params.get("c") ?? "");
  return new ImageResponse(
    <Card verdict={verdict} format={format} />,
    SIZES[format],
  );
}
