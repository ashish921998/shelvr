import { t, useAppLocale } from "@/lib/i18n";
import { AnimatedText } from "@/components/animated-text";
import type { DetailItem } from "@/components/item-detail";
import { formatShortDate } from "@/lib/date";
import { displayHost } from "@/lib/url";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export function ItemHeader({
  item,
  onMedia = false,
}: {
  item: DetailItem | undefined;
  onMedia?: boolean;
}) {
  useAppLocale();
  const title =
    item?.title ||
    item?.note ||
    displayHost(item?.url) ||
    (item?.type === "image" ? t("item.savedPhoto") : t("item.untitled"));

  const when =
    item?.type === "image" && item?.capturedAt
      ? item.capturedAt
      : item?._creationTime;

  if (onMedia) {
    return (
      <View style={styles.container}>
        {when ? (
          <AnimatedText
            text={formatShortDate(when)}
            height={20}
            truncate
            style={styles.mediaDate}
          />
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AnimatedText text={title} truncate height={28} style={styles.title} />
      {when ? (
        <AnimatedText
          text={formatShortDate(when)}
          height={18}
          truncate
          style={styles.date}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  title: {
    fontFamily: theme.fonts.display,
    fontSize: 22,
    color: theme.colors.foreground,
  },
  mediaDate: {
    fontFamily: theme.fonts.bold,
    fontSize: 15,
    color: "white",
  },
  date: {
    fontFamily: theme.fonts.medium,
    fontSize: 12,
    color: theme.colors.muted,
  },
}));
