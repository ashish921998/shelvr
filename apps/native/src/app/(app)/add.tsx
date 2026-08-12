import { AnimatedText } from '@/components/animated-text';
import { parseExifDate } from '@/lib/date';
import { resolvePickedImageLocation } from '@/lib/picked-image-location';
import { usePaywallGuard } from '@/lib/entitlement';
import { type ImageSaveRequest, useSaveImages } from '@/lib/use-save-image';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { useMutation } from 'convex/react';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Icon } from '@/components/symbol';
import { HeaderIconButton } from '@/components/ui/header-icon-button';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { analytics } from '@/lib/analytics';

type Mode = 'menu' | 'note' | 'article';

function ActionButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { theme } = useUnistyles();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.action, disabled && { opacity: 0.4 }]}
    >
      <View style={styles.actionIcon}>
        <Icon name={icon} size={40} tintColor={theme.colors.foreground} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

export default function AddScreen() {
  const router = useRouter();
  const { theme } = useUnistyles();
  // Opened from inside a space: everything saved here is pre-pinned to it.
  const { spaceId } = useLocalSearchParams<{ spaceId?: string }>();
  const pinnedSpaceId = spaceId as Id<'spaces'> | undefined;
  const [mode, setMode] = useState<Mode>('menu');
  const [saving, setSaving] = useState(false);
  const [value, setValue] = useState('');

  const createLinkItem = useMutation(api.items.createLinkItem);
  const createNoteItem = useMutation(api.items.createNoteItem);
  const saveImages = useSaveImages();
  // Saving is Pro — route to the paywall before composing if not entitled.
  const { guard, loading: entitlementLoading } = usePaywallGuard();

  const trimmed = value.trim();
  const canSave = trimmed.length > 0 && !saving;

  // Prefill the article field with a link already on the clipboard.
  useEffect(() => {
    if (mode !== 'article') return;
    let active = true;
    Clipboard.getUrlAsync().then((url) => {
      if (active && url) setValue((current) => current || url);
    });
    return () => {
      active = false;
    };
  }, [mode]);

  const success = () => {
    if (process.env.EXPO_OS === 'ios') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    router.back();
  };

  const openComposer = (next: Mode) => {
    setValue('');
    setMode(next);
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      if (mode === 'article') {
        await createLinkItem({ url: trimmed, spaceId: pinnedSpaceId });
      } else {
        await createNoteItem({ text: trimmed, spaceId: pinnedSpaceId });
      }
      analytics.capture(mode === 'article' ? 'article_saved' : 'note_saved');
      success();
    } catch {
      Alert.alert('Could not save', 'Something went wrong. Try again.');
      setSaving(false);
    }
  };

  // Runs a batch of image requests, closing on success or reporting a partial
  // outcome. Only failed requests are retained (with their operation ids) for a
  // retry; successful requests are never resubmitted.
  const runImageRequests = async (requests: ImageSaveRequest[]) => {
    if (requests.length === 0) {
      success();
      return;
    }
    setSaving(true);
    try {
      const results = await saveImages(requests, { spaceId: pinnedSpaceId });
      const failed = results.filter((r) => r.status === 'failed');
      if (failed.length === 0) {
        analytics.capture('images_saved', { image_count: results.length });
        success();
        return;
      }
      const savedCount = results.length - failed.length;
      Alert.alert(
        'Could not save all images',
        `${savedCount} of ${results.length} saved. Retry the failed images?`,
        [
          {
            text: 'Retry failed',
            onPress: () => {
              void runImageRequests(
                // Reuse each failed operation id on retry — never mint fresh ones.
                failed.map((r) => ({ image: r.image, operationId: r.operationId })),
              );
            },
          },
          { text: 'Done', onPress: () => router.back() },
        ],
      );
      setSaving(false);
    } catch (err) {
      console.error('Image upload failed:', err);
      Alert.alert('Could not save', 'Uploading those images failed. Try again.');
      setSaving(false);
    }
  };

  const pickImages = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 0.8,
      exif: true,
    });
    if (result.canceled || result.assets.length === 0) return;
    await runImageRequests(
      await Promise.all(
        result.assets.map(async (asset) => ({
          image: {
            uri: asset.uri,
            width: asset.width,
            height: asset.height,
            mimeType: asset.mimeType,
            capturedAt: parseExifDate(asset.exif),
            ...(await resolvePickedImageLocation(asset)),
          },
        })),
      ),
    );
  };

  const isComposer = mode === 'note' || mode === 'article';
  const isArticle = mode === 'article';
  const title = isArticle ? 'Save an article' : mode === 'note' ? 'New note' : 'Save something';

  return (
    <View style={styles.content}>
      <Stack.Screen
        options={{
          headerShown: Platform.OS !== 'android',
          headerTransparent: false,
          headerStyle: { backgroundColor: theme.colors.background },
        }}
      />
      {/* Animated title persists across mode changes so the text cascades
          between "Save something" / "New note" / "Save an article". */}
      <Stack.Title asChild>
        <AnimatedText text={title} style={styles.heading} />
      </Stack.Title>
      {Platform.OS === 'android' ? (
        <View style={styles.androidHeader}>
          <HeaderIconButton
            icon={isComposer ? 'chevron.left' : 'xmark'}
            label={isComposer ? 'Back to save options' : 'Close save options'}
            onPress={isComposer ? () => setMode('menu') : () => router.back()}
          />
          <Text style={styles.androidHeaderTitle}>{title}</Text>
          {isComposer ? (
            <HeaderIconButton
              icon="checkmark"
              label="Save"
              disabled={!canSave}
              onPress={save}
            />
          ) : (
            <View style={styles.androidHeaderSpacer} />
          )}
        </View>
      ) : null}
      {isComposer && Platform.OS === 'ios' ? (
        <>
          <Stack.Toolbar placement="left">
            <Stack.Toolbar.Button
              icon="chevron.left"
              tintColor={theme.colors.primary}
              onPress={() => setMode('menu')}
            >
              Back
            </Stack.Toolbar.Button>
          </Stack.Toolbar>
          <Stack.Toolbar placement="right">
            <Stack.Toolbar.Button
              icon="checkmark"
              tintColor={canSave ? theme.colors.primary : theme.colors.muted}
              onPress={save}
            >
              Save
            </Stack.Toolbar.Button>
          </Stack.Toolbar>
        </>
      ) : null}

      {isComposer ? (
        <TextInput
          style={isArticle ? styles.articleInput : styles.noteInput}
          value={value}
          onChangeText={setValue}
          placeholder={isArticle ? 'Paste or type a link…' : 'Jot a note…'}
          placeholderTextColor={theme.colors.muted}
          autoFocus
          multiline={!isArticle}
          autoCapitalize={isArticle ? 'none' : 'sentences'}
          autoCorrect={!isArticle}
          keyboardType={isArticle ? 'url' : 'default'}
          returnKeyType={isArticle ? 'done' : 'default'}
          onSubmitEditing={isArticle ? save : undefined}
          editable={!saving}
        />
      ) : (
        <View style={styles.actions}>
          <ActionButton
            icon="square.and.pencil"
            label="Note"
            onPress={() => guard(() => openComposer('note'))}
            disabled={saving || entitlementLoading}
          />
          <ActionButton
            icon="link"
            label="Article"
            onPress={() => guard(() => openComposer('article'))}
            disabled={saving || entitlementLoading}
          />
          <ActionButton
            icon="photo.on.rectangle"
            label="Photos"
            onPress={() => guard(pickImages)}
            disabled={saving || entitlementLoading}
          />
          <ActionButton
            icon="camera"
            label="Camera"
            onPress={() =>
              guard(() => {
                router.back();
                router.push({
                  pathname: '/camera',
                  params: pinnedSpaceId ? { spaceId: pinnedSpaceId } : {},
                });
              })
            }
            disabled={saving || entitlementLoading}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  content: {
    padding: theme.gap(2.5),
    paddingTop: theme.gap(2),
    gap: theme.gap(1.5),
  },
  heading: {
    fontFamily: theme.fonts.display,
    fontSize: 24,
    color: theme.colors.foreground,
  },
  androidHeader: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  androidHeaderTitle: {
    flex: 1,
    paddingHorizontal: theme.gap(1.5),
    fontFamily: theme.fonts.display,
    fontSize: 22,
    color: theme.colors.foreground,
    textAlign: 'center',
  },
  androidHeaderSpacer: {
    width: 40,
    height: 40,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: theme.gap(2),
  },
  action: {
    alignItems: 'center',
    gap: theme.gap(0.75),
    minWidth: 64,
  },
  actionIcon: {
    padding: theme.gap(1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontFamily: theme.fonts.medium,
    fontSize: 12,
    color: theme.colors.foreground,
    textAlign: 'center',
  },
  noteInput: {
    fontFamily: theme.fonts.regular,
    fontSize: 18,
    color: theme.colors.foreground,
    minHeight: 120,
    padding: theme.gap(1.5),
    borderRadius: theme.radius.lg,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    textAlignVertical: 'top',
  },
  articleInput: {
    fontFamily: theme.fonts.regular,
    fontSize: 18,
    color: theme.colors.foreground,
    padding: theme.gap(1.5),
    borderRadius: theme.radius.lg,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
}));
