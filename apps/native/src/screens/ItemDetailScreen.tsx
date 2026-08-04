import React from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { RFValue } from "react-native-responsive-fontsize";
import { api } from "@packages/backend/convex/_generated/api";
import type { Id } from "@packages/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";

const AMBER = "#C47B2C";
const AMBER_DARK = "#8A4F12";
const CREAM = "#FFF8F0";

export default function ItemDetailScreen() {
  const router = useRouter();
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const item = useQuery(
    api.items.getItem,
    itemId ? { itemId: itemId as Id<"items"> } : "skip",
  );
  const deleteItem = useMutation(api.items.deleteItem);

  const onDelete = () => {
    if (!itemId) return;
    Alert.alert("Delete this save?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteItem({ itemId: itemId as Id<"items"> });
          router.replace("/");
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.brand}>Amber</Text>
      </View>

      <View style={styles.topRow}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Item</Text>
        <TouchableOpacity onPress={onDelete}>
          <Text style={styles.delete}>Delete</Text>
        </TouchableOpacity>
      </View>

      {item === undefined ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={AMBER} />
      ) : item === null ? (
        <Text style={styles.missing}>Item not found</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {item.resolvedImageUrl ? (
            <Image
              source={{ uri: item.resolvedImageUrl }}
              style={[
                styles.hero,
                { aspectRatio: item.imageAspectRatio ?? 1.5 },
              ]}
            />
          ) : null}

          <View style={styles.metaRow}>
            <Text style={styles.badge}>{item.type}</Text>
            <Text style={styles.badgeMuted}>{item.status}</Text>
          </View>

          <Text style={styles.itemTitle}>
            {item.title ??
              (item.status === "processing" ? "Processing…" : "Untitled")}
          </Text>

          {item.description ? (
            <Text style={styles.description}>{item.description}</Text>
          ) : null}

          {item.tags && item.tags.length > 0 ? (
            <Text style={styles.tags}>
              {item.tags.map((t) => `#${t}`).join("  ")}
            </Text>
          ) : null}

          {item.url ? (
            <TouchableOpacity onPress={() => Linking.openURL(item.url!)}>
              <Text style={styles.link}>{item.url}</Text>
            </TouchableOpacity>
          ) : null}

          {item.note ? (
            <View style={styles.noteBox}>
              <Text style={styles.sectionLabel}>Original note</Text>
              <Text style={styles.noteText}>{item.note}</Text>
            </View>
          ) : null}

          {item.extractedText ? (
            <View style={styles.noteBox}>
              <Text style={styles.sectionLabel}>Extracted content</Text>
              <Text style={styles.noteText}>{item.extractedText}</Text>
            </View>
          ) : null}

          {item.error ? (
            <Text style={styles.error}>Error: {item.error}</Text>
          ) : null}
        </ScrollView>
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
  delete: {
    color: "#B42318",
    fontFamily: "MMedium",
    fontSize: RFValue(13),
  },
  title: {
    fontSize: RFValue(17),
    fontFamily: "MMedium",
    color: AMBER_DARK,
  },
  missing: {
    textAlign: "center",
    marginTop: 40,
    color: "#9A7B5C",
    fontFamily: "MRegular",
  },
  content: {
    padding: 16,
    paddingBottom: 60,
    gap: 10,
  },
  hero: {
    width: "100%",
    borderRadius: 16,
    backgroundColor: "#F6EADF",
  },
  metaRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  badge: {
    textTransform: "uppercase",
    color: AMBER,
    fontFamily: "MMedium",
    fontSize: RFValue(11),
    letterSpacing: 0.5,
  },
  badgeMuted: {
    textTransform: "uppercase",
    color: "#9A7B5C",
    fontFamily: "MRegular",
    fontSize: RFValue(11),
  },
  itemTitle: {
    fontSize: RFValue(22),
    fontFamily: "MSemiBold",
    color: "#2A2118",
    marginTop: 4,
  },
  description: {
    fontSize: RFValue(14),
    fontFamily: "MRegular",
    color: "#5C4A38",
    lineHeight: RFValue(20),
  },
  tags: {
    fontSize: RFValue(12),
    fontFamily: "MRegular",
    color: "#A07448",
  },
  link: {
    fontSize: RFValue(13),
    fontFamily: "MMedium",
    color: AMBER,
  },
  noteBox: {
    marginTop: 8,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#F0DFC8",
    gap: 8,
  },
  sectionLabel: {
    fontFamily: "MMedium",
    color: AMBER_DARK,
    fontSize: RFValue(12),
  },
  noteText: {
    fontFamily: "MRegular",
    color: "#2A2118",
    fontSize: RFValue(13),
    lineHeight: RFValue(19),
  },
  error: {
    color: "#B42318",
    fontFamily: "MRegular",
    fontSize: RFValue(12),
  },
});
