import { Alert, ActionSheetIOS, Platform } from 'react-native';

export type ActionSheetOption = {
  label: string;
  destructive?: boolean;
  onPress: () => void;
};

/**
 * Shows a platform-appropriate action sheet.
 *
 * On iOS, uses ActionSheetIOS for the native blur-behind sheet.
 * On Android, falls back to Alert.alert with buttons (the standard
 * Android pattern for context menus).
 *
 * `title` and `message` are only used in the Android Alert fallback.
 */
export function showActionSheet(
  options: ActionSheetOption[],
  opts?: { title?: string; message?: string },
) {
  const cancelButtonIndex = options.length;

  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [...options.map((o) => o.label), 'Cancel'],
        destructiveButtonIndex: options.findIndex((o) => o.destructive),
        cancelButtonIndex,
      },
      (index) => {
        options[index]?.onPress();
      },
    );
  } else {
    // Alert.alert supports at most 3 buttons on Android. Reserve one slot
    // for Cancel, leaving room for 2 actions. If there are more than 2,
    // keep the first non-destructive action and the last destructive one
    // (Delete is the action users need most).
    const MAX_ACTION_BUTTONS = 2;
    let actionButtons = options;
    if (options.length > MAX_ACTION_BUTTONS) {
      const nonDestructive = options.filter((o) => !o.destructive);
      const destructive = options.filter((o) => o.destructive);
      actionButtons = [
        ...nonDestructive.slice(0, MAX_ACTION_BUTTONS - Math.min(destructive.length, 1)),
        ...destructive.slice(-1),
      ].slice(0, MAX_ACTION_BUTTONS);
    }

    const buttons: Array<{
      text: string;
      style: 'default' | 'destructive' | 'cancel';
      onPress: () => void;
    }> = actionButtons.map((o) => ({
      text: o.label,
      style: o.destructive ? ('destructive' as const) : ('default' as const),
      onPress: o.onPress,
    }));
    buttons.push({ text: 'Cancel', style: 'cancel' as const, onPress: () => {} });
    Alert.alert(opts?.title ?? '', opts?.message, buttons);
  }
}
