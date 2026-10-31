import { MemberAvatars } from "@/components/shared-list/member-avatars";
import { AppSymbolIcon } from "@/components/symbol";
import { ActionMenu } from "@/components/ui/action-menu";
import { ThemedText } from "@/components/ui/themed-text";
import { analytics } from "@/lib/analytics";
import { t } from "@/lib/i18n";
import { shareInvite, type SharedListDetail } from "@/lib/shared-lists";
import { api } from "@convex/_generated/api";
import { useMutation } from "convex/react";
import { Stack, useRouter } from "expo-router";
import { Alert, Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export function ListHeaderRight({ detail }: { detail: SharedListDetail }) {
  const router = useRouter();
  const { theme } = useUnistyles();
  const leave = useMutation(api.sharedLists.leaveSharedList);
  const confirmLeave = () =>
    Alert.alert(
      t("sharedLists.leaveTitle", { name: detail.name }),
      t("sharedLists.leaveBody"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("sharedLists.leave"),
          style: "destructive",
          onPress: () => {
            leave({ listId: detail._id })
              .then(() => {
                analytics.capture("shared_list_left", {
                  owner: detail.isOwner,
                });
                router.replace("/(app)/(tabs)/(home)");
              })
              .catch((error: unknown) => {
                analytics.captureError("shared_list_leave_failed", error);
                Alert.alert(t("sharedLists.failed"));
              });
          },
        },
      ],
    );
  return (
    <Stack.Screen
      options={{
        headerRight: () => (
          <View style={styles.right}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("sharedLists.invite")}
              onPress={() => void shareInvite(detail.inviteToken, "list")}
              style={({ pressed }) => [
                styles.invite,
                pressed && styles.pressed,
              ]}
            >
              <MemberAvatars members={detail.members} size={26} />
              <ThemedText variant="captionStrong">
                {t("sharedLists.invite")}
              </ThemedText>
            </Pressable>
            <ActionMenu
              label={t("sharedLists.listActions")}
              title={detail.name}
              actions={[
                {
                  id: "leave",
                  label: t("sharedLists.leave"),
                  destructive: true,
                  onPress: confirmLeave,
                },
              ]}
              style={styles.menu}
            >
              <AppSymbolIcon
                name="ellipsis"
                size={18}
                weight="semibold"
                tintColor={theme.colors.foreground}
              />
            </ActionMenu>
          </View>
        ),
      }}
    />
  );
}

const styles = StyleSheet.create((theme) => ({
  right: { flexDirection: "row", alignItems: "center", gap: theme.gap(0.5) },
  invite: {
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(0.75),
    paddingLeft: theme.gap(0.75),
    paddingRight: theme.gap(1.5),
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  menu: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  pressed: { opacity: theme.opacity.pressed },
}));
