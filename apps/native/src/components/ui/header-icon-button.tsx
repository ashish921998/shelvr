import { Icon } from '@/components/symbol';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
      <Icon name={icon} size={21} weight="semibold" tintColor={theme.colors.foreground} />
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      ) : null}
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
  const [visible, setVisible] = useState(false);
  const insets = useSafeAreaInsets();

  const choose = (action: HeaderMenuAction) => {
    setVisible(false);
    action.onPress();
  };

  return (
    <>
      <HeaderIconButton icon={icon} label={label} onPress={() => setVisible(true)} />
      <Modal
        animationType="fade"
        transparent
        visible={visible}
        onRequestClose={() => setVisible(false)}
      >
        <View style={styles.backdrop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close menu"
            style={StyleSheet.absoluteFillObject}
            onPress={() => setVisible(false)}
          />
          <View
            accessibilityRole="menu"
            style={[styles.menu, { paddingBottom: Math.max(insets.bottom, 16) }]}
          >
            <Text style={styles.menuTitle}>{title}</Text>
            <ScrollView style={styles.menuActions} showsVerticalScrollIndicator={false}>
              {actions.map((action) => (
                <Pressable
                  key={action.id ?? action.label}
                  accessibilityRole="menuitem"
                  onPress={() => choose(action)}
                  style={({ pressed }) => [styles.menuAction, pressed && styles.pressed]}
                >
                  <Text style={[styles.menuActionText, action.destructive && styles.destructiveText]}>
                    {action.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable
              accessibilityRole="button"
              onPress={() => setVisible(false)}
              style={({ pressed }) => [styles.cancelAction, pressed && styles.pressed]}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.38)',
  },
  menu: {
    maxHeight: '70%',
    paddingTop: 18,
    paddingHorizontal: 16,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: theme.colors.background,
  },
  menuTitle: {
    paddingHorizontal: 8,
    paddingBottom: 12,
    fontFamily: theme.fonts.bold,
    fontSize: 17,
    color: theme.colors.foreground,
  },
  menuActions: {
    flexGrow: 0,
  },
  menuAction: {
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  menuActionText: {
    fontFamily: theme.fonts.medium,
    fontSize: 16,
    color: theme.colors.foreground,
  },
  destructiveText: {
    color: theme.colors.danger,
  },
  cancelAction: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    borderRadius: 16,
    backgroundColor: theme.colors.surface,
  },
  cancelText: {
    fontFamily: theme.fonts.bold,
    fontSize: 16,
    color: theme.colors.foreground,
  },
}));
