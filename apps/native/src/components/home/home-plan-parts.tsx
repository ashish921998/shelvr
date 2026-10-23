import { t } from "@/lib/i18n";
import { usePaywallGuard } from "@/lib/entitlement";
import type { Id } from "@convex/_generated/dataModel";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

type SpotItem = {
  _id: Id<"items">;
  title?: string;
  imageUrl: string | null;
  heroImageUrl?: string;
  author?: string;
  siteName?: string;
};

export function DarkButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Text style={styles.buttonLabel}>{label}</Text>
    </Pressable>
  );
}

export function PlanCard({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

export function EmptyCard({ title, body }: { title: string; body: string }) {
  const router = useRouter();
  const { guard } = usePaywallGuard("home");
  return (
    <PlanCard>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.muted}>{body}</Text>
      <DarkButton
        label={t("homePlans.addSpot")}
        onPress={() => void guard(() => router.push("/add"))}
      />
    </PlanCard>
  );
}

export function SpotRow({ item }: { item: SpotItem }) {
  const router = useRouter();
  const image = item.imageUrl ?? item.heroImageUrl;
  const source = item.author ?? item.siteName;
  const title = item.title ?? t("homePlans.untitled");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={() =>
        router.push({ pathname: "/item/[id]", params: { id: item._id } })
      }
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {image ? (
        <Image
          source={{ uri: image }}
          style={styles.thumb}
          contentFit="cover"
        />
      ) : (
        <View style={styles.thumb} />
      )}
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {title}
        </Text>
        {source ? (
          <Text style={styles.muted} numberOfLines={1}>
            {source}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export function CityRow({
  city,
  count,
  ready,
  remaining,
  fraction,
  onPress,
}: {
  city: string;
  count: number;
  ready: boolean;
  remaining: number;
  fraction: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={city}
      onPress={onPress}
      style={({ pressed }) => [styles.cityRow, pressed && styles.pressed]}
    >
      <Text style={styles.rowTitle}>{city}</Text>
      <Text style={styles.muted}>
        {ready
          ? t("homePlans.cityReady", { count })
          : t("homePlans.cityMore", { count, remaining: String(remaining) })}
      </Text>
      {ready ? null : (
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${fraction * 100}%` }]} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    gap: theme.gap(1.5),
    padding: theme.gap(2),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  cardTitle: {
    ...theme.type.title,
    color: theme.colors.foreground,
  },
  muted: {
    ...theme.type.footnote,
    color: theme.colors.muted,
  },
  sectionLabel: {
    ...theme.type.labelStrong,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: theme.colors.faint,
  },
  button: {
    minHeight: theme.control.minHeight,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.gap(3),
    borderRadius: theme.radius.xl,
    borderCurve: "continuous",
    backgroundColor: theme.colors.foreground,
  },
  buttonLabel: {
    ...theme.type.button,
    color: theme.colors.surface,
  },
  pressed: { opacity: theme.opacity.pressed },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surfaceMuted,
  },
  rowText: { flex: 1, gap: theme.gap(0.25) },
  rowTitle: {
    ...theme.type.subheadStrong,
    color: theme.colors.foreground,
  },
  cityRow: {
    gap: theme.gap(0.5),
    paddingVertical: theme.gap(1.5),
    paddingHorizontal: theme.gap(2),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  track: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
    backgroundColor: theme.colors.border,
  },
  fill: {
    height: 4,
    backgroundColor: theme.colors.primary,
  },
}));
