import { t, useAppLocale } from "@/lib/i18n";
import { analytics } from "@/lib/analytics";
import { forgetDeletedSharedItem } from "@/lib/share/share-store";
import type { ActionMenuItem } from "@/components/ui/action-menu";
import {
  cardTitles,
  ItemCardFace,
  type FeedItem,
} from "@/components/item-card-face";
import { memo } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation } from "convex/react";
import * as Haptics from "expo-haptics";
import { Link, useRouter } from "expo-router";
import { Alert, Pressable, Share } from "react-native";
import Animated, { FadeIn, useReducedMotion } from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { shareRefOf, shareUrl, useShareLink } from "@/lib/share-link";

export type { FeedItem } from "@/components/item-card-face";

// Describes which list a card belongs to, so the detail screen can rebuild the
// same ordered sibling set for horizontal swipe-paging. `digest` and `map` open
// onto the home feed's pager (anything not `space`/`search` does), but the
// `from` value still reaches `item_opened` so the open is attributed to the
// screen it came from instead of collapsing into `direct`.
export type ItemSource =
  | { from: "home" }
  | { from: "space"; spaceId: string }
  | { from: "search"; q: string }
  | { from: "digest" }
  | { from: "map" };

function cardMenuActions({
  isSuggested,
  hasUrl,
  isReady,
  accept,
  dismiss,
  share,
  changeSpaces,
  confirmDelete,
}: {
  isSuggested: boolean;
  hasUrl: boolean;
  isReady: boolean;
  accept: () => void;
  dismiss: () => void;
  share: () => void;
  changeSpaces: () => void;
  confirmDelete: () => void;
}): ActionMenuItem[] {
  if (isSuggested) {
    return [
      { label: t("spaces.addItem"), onPress: accept },
      {
        label: t("spaces.dismissSuggestion"),
        destructive: true,
        onPress: dismiss,
      },
    ];
  }
  const actions: ActionMenuItem[] = [];
  if (hasUrl) {
    actions.push({ label: t("common.share"), onPress: share });
  }
  if (isReady) {
    actions.push({
      label: t("spaces.changeMembership"),
      onPress: changeSpaces,
    });
  }
  actions.push({
    label: t("common.delete"),
    destructive: true,
    onPress: confirmDelete,
  });
  return actions;
}

