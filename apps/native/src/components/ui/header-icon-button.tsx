import { AppSymbolIcon, type AppSymbolName } from '@/components/symbol';
import {
  ActionMenu,
  type ActionMenuItem,
} from '@/components/ui/action-menu';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

export function HeaderIconButton({
  icon,
  label,
  badge,
  disabled,
  onPress,
}: {
  icon: AppSymbolName;
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

export type HeaderMenuAction = ActionMenuItem;

export function HeaderActionMenu({
  icon,
  label,
  title,
  actions,
}: {
  icon: AppSymbolName;
  label: string;
  title: string;
  actions: HeaderMenuAction[];
}) {
  const { theme } = useUnistyles();

  return (
    <ActionMenu
      label={label}
      title={title}
      actions={actions}
      style={styles.button}
    >
      <HeaderIconContent icon={icon} tintColor={theme.colors.foreground} />
    </ActionMenu>
  );
}

function HeaderIconContent({
  icon,
  badge,
  tintColor,
}: {
  icon: AppSymbolName;
  badge?: number;
  tintColor: string;
}) {
  return (
    <>
      <AppSymbolIcon name={icon} size={21} weight="semibold" tintColor={tintColor} />
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
