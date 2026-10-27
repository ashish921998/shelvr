import type { Id } from "@convex/_generated/dataModel";
import { PromptSheet } from "@/components/ui/prompt-sheet";
import { PillButton } from "@/components/onboarding/parts";
import { useFixSave } from "@/lib/fix-save";
import { canRetrySave, saveSource, savesToReview } from "@/lib/home-places";
import { t, useAppLocale } from "@/lib/i18n";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export type ReviewSave = {
  _id: Id<"items">;
  _creationTime: number;
  type: "image" | "link" | "note";
  status: "processing" | "ready" | "failed";
  cities?: string[];
  title?: string;
  url?: string;
  siteName?: string;
  failureReason?: Parameters<typeof canRetrySave>[0]["failureReason"];
  enrichment?: string;
  fixtureKey?: string;
};

function ReviewRow({ save, onOpen }: { save: ReviewSave; onOpen: () => void }) {
  const { retry, remove } = useFixSave();
  const [retrying, setRetrying] = useState(false);
  const source = saveSource(save);
  const name = save.title?.trim() || source || t("homePlaces.untitled");
  const reason =
    save.status === "failed"
      ? t("homePlaces.reviewFailed")
      : t("homePlaces.noPlaceNone");
  const detail = source && source !== name ? `${source} · ${reason}` : reason;
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${detail}`}
        onPress={onOpen}
        style={({ pressed }) => [styles.rowText, pressed && styles.pressed]}
      >
        <Text style={styles.rowTitle} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.muted} numberOfLines={1}>
          {detail}
        </Text>
      </Pressable>
      {canRetrySave(save) ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t("common.retry")}, ${name}`}
          disabled={retrying}
          onPress={async () => {
            setRetrying(true);
            await retry(save);
            setRetrying(false);
          }}
          hitSlop={8}
          style={({ pressed }) => [
            styles.action,
            (pressed || retrying) && styles.pressed,
          ]}
        >
          <Text style={styles.actionLabel}>{t("common.retry")}</Text>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t("common.delete")}, ${name}`}
        onPress={() => remove(save)}
        hitSlop={8}
        style={({ pressed }) => [styles.action, pressed && styles.pressed]}
      >
        <Text style={[styles.actionLabel, styles.danger]}>
          {t("common.delete")}
        </Text>
      </Pressable>
    </View>
  );
}

/** One quiet line under the cities for saves Home couldn't place, opening a sheet to fix them. */
export function ReviewSaves({ saves }: { saves: ReviewSave[] }) {
  useAppLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const toReview = savesToReview(saves);
  if (toReview.length === 0) return null;
  const count = t("homePlaces.reviewCount", { count: toReview.length });
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${count}, ${t("homePlaces.review")}`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.line, pressed && styles.pressed]}
      >
        <Text style={styles.muted}>{count}</Text>
        <Text style={styles.muted}>·</Text>
        <Text style={styles.lineAction}>{t("homePlaces.review")}</Text>
      </Pressable>
      <PromptSheet
        testID="review-saves-sheet"
        visible={open}
        onClose={() => setOpen(false)}
        title={t("homePlaces.reviewTitle")}
        body={t("homePlaces.reviewBody")}
        actions={
          <PillButton label={t("common.done")} onPress={() => setOpen(false)} />
        }
      >
        <ScrollView style={styles.list}>
          {toReview.map((save) => (
            <ReviewRow
              key={save._id}
              save={save}
              onOpen={() => {
                setOpen(false);
                router.push({
                  pathname: "/item/[id]",
                  params: { id: save._id, from: "home" },
                });
              }}
            />
          ))}
        </ScrollView>
      </PromptSheet>
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  line: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.gap(0.75),
    paddingHorizontal: theme.gap(2),
    paddingTop: theme.gap(3),
    paddingBottom: theme.gap(1),
  },
  lineAction: { ...theme.type.footnote, color: theme.colors.primaryText },
  muted: { ...theme.type.footnote, color: theme.colors.muted },
  pressed: { opacity: theme.opacity.pressed },
  list: { maxHeight: 360 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
    paddingVertical: theme.gap(1.25),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  rowText: { flex: 1, gap: theme.gap(0.25) },
  rowTitle: { ...theme.type.subheadStrong, color: theme.colors.foreground },
  action: { paddingVertical: theme.gap(0.5) },
  actionLabel: { ...theme.type.subheadStrong, color: theme.colors.primaryText },
  danger: { color: theme.colors.danger },
}));
