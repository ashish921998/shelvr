import { MenuView } from '@expo/ui/community/menu';
import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

export type ActionMenuItem = {
  id?: string;
  label: string;
  destructive?: boolean;
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
    <MenuView
      title={title}
      actions={actions.map((action) => ({
        id: action.id ?? action.label,
        title: action.label,
        attributes: action.destructive ? { destructive: true } : undefined,
      }))}
      onPressAction={({ nativeEvent }) => {
        actions.find(
          (action) => (action.id ?? action.label) === nativeEvent.event,
        )?.onPress();
      }}
    >
      <View accessibilityRole="button" accessibilityLabel={label} style={style}>
        {children}
      </View>
    </MenuView>
  );
}
