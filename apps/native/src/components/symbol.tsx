import {
  SymbolView,
  type AndroidSymbol,
  type SFSymbol,
  type SymbolViewProps,
} from 'expo-symbols';
import { Platform } from 'react-native';

/**
 * Maps SF Symbol names used throughout the app to their Material Symbols
 * equivalents. On Android, expo-symbols renders Material Symbols via a
 * font, and requires the name to be passed as { android: 'name' }.
 *
 * Any SF Symbol not in this map will fall back to 'circle' on Android
 * (a neutral placeholder) rather than rendering nothing.
 */
const SF_TO_MATERIAL = {
  // Generic UI
  'xmark': 'close',
  'checkmark': 'check',
  'plus': 'add',
  'ellipsis': 'more_vert',
  'arrow.up.right': 'north_east',
  'checkmark.circle.fill': 'check_circle',
  'exclamationmark.triangle.fill': 'warning',
  'exclamationmark.circle': 'error',
  // People / communication
  'person.fill': 'person',
  'envelope': 'mail',
  'message': 'chat',
  'phone': 'call',
  // Content / media
  'camera': 'photo_camera',
  'photo.on.rectangle': 'add_photo_alternate',
  'photo.on.rectangle.angled': 'add_photo_alternate',
  'photo.stack': 'photo_library',
  'square.grid.2x2': 'grid_view',
  'square.grid.2x2.fill': 'grid_view',
  'star.fill': 'star',
  'heart': 'favorite',
  'play.rectangle': 'smart_display',
  'play.fill': 'play_arrow',
  'rectangle.stack': 'collections_bookmark',
  'rectangle.stack.fill': 'collections_bookmark',
  'link': 'link',
  'safari': 'language',
  'map': 'map',
  'magnifyingglass': 'search',
  // Commerce
  'bag': 'shopping_bag',
  'square.and.arrow.up': 'ios_share',
  // Creation
  'square.and.pencil': 'edit_note',
  'sparkles': 'auto_awesome',
  'trash': 'delete',
  'doc.on.doc': 'content_copy',
  'calendar': 'calendar_month',
  'arrow.up.right.square': 'open_in_new',
  // Navigation
  'chevron.left': 'arrow_back',
  'chevron.right': 'arrow_forward',
  'arrow.uturn.backward': 'undo',
  // Tabs / system
  'house.fill': 'home',
  'gearshape': 'settings',
  'gearshape.fill': 'settings',
  'arrow.2.circlepath': 'refresh',
  'arrow.clockwise': 'refresh',
  'speedometer': 'speed',
  'viewfinder': 'center_focus_strong',
  'figure.run': 'directions_run',
  'hand.tap': 'pan_tool',
  'tray.and.arrow.up': 'move_up',
  'arrow.up': 'arrow_upward',
  'doc.text': 'description',
  'arrow.triangle.2.circlepath.camera': 'cameraswitch',
} as const satisfies Partial<Record<SFSymbol, AndroidSymbol>>;

/** SF Symbol names with an explicit cross-platform Material fallback. */
export type AppSymbolName = keyof typeof SF_TO_MATERIAL;

/**
 * Resolves an SF Symbol name to the cross-platform format that
 * expo-symbols SymbolView expects.
 *
 * On iOS, the original SF Symbol name is used.
 * On Android, the mapped Material Symbols name (or 'circle' fallback).
 */
export function resolveSymbolName(sfName: AppSymbolName): SymbolViewProps['name'] {
  if (Platform.OS === 'ios') {
    return sfName;
  }
  return {
    android: SF_TO_MATERIAL[sfName] ?? 'circle',
  } as const;
}

/**
 * A drop-in replacement for SymbolView that works on both platforms.
 * Pass any supported SF Symbol name; on Android it renders the Material equivalent.
 */
export function AppSymbolIcon({
  name,
  size = 24,
  tintColor,
  weight,
  style,
}: {
  name: AppSymbolName;
  size?: number;
  tintColor?: string;
  weight?: SymbolViewProps['weight'];
  style?: SymbolViewProps['style'];
}) {
  return (
    <SymbolView
      name={resolveSymbolName(name)}
      size={size}
      tintColor={tintColor}
      weight={weight}
      style={style}
    />
  );
}
