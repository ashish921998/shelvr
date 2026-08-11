import { AppTabs } from '@/components/ui/app-tab-bar';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { DynamicColorIOS, Platform, type ColorValue } from 'react-native';

const tint: ColorValue =
  Platform.OS === 'ios'
    ? DynamicColorIOS({ light: '#c98a24', dark: '#e6a23c' })
    : '#e6a23c';

export default function TabsLayout() {
  if (Platform.OS === 'ios') {
    return (
      <NativeTabs tintColor={tint} minimizeBehavior="onScrollDown">
        <NativeTabs.Trigger name="(home)">
          <NativeTabs.Trigger.Icon sf={{ default: 'square.grid.2x2', selected: 'square.grid.2x2.fill' }} />
          <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="(spaces)">
          <NativeTabs.Trigger.Icon sf={{ default: 'rectangle.stack', selected: 'rectangle.stack.fill' }} />
          <NativeTabs.Trigger.Label>Spaces</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="(tidy)">
          <NativeTabs.Trigger.Icon sf={{ default: 'photo.stack', selected: 'photo.stack.fill' }} />
          <NativeTabs.Trigger.Label>Tidy</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="(map)">
          <NativeTabs.Trigger.Icon sf={{ default: 'map', selected: 'map.fill' }} />
          <NativeTabs.Trigger.Label>Map</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="(search)" role="search">
          <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    );
  }

  return <AppTabs />;
}
