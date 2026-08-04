import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather, AntDesign } from "@expo/vector-icons";
import { RFValue } from "react-native-responsive-fontsize";
import { useUser } from "@clerk/clerk-expo";
import { api } from "@packages/backend/convex/_generated/api";
import { usePaginatedQuery, useQuery } from "convex/react";
import { type Href, useRouter } from "expo-router";

const AMBER = "#E4572E";
const AMBER_DARK = "#2A241F";
const CREAM = "#F7F1E8";

export default function HomeFeedScreen() {
  const router = useRouter();
  const user = useUser();
  const imageUrl = user?.user?.imageUrl;
  const firstName = user?.user?.firstName;
  const [search, setSearch] = useState("");
  const query = search.trim();
  const isSearching = query.length > 0;

  const { results, status, loadMore } = usePaginatedQuery(
    api.items.listItems,
    isSearching ? "skip" : {},
    { initialNumItems: 30 },
  );
  const searchResults = useQuery(
    api.items.searchItems,
    isSearching ? { query, limit: 50 } : "skip",
  );

  const items = isSearching ? (searchResults ?? []) : results;
  const loading =
    (!isSearching && status === "LoadingFirstPage") ||
    (isSearching && searchResults === undefined);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.brand}>Shelvr</Text>
      </View>

      <View style={styles.topRow}>
        <View style={styles.avatarPlaceholder} />
        <Text style={styles.title}>Your saves</Text>
        {imageUrl ? (
          <Image style={styles.avatar} source={{ uri: imageUrl }} />
        ) : (
          <Text style={styles.avatarInitial}>{firstName?.[0] ?? "?"}</Text>
        )}
      </View>

      <View style={styles.searchContainer}>
        <Feather name="search" size={18} color="#8A6A4A" style={styles.searchIcon} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search saves"
          placeholderTextColor="#B08A68"
          style={styles.searchInput}
        />
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabChip, styles.tabChipActive]}
          onPress={() => router.push("/" as Href)}
        >
          <Text style={styles.tabChipTextActive}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tabChip}
          onPress={() => router.push("/spaces" as Href)}
        >
          <Text style={styles.tabChipText}>Spaces</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={AMBER} />
      ) : items.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>
            {isSearching
              ? `No saves match “${query}”`
              : "Save a link, image, or note\nto get started"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.listContent}
          onEndReached={() => {
            if (!isSearching && status === "CanLoadMore") loadMore(20);
          }}
          renderItem={({ item }) => (
            <TouchableOpacity
              activeOpacity={0.7}
              style={styles.card}
              onPress={() => router.push(`/items/${item._id}` as Href)}
            >
              {item.resolvedImageUrl ? (
                <Image
                  source={{ uri: item.resolvedImageUrl }}
                  style={[
                    styles.cardImage,
                    {
                      aspectRatio: item.imageAspectRatio ?? 1.4,
                    },
                  ]}
                />
              ) : null}
              <View style={styles.cardBody}>
                <View style={styles.metaRow}>
                  <Text style={styles.typeBadge}>{item.type}</Text>
                  <Text style={styles.statusBadge}>{item.status}</Text>
                </View>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {item.title ??
                    (item.status === "processing" ? "Processing…" : "Untitled")}
                </Text>
                {item.description ? (
                  <Text style={styles.cardDescription} numberOfLines={3}>
                    {item.description}
                  </Text>
                ) : null}
                {item.tags && item.tags.length > 0 ? (
                  <Text style={styles.cardTags} numberOfLines={1}>
                    {item.tags.map((t) => `#${t}`).join(" ")}
                  </Text>
                ) : null}
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      <TouchableOpacity
        onPress={() => router.push("/items/new" as Href)}
        style={styles.fab}
      >
        <AntDesign name="plus-circle" size={20} color="#fff" />
        <Text style={styles.fabText}>Save something</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CREAM,
  },
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
    letterSpacing: 0.5,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginTop: 18,
  },
  title: {
    fontSize: RFValue(17),
    fontFamily: "MMedium",
    color: AMBER_DARK,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 10,
  },
  avatarPlaceholder: {
    width: 28,
    height: 28,
  },
  avatarInitial: {
    width: 28,
    height: 28,
    textAlign: "center",
    lineHeight: 28,
    fontFamily: "MMedium",
    color: AMBER_DARK,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2C9A8",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 10,
    marginHorizontal: 16,
    marginTop: 18,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: RFValue(14),
    fontFamily: "MRegular",
    color: "#2D2D2D",
  },
  tabRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    marginTop: 14,
  },
  tabChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#F3E3D0",
  },
  tabChipActive: {
    backgroundColor: AMBER,
  },
  tabChipText: {
    color: AMBER_DARK,
    fontFamily: "MMedium",
    fontSize: RFValue(12),
  },
  tabChipTextActive: {
    color: "#fff",
    fontFamily: "MMedium",
    fontSize: RFValue(12),
  },
  listContent: {
    padding: 16,
    paddingBottom: 120,
    gap: 12,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#F0DFC8",
    marginBottom: 12,
  },
  cardImage: {
    width: "100%",
    backgroundColor: "#F6EADF",
  },
  cardBody: {
    padding: 14,
    gap: 6,
  },
  metaRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 2,
  },
  typeBadge: {
    textTransform: "uppercase",
    fontSize: RFValue(10),
    fontFamily: "MMedium",
    color: AMBER,
    letterSpacing: 0.6,
  },
  statusBadge: {
    textTransform: "uppercase",
    fontSize: RFValue(10),
    fontFamily: "MRegular",
    color: "#9A7B5C",
    letterSpacing: 0.4,
  },
  cardTitle: {
    fontSize: RFValue(15),
    fontFamily: "MMedium",
    color: "#2A2118",
  },
  cardDescription: {
    fontSize: RFValue(13),
    fontFamily: "MRegular",
    color: "#5C4A38",
    lineHeight: RFValue(18),
  },
  cardTags: {
    fontSize: RFValue(11),
    fontFamily: "MRegular",
    color: "#A07448",
    marginTop: 2,
  },
  emptyState: {
    marginTop: 24,
    marginHorizontal: 16,
    minHeight: 180,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E8D2B5",
    backgroundColor: "#FFFCF8",
    justifyContent: "center",
    alignItems: "center",
  },
  emptyStateText: {
    textAlign: "center",
    fontSize: RFValue(14),
    color: "#9A7B5C",
    fontFamily: "MLight",
  },
  fab: {
    flexDirection: "row",
    backgroundColor: AMBER,
    borderRadius: 12,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 22,
    position: "absolute",
    bottom: 32,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 5,
  },
  fabText: {
    color: "#fff",
    fontSize: RFValue(14),
    fontFamily: "MMedium",
    marginLeft: 10,
  },
});
