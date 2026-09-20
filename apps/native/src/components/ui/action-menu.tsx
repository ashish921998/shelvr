import { MenuView } from "@expo/ui/community/menu";
import type { ReactNode } from "react";
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
      onResponderRelease={markMenuOpen}
    >
      <MenuView
        title={title}
        actions={actions.map((action) => ({
          id: action.id ?? action.label,
          title: action.label,
          attributes: {
            destructive: action.destructive,
            disabled: action.disabled,
          },
        }))}
        onPressAction={({ nativeEvent }) => {
          menuOpen = false;
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
          style={style}
        >
          {children}
        </View>
      </MenuView>
    </View>
  );
}

const claimTouch = () => true;
const keepTouch = () => false;

// iOS closes an open menu on the next tap outside it, and still delivers that
// tap to React Native. The app root drops it with `dropMenuDismissTouch`, so
// the tap does not also press whatever sits under it. Picking an item never
// reaches React Native, and leaving the app closes the menu, so both clear it.
let menuOpen = false;
const markMenuOpen = () => {
  menuOpen = Platform.OS === "ios";
};
AppState.addEventListener("change", () => {
  menuOpen = false;
});

export function dropMenuDismissTouch() {
  const dismissing = menuOpen;
  menuOpen = false;
  return dismissing;
}
