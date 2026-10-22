import { usePinColors } from "@/components/onboarding/sample-trip-map";
import { t, useAppLocale } from "@/lib/i18n";
import { SKIA_FONTS } from "@/lib/skia-fonts";
import {
  SAMPLE_SLOT_LABELS,
  SAMPLE_TRIP,
  type NumberedStop,
  type SampleRow,
} from "@/lib/sample-trip";
import {
  Blur,
  Canvas,
  Circle,
  Group,
  Paint,
  Rect,
  Text as SkiaText,
  useFont,
  type SkFont,
} from "@shopify/react-native-skia";
import { useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const PAD = 16;
const DIVIDER = 1;
const STOP_HEIGHT = 44;
const SLOT_WIDTH = 84;
const COLUMN_GAP = 12;
const BADGE = 22;
const BADGE_RING = 2;
const DAY_PAD_TOP = 14;
const EYEBROW_LINE = 15;
const DAY_TEXT_GAP = 2;
const TITLE_LINE = 24;
const DAY_PAD_BOTTOM = 8;
const COUNT_LINE = 18;
const DAY_HEIGHT =
  DIVIDER +
  DAY_PAD_TOP +
  EYEBROW_LINE +
  DAY_TEXT_GAP +
  TITLE_LINE +
  DAY_PAD_BOTTOM;
const NAME_SIZE = 16;
const BADGE_TEXT_SIZE = 12;
const EYEBROW_SIZE = 11;
const BLUR = 5;
const MIDDLE_ABOVE_BASELINE = 0.34;

type Fonts = Record<
  "slot" | "name" | "badge" | "eyebrow" | "title" | "count",
  SkFont
>;

function rowHeight(row: SampleRow): number {
  return row.kind === "day" ? DAY_HEIGHT : STOP_HEIGHT;
}

function placeRows(rows: readonly SampleRow[]) {
  let height = 0;
  const placed = rows.map((row) => {
    const top = height;
    height += rowHeight(row);
    return { row, top };
  });
  return { placed, height };
}

function useRowFonts(): Fonts | null {
  const { theme } = useUnistyles();
  const { label, header, caption } = theme.type;
  const slot = useFont(SKIA_FONTS[label.fontFamily], label.fontSize);
  const name = useFont(SKIA_FONTS[theme.fonts.bold], NAME_SIZE);
  const badge = useFont(SKIA_FONTS[theme.fonts.bold], BADGE_TEXT_SIZE);
  const eyebrow = useFont(SKIA_FONTS[theme.fonts.bold], EYEBROW_SIZE);
  const title = useFont(SKIA_FONTS[header.fontFamily], header.fontSize);
  const count = useFont(SKIA_FONTS[caption.fontFamily], caption.fontSize);
  return slot && name && badge && eyebrow && title && count
    ? { slot, name, badge, eyebrow, title, count }
    : null;
}

function Words({
  text,
  font,
  x,
  middle,
  color,
}: {
  text: string;
  font: SkFont;
  x: number;
  middle: number;
  color: string;
}) {
  return (
    <SkiaText
      text={text}
      font={font}
      x={x}
      y={middle + font.getSize() * MIDDLE_ABOVE_BASELINE}
      color={color}
    />
  );
}

function Divider({ top, width }: { top: number; width: number }) {
  const { theme } = useUnistyles();
  return (
    <Rect
      x={0}
      y={top}
      width={width}
      height={DIVIDER}
      color={theme.colors.border}
    />
  );
}

function DrawnStop({
  top,
  width,
  entry,
  fonts,
}: {
  top: number;
  width: number;
  entry: NumberedStop;
  fonts: Fonts;
}) {
  const { theme } = useUnistyles();
  const pin = usePinColors()(entry.day);
  const middle = top + DIVIDER + (STOP_HEIGHT - DIVIDER) / 2;
  const badgeX = width - PAD - BADGE / 2;
  const number = String(entry.number);
  return (
    <>
      <Divider top={top} width={width} />
      <Words
        text={t(SAMPLE_SLOT_LABELS[entry.stop.slot])}
        font={fonts.slot}
        x={PAD}
        middle={middle}
        color={theme.colors.muted}
      />
      <Words
        text={entry.stop.name}
        font={fonts.name}
        x={PAD + SLOT_WIDTH + COLUMN_GAP}
        middle={middle}
        color={theme.colors.foreground}
      />
      <Circle
        cx={badgeX}
        cy={middle}
        r={BADGE / 2 - BADGE_RING}
        color={pin.background}
      />
      <Words
        text={number}
        font={fonts.badge}
        x={badgeX - fonts.badge.measureText(number).width / 2}
        middle={middle}
        color={pin.text}
      />
    </>
  );
}

function DrawnDay({
  top,
  width,
  day,
  fonts,
}: {
  top: number;
  width: number;
  day: number;
  fonts: Fonts;
}) {
  const { theme } = useUnistyles();
  const { title, stops } = SAMPLE_TRIP.days[day];
  const count = t("tripTeaser.placeCount", { count: stops.length });
  const eyebrowTop = top + DIVIDER + DAY_PAD_TOP;
  const titleTop = eyebrowTop + EYEBROW_LINE + DAY_TEXT_GAP;
  return (
    <>
      <Divider top={top} width={width} />
      <Words
        text={t("trip.dayTab", { day: String(day + 1) }).toLocaleUpperCase()}
        font={fonts.eyebrow}
        x={PAD}
        middle={eyebrowTop + EYEBROW_LINE / 2}
        color={theme.colors.primaryText}
      />
      <Words
        text={t(title)}
        font={fonts.title}
        x={PAD}
        middle={titleTop + TITLE_LINE / 2}
        color={theme.colors.foreground}
      />
      <Words
        text={count}
        font={fonts.count}
        x={width - PAD - fonts.count.measureText(count).width}
        middle={top + DAY_HEIGHT - DAY_PAD_BOTTOM - COUNT_LINE / 2}
        color={theme.colors.muted}
      />
    </>
  );
}

// React Native cannot blur text, so the rows are drawn in Skia and blurred there.
export function VeiledStops({ rows }: { rows: readonly SampleRow[] }) {
  useAppLocale();
  const [width, setWidth] = useState(0);
  const fonts = useRowFonts();
  const { placed, height } = placeRows(rows);

  return (
    <View
      style={{ height }}
      onLayout={(event: LayoutChangeEvent) =>
        setWidth(event.nativeEvent.layout.width)
      }
    >
      {width > 0 && fonts ? (
        <Canvas style={styles.canvas} pointerEvents="none">
          <Group
            layer={
              <Paint>
                <Blur blur={BLUR} />
              </Paint>
            }
          >
            {placed.map(({ row, top }, index) =>
              row.kind === "day" ? (
                <DrawnDay
                  key={index}
                  top={top}
                  width={width}
                  day={row.day}
                  fonts={fonts}
                />
              ) : (
                <DrawnStop
                  key={index}
                  top={top}
                  width={width}
                  entry={row.entry}
                  fonts={fonts}
                />
              ),
            )}
          </Group>
        </Canvas>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
