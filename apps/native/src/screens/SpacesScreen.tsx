import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { AntDesign } from "@expo/vector-icons";
import { RFValue } from "react-native-responsive-fontsize";
import { api } from "@packages/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { type Href, useRouter } from "expo-router";

const AMBER = "#C47B2C";
const AMBER_DARK = "#8A4F12";
const CREAM = "#FFF8F0";

export default function SpacesScreen() {
  const router = useRouter();
  const spaces = useQuery(api.spaces.listSpaces);
  const createSpace = useMutation(api.spaces.createSpace);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const onCreate = async () => {
    if (!name.trim()) {
      Alert.alert("Name required", "Give your space a name.");
      return;
    }
    setSaving(true);
    try {
      const spaceId = await createSpace({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      setName("");
      setDescription("");
      router.push(`/spaces/${spaceId}` as Href);
    } catch (error) {
      Alert.alert("Could not create space", String(error));
    } finally {
      setSaving(false);
    }
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
        <Text style={styles.title}>Spaces</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.createCard}>
        <Text style={styles.createLabel}>New space</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Design inspiration"
          placeholderTextColor="#B08A68"
          style={styles.input}
        />
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Optional description"
          placeholderTextColor="#B08A68"
          style={styles.input}
        />
        <TouchableOpacity
          style={[styles.createButton, saving && { opacity: 0.6 }]}
          onPress={onCreate}
          disabled={saving}
        >
          <AntDesign name="plus" size={16} color="#fff" />
          <Text style={styles.createButtonText}>
            {saving ? "Creating…" : "Create space"}
          </Text>
        </TouchableOpacity>
        <Text style={styles.hint}>
          Creating a space retroactively pulls in matching saves.
        </Text>
      </View>

      {spaces === undefined ? (
        <ActivityIndicator style={{ marginTop: 30 }} color={AMBER} />
      ) : (
        <FlatList
          data={spaces}
          keyExtractor={(item) => item._id}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          ListEmptyComponent={
            <Text style={styles.empty}>No spaces yet. Create one above.</Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.spaceCard}
              onPress={() => router.push(`/spaces/${item._id}` as Href)}
            >
              <View
                style={[
                  styles.swatch,
                  { backgroundColor: item.color ?? AMBER },
                ]}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.spaceName}>{item.name}</Text>
                {item.description ? (
                  <Text style={styles.spaceDescription} numberOfLines={2}>
                    {item.description}
                  </Text>
                ) : null}
                <Text style={styles.spaceCount}>
                  {item.itemCount} {item.itemCount === 1 ? "item" : "items"}
                </Text>
              </View>
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
    fontSize: RFValue(17),
    fontFamily: "MMedium",
    color: AMBER_DARK,
  },
  createCard: {
    margin: 16,
    padding: 16,
    borderRadius: 16,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#F0DFC8",
    gap: 10,
  },
  createLabel: {
    fontFamily: "MMedium",
    color: AMBER_DARK,
    fontSize: RFValue(14),
  },
  input: {
    borderWidth: 1,
    borderColor: "#E2C9A8",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: "MRegular",
    fontSize: RFValue(13),
    color: "#2A2118",
    backgroundColor: "#FFFCF8",
  },
  createButton: {
    marginTop: 4,
    backgroundColor: AMBER,
    borderRadius: 10,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  createButtonText: {
    color: "#fff",
    fontFamily: "MMedium",
    fontSize: RFValue(13),
  },
  hint: {
    fontFamily: "MRegular",
    fontSize: RFValue(11),
    color: "#9A7B5C",
  },
  empty: {
    textAlign: "center",
    color: "#9A7B5C",
    fontFamily: "MLight",
    marginTop: 20,
  },
  spaceCard: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#F0DFC8",
    alignItems: "center",
  },
  swatch: {
    width: 14,
    height: 48,
    borderRadius: 8,
  },
  spaceName: {
    fontFamily: "MMedium",
    fontSize: RFValue(15),
    color: "#2A2118",
  },
  spaceDescription: {
    fontFamily: "MRegular",
    fontSize: RFValue(12),
    color: "#5C4A38",
    marginTop: 2,
  },
  spaceCount: {
    fontFamily: "MRegular",
    fontSize: RFValue(11),
    color: "#A07448",
    marginTop: 4,
  },
});
