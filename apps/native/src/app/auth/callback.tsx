import { Redirect } from "expo-router";

// Android delivers the browser callback to the router as well as the pending
// auth session. Keep a real route for it; the session still owns code exchange.
export default function OAuthCallback() {
  return <Redirect href="/(auth)/sign-in" />;
}
