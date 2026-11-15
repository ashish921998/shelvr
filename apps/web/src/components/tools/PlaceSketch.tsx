import { SKETCH_WIDTH, placeSketch } from "@/lib/placeSketch";
import type { ReelPlace } from "@/lib/reelPlaces";

export default function PlaceSketch({
  places,
}: {
  places: readonly ReelPlace[];
}) {
  const { height, pins, more } = placeSketch(places.map((place) => place.name));
  return (
    <figure aria-hidden="true" className="mt-8">
      <div className="dot-grid rounded-3xl border border-line bg-cream p-2">
        <svg
          viewBox={`0 0 ${SKETCH_WIDTH} ${height}`}
          className="mx-auto block w-full max-w-[420px]"
        >
          {pins.length > 1 ? (
            <polyline
              points={pins.map((pin) => `${pin.x},${pin.y}`).join(" ")}
              strokeWidth={2}
              strokeDasharray="0.1 7"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.7}
              className="fill-none stroke-ember-deep"
            />
          ) : null}
          {pins.map((pin) => (
            <g key={pin.n}>
              <circle
                cx={pin.x}
                cy={pin.y}
                r={15}
                strokeWidth={3}
                className="fill-ember stroke-cream"
              />
              <text
                x={pin.x}
                y={pin.y + 4.6}
                fontSize={13}
                fontWeight={700}
                textAnchor="middle"
                className="fill-ink"
              >
                {pin.n}
              </text>
              <text
                x={pin.x}
                y={pin.y + 32}
                fontSize={10.5}
                fontWeight={700}
                textAnchor="middle"
                className="fill-ink-soft"
              >
                {pin.label}
              </text>
            </g>
          ))}
          {more > 0 ? (
            <text
              x={300}
              y={height - 14}
              fontSize={12}
              textAnchor="end"
              className="fill-muted"
            >
              {`+${more} more in the list`}
            </text>
          ) : null}
        </svg>
      </div>
      <figcaption className="mt-2 text-sm text-muted">
        This sketch follows the list’s order. Shelvr looks each place up and
        pins it on a real map.
      </figcaption>
    </figure>
  );
}
