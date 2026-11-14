import { PromptSheet } from "@/components/ui/prompt-sheet";
import { ThemedText } from "@/components/ui/themed-text";
import type { MapPin } from "@/lib/map-pin-clusters";
import { t, useAppLocale } from "@/lib/i18n";
import { useRef } from "react";
import { Platform, Pressable, ScrollView } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export function MapClusterSheet({
  pins,
  onClose,
  onSelect,
}: {
  pins: MapPin[];
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  useAppLocale();
  const pending = useRef<string | undefined>(undefined);
  const finish = () => {
    const id = pending.current;
    pending.current = undefined;
    if (id) onSelect(id);
  };
  return (
    <PromptSheet
      visible={pins.length > 1}
      title={t("homePlaces.spotCount", { count: pins.length })}
      body=""
      actions={null}
      onClose={onClose}
      onDismiss={finish}
    >
      <ScrollView style={styles.list}>
        {pins.map((pin) => (
          <Pressable
            key={pin.id}
            accessibilityRole="button"
            accessibilityLabel={pin.name}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            onPress={() => {
              pending.current = pin.id;
              onClose();
              if (Platform.OS !== "ios") finish();
            }}
          >
            <ThemedText variant="body">
              {pin.emoji} {pin.name}
            </ThemedText>
          </Pressable>
        ))}
      </ScrollView>
    </PromptSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  list: { maxHeight: 360 },
  row: {
    minHeight: theme.control.minHeight,
    justifyContent: "center",
    paddingVertical: theme.gap(1.5),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  pressed: { opacity: theme.opacity.pressed },
}));
