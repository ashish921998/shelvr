import { greetingSubtitle } from "@/lib/home-places";
import { canBrowse } from "@/lib/access";
import { useAccess } from "@/lib/free-plan";
import { t, useAppLocale } from "@/lib/i18n";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

type GreetingSave = Parameters<typeof greetingSubtitle>[1][number];

export function HomeGreeting({ saves }: { saves: GreetingSave[] }) {
  useAppLocale();
  const entitled = canBrowse(useAccess());
  const name = useQuery(
    convexQuery(api.users.getMyFirstName, entitled ? {} : "skip"),
  ).data;
  const cities = useQuery(
    convexQuery(api.items.listCities, entitled ? {} : "skip"),
  ).data;
  if (!entitled || name === undefined) return null;
  const subtitle = greetingSubtitle(cities, saves);
  return (
    <View style={styles.container}>
      <Text style={styles.title} accessibilityRole="header">
        {name === null
          ? t("homePlaces.greeting")
          : t("homePlaces.greetingName", { name })}
      </Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: theme.gap(0.5),
    paddingHorizontal: theme.gap(2),
    paddingBottom: theme.gap(2),
  },
  title: {
    fontFamily: theme.fonts.display,
    fontSize: 28,
    lineHeight: 32,
    color: theme.colors.foreground,
  },
  subtitle: { ...theme.type.subhead, color: theme.colors.muted },
}));
