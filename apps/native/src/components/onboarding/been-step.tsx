import { BeenCityGrid } from "@/components/been/been-city-grid";
import { PillButton, QuestionTitle } from "@/components/onboarding/parts";
import { t, useAppLocale } from "@/lib/i18n";
import type { SampleCityId } from "@/lib/sample-cities";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export function BeenStep({
  picked,
  onChange,
  onContinue,
}: {
  picked: SampleCityId[];
  onChange: (picked: SampleCityId[]) => void;
  onContinue: () => void;
}) {
  useAppLocale();
  return (
    <View style={styles.wrap}>
      <QuestionTitle title={t("been.title")} body={t("been.body")} />
      <BeenCityGrid
        picked={picked}
        onToggle={(city) =>
          onChange(
            picked.includes(city)
              ? picked.filter((id) => id !== city)
              : [...picked, city],
          )
        }
      />
      <PillButton
        label={t("common.continue")}
        disabled={picked.length === 0}
        onPress={onContinue}
        testID="onboarding-been-continue"
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    flex: 1,
    gap: theme.gap(2),
  },
}));
