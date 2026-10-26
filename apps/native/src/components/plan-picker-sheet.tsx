import { AppSymbolIcon, type AppSymbolName } from "@/components/symbol";
import { PromptSheet } from "@/components/ui/prompt-sheet";
import { t, useAppLocale } from "@/lib/i18n";
import { Pressable, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export function PlanPickerSheet({
  visible,
  onClose,
  onGoOut,
  onTrip,
}: {
  visible: boolean;
  onClose: () => void;
  onGoOut: () => void;
  onTrip: () => void;
}) {
  useAppLocale();
  return (
    <PromptSheet
      visible={visible}
      onClose={onClose}
      title={t("plan.pickerTitle")}
      body={t("plan.pickerBody")}
      actions={null}
      testID="plan-picker-sheet"
    >
      <View style={styles.choices}>
        <Choice
          icon="fork.knife"
          title={t("plan.goOut")}
          body={t("plan.goOutBody")}
          onPress={onGoOut}
        />
        <Choice
          icon="map"
          title={t("trip.pickTitle")}
          body={t("trip.pickBody")}
          onPress={onTrip}
        />
      </View>
    </PromptSheet>
  );
}

function Choice({
  icon,
  title,
  body,
  onPress,
}: {
  icon: AppSymbolName;
  title: string;
  body: string;
  onPress: () => void;
}) {
  const { theme } = useUnistyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${body}`}
      onPress={onPress}
      style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
    >
      <View style={styles.icon}>
        <AppSymbolIcon
          name={icon}
          size={20}
          tintColor={theme.colors.primaryText}
        />
      </View>
      <View style={styles.text}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
      </View>
      <AppSymbolIcon
        name="chevron.right"
        size={14}
        tintColor={theme.colors.muted}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  choices: {
    gap: theme.gap(1.5),
    marginTop: theme.gap(1),
  },
  choice: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
    paddingVertical: theme.gap(1.75),
    paddingHorizontal: theme.gap(1.5),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  pressed: {
    opacity: 0.7,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primarySoft,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: theme.fonts.bold,
    fontSize: 17,
    color: theme.colors.foreground,
  },
  body: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.muted,
  },
}));
