import React from "react";
import { StyleSheet, View, Text, TouchableOpacity, Image } from "react-native";
import { useSSO } from "@clerk/clerk-expo";
import { RFValue } from "react-native-responsive-fontsize";
import { AntDesign } from "@expo/vector-icons";
import { useRouter } from "expo-router";

type OAuthStrategy = "oauth_google" | "oauth_apple";

const AMBER = "#C47B2C";
const CREAM = "#FFF8F0";

const LoginScreen = () => {
  const router = useRouter();
  const { startSSOFlow } = useSSO();

  const onPress = async ({ strategy }: { strategy: OAuthStrategy }) => {
    try {
      const { createdSessionId, setActive } = await startSSOFlow({ strategy });
      if (!createdSessionId || !setActive) return;

      await setActive({ session: createdSessionId });
      router.replace("/");
    } catch (err) {
      const message = String(err);
      if (message.includes("already signed in")) {
        return;
      }

      console.error("OAuth error", err);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.logoMark}>
          <Text style={styles.logoLetter}>A</Text>
        </View>
        <Text style={styles.title}>Welcome to Amber</Text>
        <Text style={styles.subtitle}>
          Save links, images, and notes. Amber classifies them into spaces for
          later.
        </Text>
        <TouchableOpacity
          style={styles.buttonGoogle}
          onPress={() => {
            onPress({ strategy: "oauth_google" });
          }}
        >
          <Image
            style={styles.googleIcon}
            source={require("../assets/icons/google.png")}
          />
          <Text style={{ ...styles.buttonText, color: "#344054" }}>
            Continue with Google
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.buttonApple}
          onPress={() => {
            onPress({ strategy: "oauth_apple" });
          }}
        >
          <AntDesign name="apple" size={24} color="black" />
          <Text
            style={{ ...styles.buttonText, color: "#344054", marginLeft: 12 }}
          >
            Continue with Apple
          </Text>
        </TouchableOpacity>

        <View style={styles.signupContainer}>
          <Text style={{ fontFamily: "Regular", color: "#5C4A38" }}>
            Don’t have an account?{" "}
          </Text>
          <Text style={{ fontFamily: "Regular", color: "#5C4A38" }}>
            Sign up above.
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CREAM,
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: "#fff",
    padding: 20,
    alignItems: "center",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#F0DFC8",
  },
  logoMark: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: AMBER,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  logoLetter: {
    color: "#fff",
    fontSize: RFValue(28),
    fontFamily: "SemiBold",
  },
  title: {
    marginTop: 28,
    fontSize: RFValue(21),
    fontFamily: "SemiBold",
    color: "#2A2118",
  },
  subtitle: {
    marginTop: 8,
    fontSize: RFValue(14),
    color: "#5C4A38",
    fontFamily: "Regular",
    marginBottom: 28,
    textAlign: "center",
    lineHeight: RFValue(20),
  },
  buttonText: {
    textAlign: "center",
    color: "#FFF",
    fontFamily: "SemiBold",
    fontSize: RFValue(14),
  },
  buttonGoogle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D0D5DD",
    width: "100%",
    marginBottom: 12,
    height: 44,
  },
  buttonApple: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFF",
    padding: 15,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D0D5DD",
    width: "100%",
    marginBottom: 24,
  },
  signupContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
  },
  googleIcon: {
    width: 24,
    height: 24,
    marginRight: 12,
  },
});

export default LoginScreen;
