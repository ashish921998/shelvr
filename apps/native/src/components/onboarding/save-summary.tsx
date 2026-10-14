import { AppSymbolIcon } from "@/components/symbol";
import { Image, type ImageSource } from "expo-image";
import { Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

/** A save as the app files it: its picture, title, a line of detail and, when
 * the classifier gave one, a tag. The sign-in prompt and the reminder step
 * both show the first save this way. */
export function SaveSummary({
  image,
  title,
  meta,
  tag,
}: {
  image: ImageSource | string | number | null | undefined;
  title: string;
  meta: string;
  tag?: string;
}) {
  const { theme } = useUnistyles();
  return (
    <View style={styles.save}>
      <View style={styles.thumb}>
        {image ? (
          <Image source={image} style={styles.thumbImage} contentFit="cover" />
        ) : (
          <AppSymbolIcon
            name="link"
            size={18}
            tintColor={theme.colors.primaryText}
          />
        )}
      </View>
      <View style={styles.saveText}>
        <Text style={styles.saveTitle} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.saveMeta} numberOfLines={1}>
          {meta}
        </Text>
        {tag ? (
          <View style={styles.tag}>
            <Text style={styles.tagText}>{tag}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  save: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(2),
    padding: theme.gap(2),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  thumb: {
    width: 72,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: theme.radius.sm,
    borderCurve: "continuous",
    backgroundColor: theme.colors.primarySoft,
  },
  thumbImage: {
    width: "100%",
    height: "100%",
  },
  saveText: {
    flex: 1,
    gap: theme.gap(0.5),
  },
  saveTitle: {
    fontFamily: theme.fonts.bold,
    fontSize: 16,
    lineHeight: 21,
    color: theme.colors.foreground,
  },
  saveMeta: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    color: theme.colors.muted,
  },
  tag: {
    alignSelf: "flex-start",
    marginTop: theme.gap(0.5),
    paddingHorizontal: theme.gap(1.25),
    paddingVertical: theme.gap(0.5),
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceMuted,
  },
  tagText: {
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    color: theme.colors.muted,
  },
}));
