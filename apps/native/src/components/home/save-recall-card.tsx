import { t, formattingLocale, useAppLocale } from "@/lib/i18n";
import { AppSymbolIcon, type AppSymbolName } from "@/components/symbol";
import { RECALL_MAX_SHOWN } from "@/lib/save-recall";
import type { api } from "@convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

type RecallItem = FunctionReturnType<typeof api.items.similarItems>[number];

/** The glyph a thumbnail shows when the save has no picture. */
const TYPE_SYMBOLS = {
  link: "link",
  image: "photo.stack",
  note: "doc.text",
} as const satisfies Record<RecallItem["type"], AppSymbolName>;

/** Where each thumbnail of the fanned stack sits, back to front, by how many
 * the card shows. The last entry is the front thumbnail: the top match. */
const STACK_LAYOUTS: Record<number, StackSlot[]> = {
  1: [{ left: 12, top: 8, rotate: 0 }],
  2: [
    { left: 24, top: 12, rotate: 7 },
    { left: 6, top: 4, rotate: 0 },
  ],
  3: [
    { left: 0, top: 12, rotate: -8 },
    { left: 26, top: 14, rotate: 7 },
    { left: 12, top: 2, rotate: 0 },
  ],
};

type StackSlot = { left: number; top: number; rotate: number };

/**
 * The save recall card on Home: older saves that go with the one just added,
 * as one tappable row with their thumbnails fanned into a stack. Tapping it
 * opens the top match. Purely presentational; the hook in
 * lib/use-save-recall.ts owns when it shows and its analytics.
 */
export function SaveRecallCard({
  savedTitle,
  matches,
  onOpen,
  onDismiss,
}: {
  savedTitle: string | undefined;
  matches: RecallItem[];
  onOpen: () => void;
  onDismiss: () => void;
}) {
  useAppLocale();
  const router = useRouter();
  const { theme } = useUnistyles();
  // The count names only the saves the stack shows, so it never promises
  // more than the card delivers.
  const shown = matches.slice(0, RECALL_MAX_SHOWN);
  const top = shown[0];
  if (top === undefined) return null;
  const title = savedTitle
    ? t("home.recallStackTitle", { count: shown.length, title: savedTitle })
    : t("home.recallBody", { count: shown.length });
  const oldest = Math.min(...shown.map((item) => item._creationTime));
  const date = shortDate(oldest);
  const meta =
    shown.length === 1
      ? t("home.recallSavedOn", { date })
      : t("home.recallOldest", { date });
  const slots = STACK_LAYOUTS[shown.length] ?? [];
  // Back to front, so the top match paints last and sits on top.
  const stack = shown.slice().reverse();
  return (
    <View style={styles.wrap} testID="save-recall-card">
      {/* No `Link asChild`: its Slot drops a Pressable style function. */}
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${title}. ${meta}`}
        testID="save-recall-open"
        onPress={() => {
          onOpen();
          router.push({ pathname: "/item/[id]", params: { id: top._id } });
        }}
        style={({ pressed }) => [
          styles.card,
          pressed && { opacity: theme.opacity.pressed },
        ]}
      >
        <View style={styles.stack}>
          {stack.map((item, index) => (
            <StackThumb
              key={item._id}
              item={item}
              slot={slots[index]}
              front={index === stack.length - 1}
            />
          ))}
        </View>
        <View style={styles.text}>
          <Text style={styles.kicker} numberOfLines={1}>
            {t("home.recallKicker")}
          </Text>
          <Text style={styles.title} numberOfLines={3}>
            {title}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {meta}
          </Text>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("common.notNow")}
        testID="save-recall-dismiss"
        onPress={onDismiss}
        style={({ pressed }) => [
          styles.dismiss,
          pressed && { opacity: theme.opacity.pressed },
        ]}
      >
        <View style={styles.dismissDot}>
          <AppSymbolIcon
            name="xmark"
            size={14}
            tintColor={theme.colors.muted}
          />
        </View>
      </Pressable>
    </View>
  );
}

function StackThumb({
  item,
  slot,
  front,
}: {
  item: RecallItem;
  slot: StackSlot | undefined;
  front: boolean;
}) {
  const { theme } = useUnistyles();
  const imageUri = item.imageUrl ?? item.heroImageUrl;
  const size = front ? FRONT_THUMB : BACK_THUMB;
  return (
    <View
      style={[
        styles.thumb,
        {
          width: size,
          height: size,
          left: slot?.left ?? 0,
          top: slot?.top ?? 0,
          transform: [{ rotate: `${slot?.rotate ?? 0}deg` }],
        },
      ]}
    >
      {imageUri ? (
        <Image
          source={{ uri: imageUri }}
          recyclingKey={item._id}
          contentFit={item.isSticker ? "contain" : "cover"}
          style={styles.thumbImage}
        />
      ) : (
        <AppSymbolIcon
          name={TYPE_SYMBOLS[item.type]}
          size={front ? 22 : 18}
          tintColor={theme.colors.primaryText}
        />
      )}
    </View>
  );
}

/** "Aug 14", with the year only when it is not this year's. */
function shortDate(ms: number): string {
  const date = new Date(ms);
  const thisYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(formattingLocale(), {
    month: "short",
    day: "numeric",
    ...(thisYear ? {} : { year: "numeric" }),
  });
}

const FRONT_THUMB = 60;
const BACK_THUMB = 54;

const styles = StyleSheet.create((theme) => ({
  wrap: {
    marginHorizontal: theme.gap(2),
    marginTop: theme.gap(1),
    marginBottom: theme.gap(1),
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(2),
    padding: theme.gap(1.75),
    // Room for the dismiss button in the top corner.
    paddingRight: theme.gap(5.5),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.colors.primarySoft,
  },
  stack: {
    width: 84,
    height: 76,
  },
  thumb: {
    position: "absolute",
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    borderWidth: 2,
    // The card's own tint, so overlapping thumbnails read as separate cards.
    borderColor: theme.colors.primarySoft,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
  },
  thumbImage: {
    width: "100%",
    height: "100%",
  },
  text: {
    flex: 1,
    gap: theme.gap(0.25),
  },
  kicker: {
    ...theme.type.captionStrong,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: theme.colors.primaryText,
  },
  title: {
    ...theme.type.header,
    lineHeight: 23,
    color: theme.colors.foreground,
  },
  meta: {
    ...theme.type.caption,
    color: theme.colors.muted,
  },
  // A full-size tap target around the small visible circle.
  dismiss: {
    position: "absolute",
    top: 0,
    right: 0,
    width: theme.control.minHeight,
    height: theme.control.minHeight,
    alignItems: "center",
    justifyContent: "center",
  },
  dismissDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
  },
}));