// Memoized: feed rows are the highest-churn surface in the app (every live-query
// tick and parent re-render touches the list), so skip re-renders when a row's
// `item` ref is unchanged.
export const ItemCard = memo(function ItemCard({
  item,
  source,
}: {
  item: FeedItem;
  source?: ItemSource;
}) {
  useAppLocale();
  const reducedMotion = useReducedMotion();
  const router = useRouter();
  const deleteItem = useMutation(api.items.deleteItem);
  const acceptSuggestion = useMutation(api.spaces.acceptSuggestion);
  const dismissSuggestion = useMutation(api.spaces.dismissSuggestion);

  const spaceId =
    source?.from === "space" ? (source.spaceId as Id<"spaces">) : undefined;
  const isSuggested = item.suggested === true && spaceId !== undefined;
  const changeSpaces = () =>
    router.push({ pathname: "/manage-spaces", params: { itemId: item._id } });
  const shareLink = useShareLink();
  const share = async () => {
    if (!item.url) return;
    try {
      const link = item.type === "link" ? await shareLink(item._id) : undefined;
      const result = await shareUrl(link ?? item.url);
      if (result.action === Share.sharedAction) {
        const shareRef = await shareRefOf(link);
        analytics.capture("item_shared", {
          surface: "feed",
          ...(shareRef ? { share_ref: shareRef } : {}),
        });
      }
      if (
        result.action === Share.sharedAction &&
        item._creationTime !== undefined
      ) {
        analytics.itemAction(
          { ...item, _creationTime: item._creationTime },
          "share",
        );
      }
    } catch {
      // A dismissed or failed share is not a completed action.
    }
  };

  // What a screen reader reads instead of the card's contents. The classifier
  // can hand back a title that is empty or only spaces, and an accessibilityLabel
  // replaces the child text rather than falling back to it — so a blank one
  // would leave the card announcing nothing at all. Take the first title with
  // visible characters, then describe the item's state.
  const accessibilityLabel =
    cardTitles(item).find((title) => title?.trim()) ??
    (item.status === "processing"
      ? t("item.stillWorking")
      : t("item.untitledItem"));

  // The primary accept gesture: tap the sparkle, the item is in. The badge's
  // exit animation is the confirmation — no navigation, no dialog.
  const accept = () => {
    if (spaceId === undefined) return;
    if (process.env.EXPO_OS === "ios") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    void acceptSuggestion({ itemId: item._id, spaceId }).then(
      (changed) => {
        if (changed) analytics.capture("suggestion_accepted");
      },
      (err) => analytics.captureError("suggestion_accept_failed", err),
    );
  };

  const dismiss = () => {
    if (spaceId === undefined) return;
    void dismissSuggestion({ itemId: item._id, spaceId }).then(
      (changed) => {
        if (changed) analytics.capture("suggestion_dismissed");
      },
      (err) => analytics.captureError("suggestion_dismiss_failed", err),
    );
  };

  const confirmDelete = () => {
    Alert.alert(t("item.deleteTitle"), t("item.deleteBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: () =>
          deleteItem({ id: item._id }).then(() =>
            forgetDeletedSharedItem(item._id),
          ),
      },
    ]);
  };

  const menuActions = cardMenuActions({
    isSuggested,
    hasUrl: item.url !== undefined,
    isReady: item.status === "ready",
    accept,
    dismiss,
    share,
    changeSpaces,
    confirmDelete,
  });

  return (
    <Animated.View
      entering={reducedMotion ? undefined : FadeIn.duration(300)}
      style={styles.cell}
    >
      <Link
        href={{ pathname: "/item/[id]", params: { id: item._id, ...source } }}
        asChild
      >
        <Link.Trigger withAppleZoom={!reducedMotion}>
          <Pressable
            // `role`, not `accessibilityRole`: Link spreads its own role="link"
            // onto this trigger, and React Native reads `role` first on both
            // platforms (RCTViewComponentView.mm, ReactAccessibilityDelegate.kt),
            // so an accessibilityRole here would never reach the screen reader.
            role="button"
            accessibilityLabel={accessibilityLabel}
            testID={
              item.fixtureKey ? `fixture-item-${item.fixtureKey}` : undefined
            }
          >
            {/* Link.Trigger's Slot drops a Pressable style function (it merges
                style by object spread), so the card's look lives on the face's
                View, driven by the Pressable's render-prop children. */}
            {({ pressed }) => (
              <ItemCardFace
                item={item}
                menuActions={menuActions}
                suggested={isSuggested}
                onAcceptSuggestion={accept}
                pressed={pressed}
              />
            )}
          </Pressable>
        </Link.Trigger>
        <Link.Preview />
        {/* The iOS long-press context menu. Expo Router walks the Link's
            direct children by element type, so these must be literal
            Link.Menu / Link.MenuAction elements here — a component returning
            them is silently discarded and the menu renders empty. */}
        <Link.Menu>
          {isSuggested && (
            <Link.MenuAction
              title={t("spaces.addItem")}
              icon="plus"
              onPress={accept}
            />
          )}
          {isSuggested && (
            <Link.MenuAction
              title={t("spaces.dismissSuggestion")}
              icon="xmark"
              destructive
              onPress={dismiss}
            />
          )}
          {!isSuggested && item.url ? (
            <Link.MenuAction
              title={t("common.share")}
              icon="square.and.arrow.up"
              onPress={share}
            />
          ) : null}
          {!isSuggested && item.status === "ready" ? (
            <Link.MenuAction
              title={t("spaces.changeMembership")}
              icon="tray.and.arrow.up"
              onPress={changeSpaces}
            />
          ) : null}
          {!isSuggested && (
            <Link.MenuAction
              title={t("common.delete")}
              icon="trash"
              destructive
              onPress={confirmDelete}
            />
          )}
        </Link.Menu>
      </Link>
    </Animated.View>
  );
});

const styles = StyleSheet.create(() => ({
  cell: {
    padding: 4,
  },
}));
