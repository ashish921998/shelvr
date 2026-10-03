import { ImageResponse } from "next/og";

import { verifiedVerdict } from "@/lib/oracleProof";
import { authorizeRequestBody } from "@/lib/requestBody";
import { type SharedVerdict } from "@/lib/oracleShare";

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

function Bar({ score, height }: { score: number; height: number }) {
  return (
    <div
      style={{
        display: "flex",
        flexGrow: 1,
        flexBasis: 0,
        minWidth: 0,
        height,
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
  );
}

function Score({ score, story }: { score: number; story: boolean }) {
  if (!story) {
    // One row, so the 630px link card still fits a two-line persona, a long
    // tagline and three spaces.
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 20,
          marginTop: 20,
          width: "100%",
          fontSize: 24,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", flexShrink: 0, color: EMBER_DEEP }}>
          Someday score
        </div>
        <Bar score={score} height={14} />
        <div
          style={{
            display: "flex",
            flexShrink: 0,
            fontFamily: "serif",
            fontSize: 40,
          }}
        >
          {`${score}%`}
        </div>
      </div>
    );
  }
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        marginTop: 72,
        width: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          fontSize: 40,
        }}
      >
        <div style={{ display: "flex", color: EMBER_DEEP }}>Someday score</div>
        <div style={{ display: "flex", fontFamily: "serif", fontSize: 120 }}>
          {`${score}%`}
        </div>
      </div>
      <div style={{ display: "flex", marginTop: 20, width: "100%" }}>
        <Bar score={score} height={28} />
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
      ? 52
      : 76;
  return (
    <div
      style={{
        ...size,
        display: "flex",
        flexDirection: "column",
        padding: story ? "160px 96px 120px" : "56px 72px",
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
          flexShrink: 0,
        }}
      >
        {headline}
      </div>
      <div
        style={{
          display: "flex",
          marginTop: story ? 36 : 16,
          fontSize: story ? 48 : 28,
          lineHeight: 1.35,
          flexShrink: 0,
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
            marginTop: story ? 72 : 20,
            gap: story ? 24 : 16,
            flexShrink: 0,
          }}
        >
          {verdict.spaces.map((space, index) => (
            <div
              key={index}
              style={{
                display: "flex",
                padding: story ? "18px 36px" : "10px 20px",
                borderRadius: 999,
                border: `${story ? 3 : 2}px solid ${EMBER}`,
                fontSize: story ? 44 : 24,
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
  if (
    [...params.keys()].some((key) => key !== "c" && key !== "format") ||
    params.getAll("c").length !== 1 ||
    params.getAll("format").length > 1 ||
    (params.has("format") &&
      !["story", "link"].includes(params.get("format") ?? ""))
  )
    return new Response(null, { status: 400 });
  if (!process.env.WAITLIST_SHARED_SECRET)
    return new Response(null, { status: 503 });
  const verdict = await verifiedVerdict(params.get("c") ?? "");
  if (!verdict) return new Response(null, { status: 404 });
  const refused = await authorizeRequestBody(request, "oracle-image");
  if (refused) return refused;
  return new ImageResponse(
    <Card verdict={verdict} format={format} />,
    SIZES[format],
  );
}
