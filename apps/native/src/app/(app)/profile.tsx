import { Wordmark } from '@/components/wordmark';
import { HeaderIconButton } from '@/components/ui/header-icon-button';
import {
  openPaywall,
  presentCustomerCenter,
  restorePurchases,
  useEntitlement,
  waitForSheetTransition,
} from '@/lib/entitlement';
import { useCurrentUser } from '@/lib/current-user';
import { analytics } from '@/lib/analytics';
import { LEGAL_URLS, SUPPORT_URL } from '@/lib/legal';
import { api } from '@convex/_generated/api';
import { useAuthActions } from '@convex-dev/auth/react';
import { convexQuery } from '@convex-dev/react-query';
import { useQuery } from '@tanstack/react-query';
import { useMutation } from 'convex/react';
import { useRouter } from 'expo-router';
import { AppSymbolIcon } from '@/components/symbol';
import { useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

export default function ProfileScreen() {
  const { signOut } = useAuthActions();
  const { data: user } = useCurrentUser();
  const router = useRouter();
  const { theme } = useUnistyles();
  const { status, loading } = useEntitlement();
  const deleteAccount = useMutation(api.users.deleteCurrentUserAccount);
  const [deleting, setDeleting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [resettingFixtures, setResettingFixtures] = useState(false);
  const fixtureResetEnabled =
    __DEV__ && process.env.EXPO_PUBLIC_AUTH_ENABLE_ANONYMOUS === 'true';
  const { data: canResetFlowFixtures } = useQuery(
    convexQuery(
      api.devFixtures.canResetCurrentUser,
      fixtureResetEnabled && user ? {} : 'skip',
    ),
  );
  const resetFlowFixtures = useMutation(api.devFixtures.resetCurrentUser);

  const closeProfile = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    // A development reload or direct link can restore Profile as the root
    // route. In that state there is no history entry for Android Back to pop.
    router.replace('/');
  };

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
              : 'View Pro plans';

  // Customer Center is only relevant to users who have (or had) a subscription
  // — any non-`none` status. A `none` user has nothing to manage and should see
  // the "View Pro plans" paywall row instead.
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
      void openPaywall(router, 'profile');
    }
  };

  const openExternal = (url: string) => {
    void Linking.openURL(url);
  };

  const handleRestorePurchases = async () => {
    if (restoring) return;
    const storeName = Platform.OS === 'ios' ? 'App Store' : 'Google Play';
    setRestoring(true);
    try {
      const outcome = await restorePurchases();
      if (outcome === 'restored') {
        Alert.alert(
          'Purchases restored',
          `Your ${storeName} purchase was found. Shelvr Pro may take a moment to update.`,
        );
      } else if (outcome === 'none') {
        Alert.alert(
          'No active purchase found',
          `No active Shelvr Pro purchase was found for this ${storeName} account.`,
        );
      } else {
        Alert.alert(
          'Couldn’t restore purchases',
          `Check your connection and try again. You can also manage your plan in ${storeName}.`,
        );
      }
    } finally {
      setRestoring(false);
    }
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
                try {
                  await deleteAccount({});
                } catch (err) {
                  console.error('Account deletion failed', err);
                  Alert.alert(
                    'Couldn’t delete account',
                    'Something went wrong. Check your connection and try again, or email support@shelvr.app.',
                  );
                  return;
                }
                // The account is gone server-side; local cleanup is best-effort
                // and must never be reported as a deletion failure.
                try {
                  await signOut();
                } catch (err) {
                  console.error('Sign-out after account deletion failed', err);
                }
                try {
                  analytics.reset();
                } catch (err) {
                  console.error('Analytics reset after account deletion failed', err);
                }
              } finally {
                setDeleting(false);
              }
            })();
          },
        },
      ],
    );
  };

  const confirmResetFlowFixtures = () => {
    Alert.alert(
      'Reset flow fixtures?',
      'This replaces this anonymous development account’s saves and spaces with deterministic flow data.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              if (resettingFixtures) return;
              setResettingFixtures(true);
              try {
                const result = await resetFlowFixtures({});
                Alert.alert(
                  'Flow fixtures ready',
                  `${result.items} saves and ${result.spaces} spaces were created.`,
                );
              } catch (error) {
                console.error('Flow fixture reset failed', error);
                Alert.alert(
                  'Couldn’t reset fixtures',
                  'Use an anonymous account on a development deployment and try again.',
                );
              } finally {
                setResettingFixtures(false);
              }
            })();
          },
        },
      ],
    );
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.content}
    >
      {process.env.EXPO_OS === 'android' ? (
        <View style={styles.sheetHeader}>
          <Wordmark size={30} />
          <HeaderIconButton icon="xmark" label="Close profile" onPress={closeProfile} />
        </View>
      ) : (
        <Wordmark size={30} />
      )}
      <Text style={styles.slogan}>Save it for later.</Text>

      <View style={styles.card}>
        <View style={styles.avatar}>
          <AppSymbolIcon name="person.fill" size={20} tintColor={theme.colors.primaryText} />
        </View>
        <Text selectable style={styles.email} numberOfLines={1}>
          {user?.email ?? 'Signed in'}
        </Text>
      </View>

      {fixtureResetEnabled && canResetFlowFixtures ? (
        <Pressable
          testID="reset-flow-fixtures"
          accessibilityRole="button"
          accessibilityLabel="Reset flow fixtures"
          style={({ pressed }) => [
            styles.fixtureReset,
            pressed && { opacity: 0.7 },
            resettingFixtures && { opacity: 0.4 },
          ]}
          disabled={resettingFixtures}
          onPress={confirmResetFlowFixtures}
        >
          <Text style={styles.fixtureResetText}>
            {resettingFixtures ? 'Resetting flow fixtures…' : 'Reset flow fixtures'}
          </Text>
        </Pressable>
      ) : null}

      <Pressable
        style={({ pressed }) => [
          styles.proRow,
          pressed && { opacity: 0.7 },
          loading && { opacity: 0.4 },
        ]}
        disabled={loading}
        onPress={manageSubscription}
      >
        <AppSymbolIcon name="sparkles" size={18} tintColor={theme.colors.primaryText} />
        <Text style={styles.proLabel}>{proLabel}</Text>
        <AppSymbolIcon name="chevron.right" size={16} tintColor={theme.colors.muted} />
      </Pressable>

      <View style={styles.linkGroup}>
        <Pressable
          style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.7 }]}
          onPress={() => openExternal(SUPPORT_URL)}
        >
          <Text style={styles.linkLabel}>Contact Support</Text>
          <AppSymbolIcon name="arrow.up.right" size={14} tintColor={theme.colors.muted} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.linkRow,
            pressed && { opacity: 0.7 },
            restoring && { opacity: 0.4 },
          ]}
          disabled={restoring}
          onPress={() => void handleRestorePurchases()}
        >
          <Text style={styles.linkLabel}>
            {restoring ? 'Restoring Purchases…' : 'Restore Purchases'}
          </Text>
          <AppSymbolIcon name="arrow.clockwise" size={14} tintColor={theme.colors.muted} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.7 }]}
          onPress={() => openExternal(LEGAL_URLS.terms)}
        >
          <Text style={styles.linkLabel}>Terms of Service</Text>
          <AppSymbolIcon name="arrow.up.right" size={14} tintColor={theme.colors.muted} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.7 }]}
          onPress={() => openExternal(LEGAL_URLS.privacy)}
        >
          <Text style={styles.linkLabel}>Privacy Policy</Text>
          <AppSymbolIcon name="arrow.up.right" size={14} tintColor={theme.colors.muted} />
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
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme) => ({
  content: {
    flexGrow: 1,
    padding: theme.gap(3),
    paddingTop: theme.gap(4),
    paddingBottom: theme.gap(4),
    gap: theme.gap(1.5),
    alignItems: 'center',
  },
  sheetHeader: {
    width: '100%',
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  fixtureReset: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: theme.gap(1.5),
    borderRadius: theme.radius.md,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  fixtureResetText: {
    fontFamily: theme.fonts.bold,
    fontSize: 15,
    color: theme.colors.primary,
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
