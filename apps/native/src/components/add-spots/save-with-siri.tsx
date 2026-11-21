import { ScreenTitle } from "@/components/screen-title";
import { AppSymbolIcon } from "@/components/symbol";
import { ThemedText } from "@/components/ui/themed-text";
import { t } from "@/lib/i18n";
import { useSiriShortcuts } from "@/lib/siri-phrases";
import { ScrollView, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export function SaveWithSiri() {
  const shortcuts = useSiriShortcuts();
  const { theme } = useUnistyles();
  return (
    <View style={styles.screen}>
      <ScreenTitle title={t("addSheet.saveWithSiri")} />
      <ScrollView contentContainerStyle={styles.body}>
        <ThemedText style={styles.lead}>{t("siri.lead")}</ThemedText>
        {shortcuts.map((shortcut) => (
          <View key={shortcut.intent} style={styles.card}>
            <View style={styles.head}>
              <View
                style={styles.icon}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <AppSymbolIcon
                  name={shortcut.icon}
                  size={20}
                  tintColor={theme.colors.onTint}
                />
              </View>
              <ThemedText
                variant="title"
                accessibilityRole="header"
                style={styles.title}
              >
                {t(shortcut.title)}
              </ThemedText>
            </View>
            <ThemedText style={styles.note}>{t(shortcut.body)}</ThemedText>
            <View style={styles.phrases}>
              {shortcut.phrases.map((phrase) => (
                <View key={phrase} style={styles.phrase}>
                  <ThemedText style={styles.phraseText}>
                    {`“${phrase}”`}
                  </ThemedText>
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  body: {
    gap: 16,
    paddingHorizontal: theme.gap(2.5),
    paddingBottom: rt.insets.bottom + theme.gap(4),
  },
  lead: { fontSize: 16.5, lineHeight: 22, color: theme.colors.muted },
  card: {
    gap: 12,
    padding: 16,
    borderRadius: 17,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface,
    boxShadow: "0 1px 3px rgba(43, 36, 24, 0.09)",
  },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 9,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
  },
  title: { flexShrink: 1, fontSize: 20, lineHeight: 26 },
  note: { fontSize: 15, lineHeight: 20, color: theme.colors.muted },
  phrases: { gap: 8 },
  phrase: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surfaceMuted,
  },
  phraseText: { fontSize: 16.5, lineHeight: 21 },
}));
