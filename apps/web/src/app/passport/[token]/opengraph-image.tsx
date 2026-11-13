import { ImageResponse } from "next/og";

import {
  loadPassport,
  passportCities,
  passportSummary,
  passportTitle,
} from "@/lib/passportShare";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "A Shelvr passport";

const PAPER = "#faf6ee";
const INK = "#2b2418";
const MUTED = "#6f6455";
const AMBER = "#935d09";
const MAX_ROWS = 4;

type ImageProps = { params: Promise<{ token: string }> };

export default async function Image({ params }: ImageProps) {
  const { token } = await params;
  const { passport } = await loadPassport(token, "preview");
  const cities = passport ? passportCities(passport.stamps) : [];
  const shown = cities.slice(0, MAX_ROWS);
  const more = cities.length - shown.length;

  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        padding: "56px 72px",
        background: PAPER,
        color: INK,
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 24,
          letterSpacing: 4,
          textTransform: "uppercase",
          color: AMBER,
        }}
      >
        Out of the group chat
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 12,
          fontFamily: "serif",
          fontSize: 76,
          lineHeight: 1.05,
        }}
      >
        {passport ? passportTitle(passport) : "A Shelvr passport"}
      </div>
      <div
        style={{ display: "flex", marginTop: 14, fontSize: 32, color: MUTED }}
      >
        {passport ? passportSummary(passport) : "Places we finally went to"}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 14,
          marginTop: 34,
        }}
      >
        {shown.map((group, index) => (
          <div
            key={group.city ?? ""}
            style={{ display: "flex", alignItems: "center", gap: 18 }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 40,
                height: 40,
                borderRadius: 20,
                background: AMBER,
                color: PAPER,
                fontSize: 20,
              }}
            >
              {index + 1}
            </div>
            <div style={{ display: "flex", fontSize: 32, fontWeight: 700 }}>
              {group.city ?? "Elsewhere"}
            </div>
            <div style={{ display: "flex", fontSize: 28, color: MUTED }}>
              {`${group.names.length} ${group.names.length === 1 ? "place" : "places"}`}
            </div>
          </div>
        ))}
        {more > 0 ? (
          <div style={{ display: "flex", fontSize: 26, color: MUTED }}>
            {`+${more} more ${more === 1 ? "city" : "cities"}`}
          </div>
        ) : null}
      </div>
      <div
        style={{
          display: "flex",
          marginTop: "auto",
          justifyContent: "space-between",
          alignItems: "flex-end",
        }}
      >
        <div style={{ display: "flex", fontSize: 28, color: MUTED }}>
          Went with Shelvr.
        </div>
        <div style={{ display: "flex", fontFamily: "serif", fontSize: 48 }}>
          shelvr
        </div>
      </div>
    </div>,
    size,
  );
}
