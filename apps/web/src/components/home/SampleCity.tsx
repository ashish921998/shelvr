import { SAMPLE_CITY, riverPolygon, sampleCountLine } from "@/lib/sampleCity";
import styles from "./Landing.module.css";

type Point = readonly [number, number];

function points(list: readonly Point[]): string {
  return list.map(([x, y]) => `${x},${y}`).join(" ");
}

export function SampleCityMap({ animate }: { animate: boolean }) {
  const [bridgeStart, bridgeEnd] = SAMPLE_CITY.bridge;
  return (
    <g>
      <rect width={320} height={480} className="fill-paper-deep" />
      {SAMPLE_CITY.parks.map((park) => (
        <path key={park} d={park} className="fill-map-park" />
      ))}
      {SAMPLE_CITY.roads.map((road) => (
        <polyline
          key={points(road.points)}
          points={points(road.points)}
          strokeWidth={road.width}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="fill-none stroke-cream"
        />
      ))}
      <polygon points={points(riverPolygon())} className="fill-map-water" />
      <line
        x1={bridgeStart[0]}
        y1={bridgeStart[1]}
        x2={bridgeEnd[0]}
        y2={bridgeEnd[1]}
        strokeWidth={3.2}
        strokeLinecap="round"
        className="stroke-terracotta"
      />
      <text
        x={232}
        y={352}
        fontSize={8.5}
        fontWeight={700}
        letterSpacing={2.4}
        className="fill-map-label"
      >
        TEJO
      </text>
      <text
        x={40}
        y={420}
        fontSize={8.5}
        fontWeight={700}
        letterSpacing={2.4}
        className="fill-muted-soft"
      >
        ALMADA
      </text>
      {SAMPLE_CITY.pins.map((pin, i) => {
        const newest = pin.name === SAMPLE_CITY.newest;
        return (
          <g
            key={pin.name}
            className={animate ? styles.mapPin : undefined}
            style={
              animate ? { animationDelay: `${300 + i * 45}ms` } : undefined
            }
          >
            {newest ? (
              <circle
                cx={pin.x}
                cy={pin.y}
                r={13}
                strokeWidth={2}
                className="fill-none stroke-ember"
              />
            ) : null}
            {newest && animate ? (
              <circle
                cx={pin.x}
                cy={pin.y}
                r={13}
                strokeWidth={2}
                className={`fill-none stroke-ember ${styles.mapPulse}`}
              />
            ) : null}
            <circle
              cx={pin.x}
              cy={pin.y + 1.2}
              r={11.5}
              className="fill-ink/16"
            />
            <circle
              cx={pin.x}
              cy={pin.y}
              r={11}
              className="fill-cream stroke-line-strong"
            />
            <text x={pin.x} y={pin.y + 4.3} fontSize={12} textAnchor="middle">
              {pin.emoji}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export default function SampleCity() {
  return (
    <svg
      viewBox="0 0 320 696"
      role="img"
      aria-label={`A sample ${SAMPLE_CITY.name} map in Shelvr: ${sampleCountLine()}`}
    >
      <rect width={320} height={696} className="fill-cream" />
      <SampleCityMap animate />
      <text x={30} y={33} fontSize={15} fontWeight={700} className="fill-ink">
        9:41
      </text>
      <rect
        x={112}
        y={12}
        width={96}
        height={30}
        rx={15}
        className="fill-ink"
      />
      <rect
        x={272}
        y={22}
        width={24}
        height={12}
        rx={3.5}
        strokeWidth={1.2}
        className="fill-none stroke-ink"
      />
      <rect x={274} y={24} width={17} height={8} rx={2} className="fill-ink" />
      <path
        d="M0 480 Q0 456 24 456 H296 Q320 456 320 480 V696 H0 Z"
        className="fill-cream"
      />
      <rect
        x={144}
        y={464}
        width={32}
        height={4}
        rx={2}
        className="fill-line-strong"
      />
      <text
        x={20}
        y={506}
        fontSize={32}
        style={{ fontFamily: "var(--font-display)" }}
        className="fill-ink"
      >
        {SAMPLE_CITY.name}
      </text>
      <text
        x={20}
        y={528}
        fontSize={12.5}
        fontWeight={500}
        className="fill-muted"
      >
        {sampleCountLine()}
      </text>
      {SAMPLE_CITY.rows.map((row, r) => {
        const y = 556 + 42 * r;
        return (
          <g key={row.name}>
            <circle
              cx={33}
              cy={y}
              r={13}
              className="fill-cream stroke-line-strong"
            />
            <text x={33} y={y + 4.6} fontSize={13} textAnchor="middle">
              {row.emoji}
            </text>
            <text
              x={54}
              y={y - 3}
              fontSize={13}
              fontWeight={700}
              className="fill-ink"
            >
              {row.name}
            </text>
            <text x={54} y={y + 12} fontSize={11} className="fill-muted">
              {row.detail}
            </text>
          </g>
        );
      })}
      <line
        x1={0}
        y1={626}
        x2={320}
        y2={626}
        strokeWidth={1}
        className="stroke-line"
      />
      <rect
        x={20}
        y={634}
        width={134}
        height={42}
        rx={14}
        className="fill-ink"
      />
      <rect
        x={166}
        y={634}
        width={134}
        height={42}
        rx={14}
        className="fill-paper-deep"
      />
      <text
        x={87}
        y={652}
        fontSize={12.5}
        fontWeight={700}
        textAnchor="middle"
        className="fill-paper"
      >
        Plan a date
      </text>
      <text
        x={233}
        y={652}
        fontSize={12.5}
        fontWeight={700}
        textAnchor="middle"
        className="fill-ink"
      >
        Plan a trip
      </text>
      <text
        x={87}
        y={666}
        fontSize={9.5}
        textAnchor="middle"
        fillOpacity={0.72}
        className="fill-paper"
      >
        One evening, a few stops
      </text>
      <text
        x={233}
        y={666}
        fontSize={9.5}
        textAnchor="middle"
        className="fill-ink-soft"
      >
        Day by day
      </text>
    </svg>
  );
}
