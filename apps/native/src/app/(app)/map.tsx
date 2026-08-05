import { EmptyState } from '@/components/empty-state';
import { useEntitlement, usePaywallGuard } from '@/lib/entitlement';
import { api } from '@convex/_generated/api';
import { convexQuery } from '@convex-dev/react-query';
import { useQuery } from '@tanstack/react-query';
import { AppleMaps, GoogleMaps } from 'expo-maps';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

// The accent color matches theme.colors.primary (identical in both themes).
const ACCENT = '#e6a23c';

type Located = {
  id: string;
  title: string;
  latitude: number;
  longitude: number;
};

/** Frames every marker: bounding-box midpoint, zoomed so the widest span
 * fits. `log2(360 / span)` is the standard web-mercator zoom for a span in
 * degrees; the -0.5 leaves breathing room at the edges. */
function fitCamera(items: Located[]) {
  const lats = items.map((i) => i.latitude);
  const lons = items.map((i) => i.longitude);
  const latMin = Math.min(...lats);
  const latMax = Math.max(...lats);
  const lonMin = Math.min(...lons);
  const lonMax = Math.max(...lons);
  const span = Math.max(latMax - latMin, lonMax - lonMin);
  const zoom =
    span === 0 ? 13 : Math.min(13, Math.max(2, Math.log2(360 / span) - 0.5));
  return {
    coordinates: {
      latitude: (latMin + latMax) / 2,
      longitude: (lonMin + lonMax) / 2,
    },
    zoom,
  };
}

export default function MapScreen() {
  const router = useRouter();
  const { entitled, loading: entitlementLoading } = useEntitlement();
  const { data: items } = useQuery({
    ...convexQuery(api.items.listItems, {}),
    enabled: !entitlementLoading && entitled,
  });

  const located = useMemo(
    () =>
      (items ?? [])
        .filter((i) => i.latitude !== undefined && i.longitude !== undefined)
        .map((i) => ({
          id: i._id,
          title: i.title ?? 'Saved photo',
          latitude: i.latitude!,
          longitude: i.longitude!,
        })),
    [items],
  );

  const cameraPosition = useMemo(
    () => (located.length > 0 ? fitCamera(located) : undefined),
    [located],
  );

  if (entitlementLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }

  // Map is a Pro feature — a lapsed user who deep-links here is bounced to the
  // paywall instead of seeing the map.
  if (!entitled) {
    return <MapProGate />;
  }

  if (items === undefined) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }

  if (located.length === 0) {
    return (
      <View style={styles.container}>
        <EmptyState
          title="Nothing on the map yet"
          message={
            'Photos you save keep the place they were taken.\nNew saves with location data will show up here.'
          }
        />
      </View>
    );
  }

  const openItem = (id: string | undefined) => {
    if (!id) return;
    router.push({ pathname: '/item/[id]', params: { id } });
  };

  if (process.env.EXPO_OS === 'ios') {
    return (
      <AppleMaps.View
        style={styles.container}
        cameraPosition={cameraPosition}
        markers={located.map((item) => ({
          id: item.id,
          coordinates: { latitude: item.latitude, longitude: item.longitude },
          title: item.title,
          systemImage: 'photo.fill',
          tintColor: ACCENT,
        }))}
        onMarkerClick={(marker) => openItem(marker.id)}
      />
    );
  }

  return (
    <GoogleMaps.View
      style={styles.container}
      cameraPosition={cameraPosition}
      markers={located.map((item) => ({
        id: item.id,
        coordinates: { latitude: item.latitude, longitude: item.longitude },
        title: item.title,
      }))}
      onMarkerClick={(marker) => openItem(marker.id)}
    />
  );
}

function MapProGate() {
  const guard = usePaywallGuard();
  return (
    <View style={styles.proGate}>
      <Text style={styles.proGateTitle}>Map is a Pro feature</Text>
      <Text style={styles.proGateMessage}>
        See every saved photo by location with a Shelvr Pro subscription.
      </Text>
      <Pressable
        style={({ pressed }) => [
          styles.proGateCta,
          pressed && { opacity: 0.85 },
        ]}
        onPress={() => guard()}
      >
        <Text style={styles.proGateCtaText}>Start 7-day free trial</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
  },
  proGate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.gap(4),
    gap: theme.gap(1.5),
    backgroundColor: theme.colors.background,
  },
  proGateTitle: {
    fontFamily: theme.fonts.bold,
    fontSize: 18,
    color: theme.colors.foreground,
  },
  proGateMessage: {
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.muted,
    textAlign: 'center',
  },
  proGateCta: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    borderCurve: 'continuous',
    paddingVertical: theme.gap(1.75),
    paddingHorizontal: theme.gap(4),
    marginTop: theme.gap(1),
  },
  proGateCtaText: {
    fontFamily: theme.fonts.bold,
    fontSize: 16,
    color: '#fff',
  },
}));
