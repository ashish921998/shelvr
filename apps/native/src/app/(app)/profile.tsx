import { Wordmark } from '@/components/wordmark';
import { openPaywall, presentCustomerCenter, useEntitlement, waitForSheetTransition } from '@/lib/entitlement';
import { useCurrentUser } from '@/lib/current-user';
import { analytics } from '@/lib/analytics';
import { LEGAL_URLS } from '@/lib/legal';
import { api } from '@convex/_generated/api';
import { useAuthActions } from '@convex-dev/auth/react';
import { useMutation } from 'convex/react';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/symbol';
import { useState } from 'react';
import { Alert, Linking, Platform, Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

export default function ProfileScreen() {
  const { signOut } = useAuthActions();
  const { data: user } = useCurrentUser();
  const router = useRouter();
  const { theme } = useUnistyles();
  const { status, loading } = useEntitlement();
  const deleteAccount = useMutation(api.users.deleteCurrentUserAccount);
  const [deleting, setDeleting] = useState(false);

  const proLabel =
    status === 'trialing'
      ? 'Pro — Trial'
      : status === 'pro'
        ? 'Pro'
        : status === 'lifetime'
          ? 'Pro — Lifetime'
          : status === 'lapsed'
            ? 'Pro — Lapsed'
            : loading
              ? '…'
              : 'Start free trial';

  // Customer Center is only relevant to users who have (or had) a subscription
  // — any non-`none` status. A `none` user has nothing to manage and should see
  // the "Start free trial" paywall row instead.
  const hasSubscription = status !== 'none' && !loading;

  // RevenueCat UI (paywall / Customer Center) presents from the root view
  // controller, and UIKit refuses to present while this profile sheet is up
  // ("already presenting RNSScreen"). Dismiss the sheet first, let it settle,
  // then route: an active/lapsed subscriber to Customer Center (cancel/refund/
  // change-plan/restore), a `none` user to the paywall to start a trial.
  const manageSubscription = async () => {
    if (loading) return;
    router.back();
    await waitForSheetTransition();
    if (hasSubscription) {
      const presented = await presentCustomerCenter();
      // Customer Center isn't linked/configured, or identity sync timed out —
      // fall back to the platform's own subscription management page rather
      // than leaving the tap with no visible effect.
      if (!presented) {
        Alert.alert('Manage subscription', 'Manage your subscription in the App Store.', [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Open App Store',
            onPress: () =>
              void Linking.openURL(
                Platform.OS === 'ios'
                  ? 'https://apps.apple.com/account/subscriptions'
                  : 'https://play.google.com/store/account/subscriptions',
              ),
          },
        ]);
      }
    } else {
      void openPaywall(router);
    }
  };

  const openExternal = (url: string) => {
    void Linking.openURL(url);
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      'Delete account?',
      [
        'This permanently deletes your Shelvr account and all of your saves:',
        '• Links, notes, and images',
        '• Spaces and memberships',
        '• Pending uploads and account identity',
        '',
        'Deleting your Shelvr account does not cancel an App Store subscription. Manage or cancel Pro in your Apple ID subscription settings if needed.',
      ].join('\n'),
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              if (deleting) return;
              setDeleting(true);
              try {
                await deleteAccount({});
                await signOut();
                analytics.reset();
              } catch (err) {
                console.error('Account deletion failed', err);
                Alert.alert(
                  'Couldn’t delete account',
                  'Something went wrong. Check your connection and try again, or email support@shelvr.app.',
                );
              } finally {
                setDeleting(false);
              }
            })();
          },
        },
      ],
    );
  };

  return (
    <View style={styles.content}>
      <Wordmark size={30} />
      <Text style={styles.slogan}>Save it for later.</Text>

      <View style={styles.card}>
        <View style={styles.avatar}>
          <Icon name="person.fill" size={20} tintColor={theme.colors.primaryText} />
        </View>
        <Text selectable style={styles.email} numberOfLines={1}>
          {user?.email ?? 'Signed in'}
        </Text>
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.proRow,
          pressed && { opacity: 0.7 },
          loading && { opacity: 0.4 },
        ]}
        disabled={loading}
        onPress={manageSubscription}
      >
        <Icon name="sparkles" size={18} tintColor={theme.colors.primaryText} />
        <Text style={styles.proLabel}>{proLabel}</Text>
        <Icon name="chevron.right" size={16} tintColor={theme.colors.muted} />
      </Pressable>

      <View style={styles.linkGroup}>
        <Pressable
          style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.7 }]}
          onPress={() => openExternal(LEGAL_URLS.terms)}
        >
          <Text style={styles.linkLabel}>Terms of Service</Text>
          <Icon name="arrow.up.right" size={14} tintColor={theme.colors.muted} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.7 }]}
          onPress={() => openExternal(LEGAL_URLS.privacy)}
        >
          <Text style={styles.linkLabel}>Privacy Policy</Text>
          <Icon name="arrow.up.right" size={14} tintColor={theme.colors.muted} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.7 }]}
          onPress={() => openExternal(LEGAL_URLS.supportMailto)}
        >
          <Text style={styles.linkLabel}>Contact support</Text>
          <Icon name="envelope" size={14} tintColor={theme.colors.muted} />
        </Pressable>
      </View>

      <Pressable
        style={({ pressed }) => [styles.signOut, pressed && { opacity: 0.7 }]}
        onPress={async () => {
          // Signing out flips `(app)`'s `isAuthenticated` guard, which renders
          // `<Redirect href="/(auth)/sign-in" />` and unmounts this sheet. Calling
          // `router.back()` here races that redirect — the `(app)` navigator is
          // already gone, so the back action has no navigator to handle it and
          // throws "GO_BACK was not handled by any navigator". Let the auth
          // redirect own the navigation.
          await signOut();
          // Only after sign-out succeeds: drop the PostHog identity so the
          // next user on this device starts a fresh anonymous person.
          analytics.reset();
        }}
      >
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [
          styles.deleteAccount,
          pressed && { opacity: 0.7 },
          deleting && { opacity: 0.4 },
        ]}
        disabled={deleting}
        onPress={confirmDeleteAccount}
      >
        <Text style={styles.deleteAccountText}>
          {deleting ? 'Deleting…' : 'Delete account'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  content: {
    padding: theme.gap(3),
    paddingTop: theme.gap(4),
    gap: theme.gap(1.5),
    alignItems: 'center',
  },
  slogan: {
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    color: theme.colors.muted,
    marginBottom: theme.gap(1),
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.gap(1.5),
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.gap(1.5),
    alignSelf: 'stretch',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  email: {
    flex: 1,
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    color: theme.colors.foreground,
  },
  proRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.gap(1.25),
    alignSelf: 'stretch',
    padding: theme.gap(1.5),
    borderRadius: theme.radius.md,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  proLabel: {
    flex: 1,
    fontFamily: theme.fonts.bold,
    fontSize: 15,
    color: theme.colors.foreground,
  },
  linkGroup: {
    alignSelf: 'stretch',
    borderRadius: theme.radius.md,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    overflow: 'hidden',
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.gap(1.5),
    paddingHorizontal: theme.gap(1.5),
  },
  linkLabel: {
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    color: theme.colors.foreground,
  },
  signOut: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: theme.gap(1.5),
    borderRadius: theme.radius.md,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  signOutText: {
    fontFamily: theme.fonts.bold,
    fontSize: 15,
    color: theme.colors.danger,
  },
  deleteAccount: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: theme.gap(1.25),
  },
  deleteAccountText: {
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    color: theme.colors.muted,
  },
}));
