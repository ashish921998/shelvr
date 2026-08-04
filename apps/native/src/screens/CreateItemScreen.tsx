import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { RFValue } from "react-native-responsive-fontsize";
import { api } from "@packages/backend/convex/_generated/api";
import { useConvexAuth, useMutation } from "convex/react";
import { useRouter } from "expo-router";

const AMBER = "#E4572E";
const AMBER_DARK = "#2A241F";
const CREAM = "#F7F1E8";

type ItemType = "link" | "note";

export default function CreateItemScreen() {
  const router = useRouter();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const createItem = useMutation(api.items.createItem);

  const [type, setType] = useState<ItemType>("link");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const onSave = async () => {
    if (isLoading) {
      Alert.alert("Please wait", "Still connecting to the backend.");
      return;
    }
    if (!isAuthenticated) {
      Alert.alert("Not signed in", "Sign in and try again.");
      return;
    }

    if (type === "link" && !url.trim()) {
      Alert.alert("URL required", "Paste a link to save.");
      return;
    }
    if (type === "note" && !note.trim()) {
      Alert.alert("Note required", "Write something to save.");
      return;
    }

    setSaving(true);
    try {
      await createItem(
        type === "link"
          ? { type: "link", url: url.trim() }
          : { type: "note", note: note.trim() },
      );
      router.replace("/");
    } catch (error) {
      Alert.alert("Failed to save", String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <Text style={styles.brand}>Shelvr</Text>
      </View>

      <View style={styles.topRow}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Save something</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.typeRow}>
          {(["link", "note"] as const).map((value) => (
            <TouchableOpacity
              key={value}
              style={[
                styles.typeChip,
                type === value && styles.typeChipActive,
              ]}
              onPress={() => setType(value)}
            >
              <Text
                style={[
                  styles.typeChipText,
                  type === value && styles.typeChipTextActive,
                ]}
              >
                {value === "link" ? "Link" : "Note"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {type === "link" ? (
          <>
            <Text style={styles.label}>URL</Text>
            <TextInput
              value={url}
              onChangeText={setUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="https://…"
              placeholderTextColor="#B08A68"
              style={styles.input}
            />
            <Text style={styles.help}>
              Shelvr will fetch the page, extract the article, and classify it
              into spaces.
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.label}>Note</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              multiline
              placeholder="Capture a thought, quote, or reminder…"
              placeholderTextColor="#B08A68"
              style={[styles.input, styles.textarea]}
              textAlignVertical="top"
            />
            <Text style={styles.help}>
              AI will title, describe, tag, and file this into matching spaces.
            </Text>
          </>
        )}

        <TouchableOpacity
          style={[styles.saveButton, saving && { opacity: 0.6 }]}
          onPress={onSave}
          disabled={saving}
        >
          <Text style={styles.saveButtonText}>
            {saving ? "Saving…" : "Save"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
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
  content: {
    padding: 16,
    gap: 10,
  },
  typeRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  typeChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#F3E3D0",
  },
  typeChipActive: {
    backgroundColor: AMBER,
  },
  typeChipText: {
    color: AMBER_DARK,
    fontFamily: "MMedium",
    fontSize: RFValue(13),
    textTransform: "capitalize",
  },
  typeChipTextActive: {
    color: "#fff",
  },
  label: {
    fontFamily: "MMedium",
    color: AMBER_DARK,
    fontSize: RFValue(13),
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#E2C9A8",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "MRegular",
    fontSize: RFValue(14),
    color: "#2A2118",
    backgroundColor: "#fff",
  },
  textarea: {
    minHeight: 180,
  },
  help: {
    fontFamily: "MRegular",
    fontSize: RFValue(12),
    color: "#9A7B5C",
    lineHeight: RFValue(17),
  },
  saveButton: {
    marginTop: 18,
    backgroundColor: AMBER,
    borderRadius: 12,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonText: {
    color: "#fff",
    fontFamily: "MMedium",
    fontSize: RFValue(15),
  },
});
