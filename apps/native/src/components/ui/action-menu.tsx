import { MenuView, type MenuComponentRef } from "@expo/ui/community/menu";
import { useEffect, useRef, type ReactNode } from "react";
import {
  AppState,
  Platform,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

export type ActionMenuItem = {
  id?: string;
  label: string;
  destructive?: boolean;
  disabled?: boolean;
  /** Shows the platform checkmark, for a menu that picks one value. */
  selected?: boolean;
  onPress: () => void;
};

/**
 * A platform-native anchored menu with a shared action shape.
 *
 * Android renders a compact Material dropdown beside the trigger; iOS renders
 * the system menu. Keeping this declarative also avoids Android's oversized
 * empty Alert layout when a context menu has no title or message.
 */
export function ActionMenu({
  label,
  title,
  actions,
  children,
  style,
}: {
  label: string;
  title: string;
  actions: ActionMenuItem[];
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const menu = useRef<MenuComponentRef>(null);
  const owner = useRef({});
  const pressedAt = useRef({ pageX: 0, pageY: 0 });
  // A card can unmount with its menu open (deleted elsewhere, or the list
  // changed), so the tap that would have closed it never comes.
  useEffect(() => {
    const self = owner.current;
    return () => {
      if (openMenu === self) openMenu = null;
    };
  }, []);
  const isAndroid = process.env.EXPO_OS === "android";
  return (
    // On iOS the SwiftUI menu opens from a native gesture that React Native's
    // responder system never sees. Without a responder here, the touch bubbles
    // to the nearest JS `Pressable` ancestor (a card's `Link`), and one tap both
    // opens the menu and navigates. The native gesture also reaches JS as a
    // second touch start, which asks this view to hand the touch to that
    // ancestor, so it refuses. The native gesture still fires.
    <View
      onStartShouldSetResponder={claimTouch}
      onResponderTerminationRequest={keepTouch}
      onResponderGrant={({ nativeEvent }) => {
        pressedAt.current = nativeEvent;
      }}
      onResponderRelease={({ nativeEvent }) => {
        // A finger that slid off before lifting opened no menu, and marking
        // one open would drop the next unrelated tap.
        const tapped =
          Math.abs(nativeEvent.pageX - pressedAt.current.pageX) <= TAP_SLOP &&
          Math.abs(nativeEvent.pageY - pressedAt.current.pageY) <= TAP_SLOP;
        openMenu = Platform.OS === "ios" && tapped ? owner.current : null;
      }}
    >
      <MenuView
        ref={menu}
        title={title}
        actions={actions.map((action) => ({
          id: action.id ?? action.label,
          title: action.label,
          attributes: {
            destructive: action.destructive,
            disabled: action.disabled,
          },
          ...(action.selected === undefined
            ? {}
            : { state: action.selected ? ("on" as const) : ("off" as const) }),
        }))}
        onPressAction={({ nativeEvent }) => {
          openMenu = null;
          actions
            .find(
              (action) =>
                !action.disabled &&
                (action.id ?? action.label) === nativeEvent.event,
            )
            ?.onPress();
        }}
      >
        <View
          accessibilityRole="button"
          accessibilityLabel={label}
          // Android's trigger Pressable opts out of accessibility, so TalkBack's
          // double tap would land on this View with nothing to run. Route the
          // activate action to the menu. iOS's SwiftUI menu handles VoiceOver.
          accessible={isAndroid ? true : undefined}
          accessibilityActions={isAndroid ? [{ name: "activate" }] : undefined}
          onAccessibilityAction={
            isAndroid
              ? ({ nativeEvent }) => {
                  if (nativeEvent.actionName === "activate")
                    menu.current?.show();
                }
              : undefined
          }
          style={style}
        >
          {children}
        </View>
      </MenuView>
    </View>
  );
}

// How far a finger may drift and still count as a tap, in points.
const TAP_SLOP = 10;
const claimTouch = () => true;
const keepTouch = () => false;

// iOS closes an open menu on the next tap outside it, and still delivers that
// tap to React Native. The app root drops it with `dropMenuDismissTouch`, so
// the tap does not also press whatever sits under it. Picking an item never
// reaches React Native, and leaving the app closes the menu, so both clear it.
// `openMenu` is the menu that is open, so an unmounting menu clears only itself.
let openMenu: object | null = null;
AppState.addEventListener("change", () => {
  openMenu = null;
});

export function dropMenuDismissTouch() {
  const dismissing = openMenu !== null;
  openMenu = null;
  return dismissing;
}
