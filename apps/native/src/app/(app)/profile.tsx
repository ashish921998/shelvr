import { Wordmark } from '@/components/wordmark';
import { openPaywall, presentCustomerCenter, useEntitlement } from '@/lib/entitlement';
import { useClerk, useUser } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/symbol';
import { Alert, Linking, Platform, Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

export default function ProfileScreen() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const router = useRouter();
  const { theme } = useUnistyles();
  const { status, loading } = useEntitlement();

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
  // — trialing/pro/lifetime/lapsed. A `none` user has nothing to manage and
  // should see the "Start free trial" paywall row instead.
  const hasSubscription =
    status === 'trialing' ||
    status === 'pro' ||
    status === 'lifetime' ||
    status === 'lapsed';

  return (
    <View style={styles.content}>
      <Wordmark size={30} />
      <Text style={styles.slogan}>Save it for later.</Text>

      <View style={styles.card}>
        <View style={styles.avatar}>
          <Icon name="person.fill" size={20} tintColor={theme.colors.primaryText} />
        </View>
        <Text selectable style={styles.email} numberOfLines={1}>
          {user?.primaryEmailAddress?.emailAddress ?? 'Signed in'}
        </Text>
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.proRow,
          pressed && { opacity: 0.7 },
          loading && { opacity: 0.4 },
        ]}
        disabled={loading}
        onPress={async () => {
          if (loading) return;
          // An active/lapsed subscriber manages their existing subscription
          // via Customer Center; a `none` user is sent to the paywall to start
          // one. Customer Center is the modern RevenueCat way to expose
          // cancel/refund/change-plan/restore without leaving the app.
          if (hasSubscription) {
            const presented = await presentCustomerCenter();
            // Customer Center isn't linked/configured, or identity sync timed
            // out — fall back to the platform's own subscription management
            // page rather than leaving the tap with no visible effect.
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
        }}
      >
        <Icon name="sparkles" size={18} tintColor={theme.colors.primaryText} />
        <Text style={styles.proLabel}>{proLabel}</Text>
        <Icon name="chevron.right" size={16} tintColor={theme.colors.muted} />
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.signOut, pressed && { opacity: 0.7 }]}
        onPress={async () => {
          await signOut();
          router.back();
        }}
      >
        <Text style={styles.signOutText}>Sign out</Text>
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
}));
