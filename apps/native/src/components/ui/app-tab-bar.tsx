import { Icon } from '@/components/symbol';
import { Tabs, TabList, TabSlot, TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui';
import { forwardRef } from 'react';
import { Pressable, Text, View, type View as NativeView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

const tabs = [
  { name: '(home)', href: '/(app)/(tabs)/(home)', label: 'Home', icon: 'square.grid.2x2' },
  { name: '(spaces)', href: '/(app)/(tabs)/(spaces)', label: 'Spaces', icon: 'rectangle.stack' },
  { name: '(tidy)', href: '/(app)/(tabs)/(tidy)', label: 'Tidy', icon: 'photo.stack' },
  { name: '(map)', href: '/(app)/(tabs)/(map)', label: 'Map', icon: 'map' },
  { name: '(search)', href: '/(app)/(tabs)/(search)', label: 'Search', icon: 'magnifyingglass' },
] as const;

export const TAB_DOCK_HEIGHT = 64;
export const TAB_DOCK_GAP = 12;

const TabButton = forwardRef<NativeView, TabTriggerSlotProps & { label: string; icon: string }>(
  function TabButton({ isFocused, label, icon, style: _style, ...props }, ref) {
    const { theme } = useUnistyles();
    return (
      <Pressable
        ref={ref}
        accessibilityRole="tab"
        accessibilityLabel={label}
        accessibilityState={{ selected: isFocused }}
        hitSlop={6}
        style={({ pressed }) => [styles.item, pressed && styles.pressed]}
        {...props}
      >
        <View style={[styles.iconWell, isFocused && styles.iconWellActive]}>
          <Icon
            name={icon}
            size={21}
            weight={isFocused ? 'semibold' : 'medium'}
            tintColor={isFocused ? theme.colors.foreground : theme.colors.muted}
          />
        </View>
        <Text style={[styles.label, isFocused && styles.labelActive]}>{label}</Text>
      </Pressable>
    );
  },
);

export function AppTabs() {
  const insets = useSafeAreaInsets();
  const dockBottom = Math.max(insets.bottom, 10);
  const contentBottomInset = dockBottom + TAB_DOCK_HEIGHT + TAB_DOCK_GAP;

  return (
    <Tabs style={styles.root} options={{ backBehavior: 'history' }}>
      <TabSlot style={[styles.slot, { paddingBottom: contentBottomInset }]} />
      <TabList style={[styles.dock, { bottom: dockBottom }]}>
        {tabs.map((tab) => (
          <TabTrigger key={tab.name} name={tab.name} href={tab.href} asChild>
            <TabButton label={tab.label} icon={tab.icon} />
          </TabTrigger>
        ))}
      </TabList>
    </Tabs>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  slot: {
    flex: 1,
  },
  dock: {
    position: 'absolute',
    left: 12,
    right: 12,
    height: TAB_DOCK_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 5,
    paddingVertical: 5,
    borderRadius: 26,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    boxShadow: '0 8px 28px rgba(43,36,24,0.18)',
  },
  item: {
    flex: 1,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: 20,
  },
  pressed: {
    opacity: 0.65,
  },
  iconWell: {
    height: 30,
    width: 30,
    borderRadius: 999,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWellActive: {
    backgroundColor: theme.colors.primarySoft,
  },
  label: {
    fontFamily: theme.fonts.medium,
    fontSize: 10,
    lineHeight: 12,
    color: theme.colors.muted,
  },
  labelActive: {
    color: theme.colors.primaryText,
  },
}));
