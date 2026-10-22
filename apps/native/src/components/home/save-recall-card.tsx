import { formatRecentDate } from "@/lib/date";
import { t, useAppLocale } from "@/lib/i18n";
import { AppSymbolIcon, type AppSymbolName } from "@/components/symbol";
import { RECALL_MAX_SHOWN } from "@/lib/save-recall";
import type { api } from "@convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

type RecallItem = FunctionReturnType<typeof api.items.similarItems>[number];

const TYPE_SYMBOLS = {
  link: "link",
  image: "photo.stack",
  note: "doc.text",
} as const satisfies Record<RecallItem["type"], AppSymbolName>;

const STACK_LAYOUTS: Record<number, StackSlot[]> = {
  1: [{ left: 18, top: 9, rotate: 0 }],
  2: [
    { left: 34, top: 12, rotate: 9 },
    { left: 8, top: 6, rotate: -3 },
  ],
  3: [
    { left: 0, top: 14, rotate: -11 },
    { left: 40, top: 14, rotate: 10 },
    { left: 18, top: 3, rotate: 0 },
  ],
};

type StackSlot = { left: number; top: number; rotate: number };

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
  const shown = matches.slice(0, RECALL_MAX_SHOWN);
  const top = shown[0];
  if (top === undefined) return null;
  const title = savedTitle
    ? stackTitle(shown.length, savedTitle)
    : t("home.recallBody", { count: shown.length });
  const oldest = Math.min(...shown.map((item) => item._creationTime));
  const date = formatRecentDate(oldest);
  const meta =
    shown.length === 1
      ? t("home.recallSavedOn", { date })
      : t("home.recallOldest", { date });
  const slots = STACK_LAYOUTS[shown.length] ?? [];
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
        !front && styles.backThumb,
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

function stackTitle(count: number, savedTitle: string): string {
  const frame = textWidth(t("home.recallStackTitle", { count, title: "" }));
  const room = Math.max(TITLE_MIN_WIDTH, TITLE_LINES_WIDTH - frame);
  return t("home.recallStackTitle", {
    count,
    title: clipToWidth(savedTitle.trim(), room),
  });
}

const WIDE_CHAR =
  /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/u;

function charWidth(char: string): number {
  return WIDE_CHAR.test(char) ? 2 : 1;
}

function textWidth(text: string): number {
  return Array.from(text).reduce((sum, char) => sum + charWidth(char), 0);
}

function clipToWidth(text: string, room: number): string {
  if (textWidth(text) <= room) return text;
  let kept = "";
  let width = 0;
  for (const char of text) {
    if (width + charWidth(char) > room - 1) break;
    kept += char;
    width += charWidth(char);
  }
  return `${kept.trimEnd()}…`;
}

const TITLE_LINES_WIDTH = 60;
const TITLE_MIN_WIDTH = 8;
const FRONT_THUMB = 58;
const BACK_THUMB = 50;

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
    paddingRight: theme.gap(5.5),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.colors.primarySoft,
  },
  stack: {
    width: 96,
    height: 76,
  },
  thumb: {
    position: "absolute",
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    borderWidth: 2,
    borderColor: theme.colors.surface,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
  },
  backThumb: {
    opacity: 0.8,
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
