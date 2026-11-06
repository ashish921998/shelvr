import { ProgressBar } from "@/components/city/progress-bar";
import { cardPoints } from "@/lib/city-card";
import { cityPinId, type CityPin } from "@/lib/city-pins";
import { cityProgress, progressLine } from "@/lib/city-progress";
import { t, useAppLocale } from "@/lib/i18n";
import { Canvas, Path } from "@shopify/react-native-skia";
import { type ComponentRef, type Ref, useMemo, useState } from "react";
import { Text, View, type LayoutChangeEvent } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const BUBBLE = 30;

function streets(width: number, height: number) {
  const roads = [0.22, 0.5, 0.78]
    .map(
      (share) =>
        `M0 ${height * share} L${width} ${height * (share + 0.06)} ` +
        `M${width * share} 0 L${width * (share - 0.05)} ${height}`,
    )
    .join(" ");
  const river =
    `M-10 ${height * 0.62} C${width * 0.3} ${height * 0.5} ` +
    `${width * 0.6} ${height * 0.9} ${width + 10} ${height * 0.7}`;
  return { path: roads, river };
}

function CardMap({
  pins,
  visited,
}: {
  pins: CityPin[];
  visited: ReadonlySet<string>;
}) {
  const { theme } = useUnistyles();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const lines = useMemo(
    () => streets(size.width, size.height),
    [size.width, size.height],
  );
  const points = useMemo(() => {
    const went = (pin: CityPin) => visited.has(cityPinId(pin));
    return cardPoints(pins, { ...size, pad: BUBBLE }, went)
      .map((point) => ({ ...point, went: went(point.pin) }))
      .sort((a, b) => Number(a.went) - Number(b.went));
  }, [pins, size, visited]);
  return (
    <View
      style={styles.map}
      onLayout={(event: LayoutChangeEvent) =>
        setSize({
          width: event.nativeEvent.layout.width,
          height: event.nativeEvent.layout.height,
        })
      }
    >
      {size.width > 0 ? (
        <>
          <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
            <Path
              path={lines.river}
              style="stroke"
              strokeWidth={14}
              strokeCap="round"
              color={theme.colors.globeOcean}
            />
            <Path
              path={lines.path}
              style="stroke"
              strokeWidth={5}
              strokeCap="round"
              color={theme.colors.border}
            />
          </Canvas>
          {points.map(({ pin, x, y, went }) => (
            <View
              key={`${pin.itemId}:${pin.name}:${pin.lat}:${pin.lng}`}
              style={[
                styles.bubble,
                went && styles.bubbleWent,
                { left: x - BUBBLE / 2, top: y - BUBBLE / 2 },
              ]}
            >
              <Text style={styles.emoji}>{pin.emoji ?? "📍"}</Text>
            </View>
          ))}
        </>
      ) : null}
    </View>
  );
}

export function CityStoryCard({
  ref,
  city,
  pins,
  visited,
  width,
}: {
  ref?: Ref<ComponentRef<typeof View>>;
  city: string;
  pins: CityPin[];
  visited: ReadonlySet<string>;
  width: number;
}) {
  useAppLocale();
  const progress = cityProgress(pins, visited);
  const line =
    progressLine(progress) ??
    t("homePlaces.spotCount", { count: progress.total });
  return (
    <View
      ref={ref}
      collapsable={false}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${t("cityCard.mapLabel", { city })}, ${line}`}
      style={[styles.card, { width, height: (width * 16) / 9 }]}
    >
      <View style={styles.top}>
        <Text style={styles.title} numberOfLines={2}>
          {t("cityCard.title", { city })}
        </Text>
        <Text style={styles.line}>{line}</Text>
        {progress.visited > 0 ? (
          <View style={styles.bar}>
            <ProgressBar value={progress.visited / progress.total} />
          </View>
        ) : null}
      </View>
      <CardMap pins={pins} visited={visited} />
      <View style={styles.bottom}>
        <View style={styles.legend}>
          <View style={styles.key}>
            <View style={styles.dot} />
            <Text style={styles.keyText}>{t("cityCard.legendSaved")}</Text>
          </View>
          <View style={styles.key}>
            <View style={[styles.dot, styles.dotWent]} />
            <Text style={styles.keyText}>{t("cityCard.legendVisited")}</Text>
          </View>
        </View>
        <Text style={styles.footer}>{t("cityCard.footer")}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    padding: theme.gap(2.5),
    gap: theme.gap(2),
    borderRadius: theme.radius.xl,
    borderCurve: "continuous",
    backgroundColor: theme.colors.background,
    overflow: "hidden",
  },
  top: { gap: theme.gap(0.5) },
  title: { ...theme.type.displayTitle, color: theme.colors.foreground },
  line: { ...theme.type.subheadLabel, color: theme.colors.muted },
  bar: { marginTop: theme.gap(0.5) },
  map: {
    flex: 1,
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    overflow: "hidden",
    backgroundColor: theme.colors.surfaceMuted,
  },
  bubble: {
    position: "absolute",
    width: BUBBLE,
    height: BUBBLE,
    borderRadius: BUBBLE / 2,
    borderWidth: 2,
    borderColor: theme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
    boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
  },
  bubbleWent: { borderColor: theme.colors.keep, borderWidth: 3 },
  emoji: { fontSize: 15, lineHeight: 18 },
  bottom: { gap: theme.gap(1.5) },
  legend: { flexDirection: "row", gap: theme.gap(2) },
  key: { flexDirection: "row", alignItems: "center", gap: theme.gap(0.75) },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  dotWent: { borderColor: theme.colors.keep },
  keyText: { ...theme.type.caption, color: theme.colors.muted },
  footer: { ...theme.type.labelStrong, color: theme.colors.primaryText },
}));
