import React from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { RFValue } from "react-native-responsive-fontsize";
import { api } from "@packages/backend/convex/_generated/api";
import type { Id } from "@packages/backend/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";

const AMBER = "#C47B2C";
const AMBER_DARK = "#8A4F12";
const CREAM = "#FFF8F0";

export default function SpaceDetailScreen() {
  const router = useRouter();
  const { spaceId } = useLocalSearchParams<{ spaceId: string }>();
  const space = useQuery(
    api.spaces.getSpace,
    spaceId ? { spaceId: spaceId as Id<"spaces"> } : "skip",
  );
  const items = useQuery(
    api.spaces.listSpaceItems,
    spaceId ? { spaceId: spaceId as Id<"spaces"> } : "skip",
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.brand}>Amber</Text>
      </View>

      <View style={styles.topRow}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          {space?.name ?? "Space"}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {space?.description ? (
        <Text style={styles.description}>{space.description}</Text>
      ) : null}

      {items === undefined || space === undefined ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={AMBER} />
      ) : items.length === 0 ? (
        <Text style={styles.empty}>
          No items in this space yet. New matching saves will land here.
        </Text>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item._id}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push(`/items/${item._id}` as Href)}
            >
              <Text style={styles.type}>{item.type}</Text>
              <Text style={styles.cardTitle}>
                {item.title ?? "Untitled"}
              </Text>
              {item.description ? (
                <Text style={styles.cardDescription} numberOfLines={2}>
                  {item.description}
                </Text>
              ) : null}
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CREAM },
  header: {
    backgroundColor: AMBER,
    height: 64,
    justifyContent: "center",
    alignItems: "center",
  },
  brand: {
    color: "#fff",
    fontSize: RFValue(18),
    fontFamily: "MSemiBold",
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginTop: 16,
  },
  back: {
    color: AMBER_DARK,
    fontFamily: "MMedium",
    fontSize: RFValue(13),
  },
  title: {
    maxWidth: "60%",
    fontSize: RFValue(17),
    fontFamily: "MMedium",
    color: AMBER_DARK,
  },
  description: {
    marginTop: 10,
    marginHorizontal: 16,
    color: "#5C4A38",
    fontFamily: "MRegular",
    fontSize: RFValue(13),
  },
  empty: {
    marginTop: 40,
    marginHorizontal: 24,
    textAlign: "center",
    color: "#9A7B5C",
    fontFamily: "MLight",
    fontSize: RFValue(13),
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#F0DFC8",
    gap: 4,
  },
  type: {
    textTransform: "uppercase",
    color: AMBER,
    fontFamily: "MMedium",
    fontSize: RFValue(10),
  },
  cardTitle: {
    fontFamily: "MMedium",
    fontSize: RFValue(15),
    color: "#2A2118",
  },
  cardDescription: {
    fontFamily: "MRegular",
    fontSize: RFValue(12),
    color: "#5C4A38",
  },
});
