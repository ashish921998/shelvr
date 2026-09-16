import { MenuView } from "@expo/ui/community/menu";
import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

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
