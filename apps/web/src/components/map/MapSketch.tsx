import { useId } from "react";

import { sketchPoints, spreadPoints } from "@/lib/mapSketch";
import { countLabel, type PublicMapPlace } from "@/lib/publicMap";

const WIDTH = 360;
const HEIGHT = 240;
const PADDING = 22;
const GRID_STEP = 20;
const MARKER_SPACING = 28;
const BOX = { width: WIDTH, height: HEIGHT, padding: PADDING };

const GRID = Array.from(
  { length: HEIGHT / GRID_STEP - 1 },
  (_, row) => `M${GRID_STEP} ${(row + 1) * GRID_STEP}H${WIDTH - GRID_STEP}`,
).join("");

function Marker({
  place,
  x,
  y,
}: {
  place: PublicMapPlace;
  x: number;
  y: number;
}) {
  return (
    <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
      <title>{place.name}</title>
      <circle
        r={12}
        strokeWidth={place.went ? 2 : 1.5}
        className={
          place.went
            ? "fill-ember stroke-ember-deep"
            : "fill-cream stroke-muted"
        }
      />
      {place.emoji ? (
        <text textAnchor="middle" dominantBaseline="central" fontSize={13}>
          {place.emoji}
        </text>
      ) : (
        <circle r={3} className="fill-ink-soft" />
      )}
      {place.went ? (
        <g transform="translate(9 -9)">
          <circle r={5} className="fill-ink" />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={7}
            className="fill-cream"
          >
            ✓
          </text>
        </g>
      ) : null}
    </g>
  );
}

export default function MapSketch({
  city,
  places,
}: {
  city: string;
  places: PublicMapPlace[];
}) {
  const titleId = useId();
  const points = spreadPoints(sketchPoints(places, BOX), BOX, MARKER_SPACING);
  const markers = places.map((place, index) => ({
    place,
    point: points[index],
    key: `${index}`,
  }));
  const ordered = [
    ...markers.filter(({ place }) => !place.went),
    ...markers.filter(({ place }) => place.went),
  ];
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-labelledby={titleId}
      className="h-auto w-full"
    >
      <title id={titleId}>
        {`Sketch of ${countLabel(places.length, "place", "places")} in ${city}`}
      </title>
      <rect
        x={0.5}
        y={0.5}
        width={WIDTH - 1}
        height={HEIGHT - 1}
        rx={16}
        strokeWidth={1}
        className="fill-paper-deep stroke-line"
      />
      <path
        d={GRID}
        fill="none"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeDasharray={`0 ${GRID_STEP}`}
        className="stroke-line-strong"
      />
      {ordered.map(({ place, point, key }) => (
        <Marker key={key} place={place} x={point.x} y={point.y} />
      ))}
    </svg>
  );
}
