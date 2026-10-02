import { t, useAppLocale } from "@/lib/i18n";
import type { ReactNode } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

/**
 * The bottom sheet Home uses for one-off prompts: a scrim that closes it, a
 * title and body, optional content, then the actions. The caller owns when
 * it shows and what closing means.
 */
export function PromptSheet({
  visible,
  onClose,
  title,
  body,
  children,
  actions,
  testID,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  body: string;
  children?: ReactNode;
  actions: ReactNode;
  testID?: string;
}) {
  useAppLocale();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={styles.scrim}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t("common.notNow")}
        />
        <View style={styles.sheet} testID={testID}>
          <View style={styles.grabber} />
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
          {children}
          <View style={styles.actions}>{actions}</View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.overlay,
  },
  sheet: {
    gap: theme.gap(1.5),
    paddingHorizontal: theme.gap(3),
    paddingTop: theme.gap(1.5),
    paddingBottom: rt.insets.bottom + theme.gap(2),
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    borderCurve: "continuous",
    backgroundColor: theme.colors.background,
  },
  grabber: {
    alignSelf: "center",
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.colors.border,
    marginBottom: theme.gap(1),
  },
  title: {
    fontFamily: theme.fonts.bold,
    fontSize: 22,
    lineHeight: 28,
    color: theme.colors.foreground,
  },
  body: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    lineHeight: 21,
    color: theme.colors.muted,
  },
  actions: {
    gap: theme.gap(0.5),
    marginTop: theme.gap(1),
  },
}));
