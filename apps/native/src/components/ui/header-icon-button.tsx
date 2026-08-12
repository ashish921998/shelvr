import { MenuView } from '@expo/ui/community/menu';
import { Icon } from '@/components/symbol';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

export function HeaderIconButton({
  icon,
  label,
  badge,
  disabled,
  onPress,
}: {
  icon: string;
  label: string;
  badge?: number;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { theme } = useUnistyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <HeaderIconContent icon={icon} badge={badge} tintColor={theme.colors.foreground} />
    </Pressable>
  );
}

export type HeaderMenuAction = {
  id?: string;
  label: string;
  destructive?: boolean;
  onPress: () => void;
};

export function HeaderActionMenu({
  icon,
  label,
  title,
  actions,
}: {
  icon: string;
  label: string;
  title: string;
  actions: HeaderMenuAction[];
}) {
  const { theme } = useUnistyles();

  return (
    <MenuView
      title={title}
      actions={actions.map((action) => ({
        id: action.id ?? action.label,
        title: action.label,
        attributes: action.destructive ? { destructive: true } : undefined,
      }))}
      onPressAction={({ nativeEvent }) => {
        actions.find((action) => (action.id ?? action.label) === nativeEvent.event)?.onPress();
      }}
    >
      <View
        accessibilityRole="button"
        accessibilityLabel={label}
        style={styles.button}
      >
        <HeaderIconContent icon={icon} tintColor={theme.colors.foreground} />
      </View>
    </MenuView>
  );
}

function HeaderIconContent({
  icon,
  badge,
  tintColor,
}: {
  icon: string;
  badge?: number;
  tintColor: string;
}) {
  return (
    <>
      <Icon name={icon} size={21} weight="semibold" tintColor={tintColor} />
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  button: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  pressed: { opacity: 0.65 },
  disabled: { opacity: 0.38 },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    backgroundColor: theme.colors.danger,
    borderWidth: 2,
    borderColor: theme.colors.background,
  },
  badgeText: {
    fontFamily: theme.fonts.bold,
    fontSize: 9,
    color: '#fff',
  },
}));
