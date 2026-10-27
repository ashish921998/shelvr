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
  selected?: boolean;
  onPress: () => void;
};

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
  useEffect(() => {
    const self = owner.current;
    return () => {
      if (openMenu === self) openMenu = null;
    };
  }, []);
  const isAndroid = process.env.EXPO_OS === "android";
  return (
    // On iOS the SwiftUI menu is an unlabelled button of its own around the trigger, so
    // VoiceOver found two elements. This outer view is the one element instead: it carries
    // the label, hides both from VoiceOver, and a double tap lands on the menu at its centre.
    <View
      accessible={isAndroid ? undefined : true}
      accessibilityRole={isAndroid ? undefined : "button"}
      accessibilityLabel={isAndroid ? undefined : label}
      onStartShouldSetResponder={claimTouch}
      onResponderTerminationRequest={keepTouch}
      onResponderGrant={({ nativeEvent }) => {
        pressedAt.current = nativeEvent;
      }}
      onResponderRelease={({ nativeEvent }) => {
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
          accessibilityRole={isAndroid ? "button" : undefined}
          accessibilityLabel={isAndroid ? label : undefined}
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

const TAP_SLOP = 10;
const claimTouch = () => true;
const keepTouch = () => false;

let openMenu: object | null = null;
AppState.addEventListener("change", () => {
  openMenu = null;
});

export function dropMenuDismissTouch() {
  const dismissing = openMenu !== null;
  openMenu = null;
  return dismissing;
}
