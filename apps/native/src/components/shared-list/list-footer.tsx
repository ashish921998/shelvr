import { AppSymbolIcon } from "@/components/symbol";
import { ThemedText } from "@/components/ui/themed-text";
import { analytics } from "@/lib/analytics";
import { t } from "@/lib/i18n";
import type { SharedListDetail } from "@/lib/shared-lists";
import { tripCardLine, tripName } from "@/lib/trip-planner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useRouter } from "expo-router";
import { Alert, Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

function useRemoveMember(listId: Id<"sharedLists">) {
  const remove = useMutation(api.sharedLists.removeSharedListMember);
  return (member: SharedListDetail["members"][number]) => {
    const name = member.firstName ?? t("sharedLists.someone");
    Alert.alert(
      t("sharedLists.removeMemberTitle", { name }),
      t("sharedLists.removeMemberBody"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("sharedLists.removeMember"),
          style: "destructive",
          onPress: () =>
            remove({ listId, memberId: member.userId }).catch(
              (error: unknown) => {
                analytics.captureError(
                  "shared_list_remove_member_failed",
                  error,
                );
                Alert.alert(t("sharedLists.failed"));
              },
            ),
        },
      ],
    );
  };
}

export function ListFooter({
  detail,
  city,
}: {
  detail: SharedListDetail;
  city: string;
}) {
  const router = useRouter();
  const { theme } = useUnistyles();
  const removeMember = useRemoveMember(detail._id);
  return (
    <View style={styles.footer}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("tripPlanner.addPlace")}
        onPress={() =>
          router.push({
            pathname: "/add-list-place",
            params: { listId: detail._id, city },
          })
        }
        style={({ pressed }) => [styles.add, pressed && styles.pressed]}
      >
        <AppSymbolIcon
          name="plus.circle.fill"
          size={24}
          tintColor={theme.colors.primary}
        />
        <ThemedText variant="subheadStrong">
          {t("tripPlanner.addPlace")}
        </ThemedText>
      </Pressable>

      {detail.trips.length > 0 ? (
        <View style={styles.block}>
          <ThemedText variant="captionStrong" style={styles.label}>
            {t("sharedLists.trips")}
          </ThemedText>
          {detail.trips.map((trip) => (
            <Pressable
              key={trip._id}
              accessibilityRole="button"
              accessibilityLabel={`${tripName(trip)}, ${tripCardLine(trip)}`}
              onPress={() =>
                router.push({
                  pathname: "/trip-plan/[id]",
                  params: { id: trip._id },
                })
              }
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <AppSymbolIcon
                name="airplane"
                size={16}
                tintColor={theme.colors.primaryText}
              />
              <View style={styles.text}>
                <ThemedText variant="subheadStrong" numberOfLines={1}>
                  {tripName(trip)}
                </ThemedText>
                <ThemedText variant="footnote" style={styles.muted}>
                  {tripCardLine(trip)}
                </ThemedText>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}

      {detail.isOwner ? (
        <View style={styles.block}>
          <ThemedText variant="captionStrong" style={styles.label}>
            {t("sharedLists.people")}
          </ThemedText>
          {detail.members.map((member) => (
            <View key={member.userId} style={styles.row}>
              <AppSymbolIcon
                name="person.fill"
                size={16}
                tintColor={theme.colors.muted}
              />
              <ThemedText
                variant="subhead"
                style={styles.text}
                numberOfLines={1}
              >
                {member.isYou
                  ? t("sharedLists.you")
                  : (member.firstName ?? t("sharedLists.someone"))}
              </ThemedText>
              {member.isYou ? null : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("sharedLists.removeMemberTitle", {
                    name: member.firstName ?? t("sharedLists.someone"),
                  })}
                  hitSlop={8}
                  onPress={() => removeMember(member)}
                >
                  <ThemedText variant="captionStrong" style={styles.danger}>
                    {t("sharedLists.removeMember")}
                  </ThemedText>
                </Pressable>
              )}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  footer: { gap: theme.gap(2), paddingTop: theme.gap(1) },
  add: {
    minHeight: theme.control.minHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
  },
  block: { gap: theme.gap(0.5) },
  label: {
    color: theme.colors.muted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    paddingBottom: theme.gap(0.5),
  },
  row: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  text: { flex: 1, gap: theme.gap(0.25) },
  muted: { color: theme.colors.muted },
  danger: { color: theme.colors.danger },
  pressed: { opacity: theme.opacity.pressed },
}));
