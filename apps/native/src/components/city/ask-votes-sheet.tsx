import { AppSymbolIcon } from "@/components/symbol";
import { Button } from "@/components/ui/button";
import { PromptSheet } from "@/components/ui/prompt-sheet";
import { ThemedText } from "@/components/ui/themed-text";
import { type CityPin, cityPinId } from "@/lib/city-pins";
import { haptics } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { placeCategoryLabel } from "@/lib/place-category";
import {
  initialChoice,
  sameShortlist,
  useAskVotes,
  type VoteLink,
} from "@/lib/plan-votes";
import { MAX_PLAN_PLACES } from "@convex/model/plan";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

function PlaceCheckRow({
  testID,
  title,
  detail,
  selected,
  disabled,
  onPress,
}: {
  testID: string;
  title: string;
  detail: string | undefined;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { theme } = useUnistyles();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityLabel={detail === undefined ? title : `${title}, ${detail}`}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={() => {
        void haptics.selection();
        onPress();
      }}
      style={({ pressed }) => [
        styles.row,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <View style={styles.text}>
        <ThemedText variant="subheadStrong">{title}</ThemedText>
        {detail === undefined ? null : (
          <ThemedText variant="footnote" style={styles.muted}>
            {detail}
          </ThemedText>
        )}
      </View>
      <View style={[styles.check, selected && styles.checkOn]}>
        {selected ? (
          <AppSymbolIcon
            name="checkmark"
            size={14}
            weight="bold"
            tintColor={theme.colors.surface}
          />
        ) : null}
      </View>
    </Pressable>
  );
}

export function AskVotesSheet({
  visible,
  city,
  pins,
  filtered,
  link,
  onClose,
}: {
  visible: boolean;
  city: string;
  pins: CityPin[];
  filtered: CityPin[];
  link: VoteLink | null;
  onClose: () => void;
}) {
  const [chosen, setChosen] = useState(() =>
    initialChoice(pins, filtered, link),
  );
  const { busy, send, flush } = useAskVotes(city, link, pins);
  const chosenPins = pins.filter((pin) => chosen.includes(cityPinId(pin)));
  const full = chosen.length >= MAX_PLAN_PLACES;
  const toggle = (id: string) =>
    setChosen((current) => {
      if (current.includes(id)) return current.filter((other) => other !== id);
      return current.length >= MAX_PLAN_PLACES ? current : [...current, id];
    });
  const submit = async () => {
    if (!(await send(chosenPins))) return;
    onClose();
    if (process.env.EXPO_OS !== "ios") void flush();
  };
  return (
    <PromptSheet
      testID="ask-votes-sheet"
      visible={visible}
      onClose={onClose}
      onDismiss={() => void flush()}
      title={t("plan.ask")}
      body={t("plan.askBody", { limit: MAX_PLAN_PLACES })}
      actions={
        <Button
          testID="ask-votes-send"
          title={t("plan.askSend")}
          disabled={chosenPins.length === 0}
          loading={busy}
          onPress={() => void submit()}
        />
      }
    >
      <ScrollView style={styles.list}>
        {pins.map((pin, index) => {
          const id = cityPinId(pin);
          const selected = chosen.includes(id);
          return (
            <PlaceCheckRow
              key={id}
              testID={`ask-votes-place-${index}`}
              title={pin.name}
              detail={placeCategoryLabel(pin.category)}
              selected={selected}
              disabled={!selected && full}
              onPress={() => toggle(id)}
            />
          );
        })}
      </ScrollView>
      {link !== null && !sameShortlist(link, chosenPins, pins) ? (
        <ThemedText variant="footnote" style={styles.muted}>
          {t("plan.newLinkHint")}
        </ThemedText>
      ) : null}
    </PromptSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  list: { maxHeight: theme.gap(45) },
  row: {
    minHeight: theme.control.minHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
    paddingVertical: theme.gap(1),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  text: { flex: 1, gap: theme.gap(0.25) },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: {
    borderColor: theme.colors.foreground,
    backgroundColor: theme.colors.foreground,
  },
  muted: { color: theme.colors.muted },
  pressed: { opacity: theme.opacity.pressed },
  disabled: { opacity: theme.opacity.disabled },
}));
