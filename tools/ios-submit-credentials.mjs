// Query the same assignment used by EAS Submit, requesting metadata only.
export async function verifyIosSubmitCredentials({
  token,
  appId,
  bundleIdentifier,
  appleTeamId,
  fetchImpl = fetch,
}) {
  if (!token)
    throw new Error(
      "EXPO_TOKEN is required to verify iOS submission credentials.",
    );
  const response = await fetchImpl("https://api.expo.dev/graphql", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    signal: AbortSignal.timeout(30000),
    body: JSON.stringify({
      query: `query IosSubmissionKey($appId: String!) {
        app { byId(appId: $appId) {
          iosAppCredentials {
            appleAppIdentifier { bundleIdentifier }
            appleTeam { appleTeamIdentifier }
            appStoreConnectApiKeyForSubmissions { id }
          }
        } }
      }`,
      variables: { appId },
    }),
  });
  if (!response.ok)
    throw new Error("Unable to verify iOS submission credentials with EAS.");
  const result = await response.json();
  if (result.errors?.length)
    throw new Error("EAS rejected the iOS submission credential lookup.");
  const credentials = result.data?.app?.byId?.iosAppCredentials;
  const configured =
    Array.isArray(credentials) &&
    credentials.some(
      (credential) =>
        credential.appleAppIdentifier?.bundleIdentifier === bundleIdentifier &&
        credential.appleTeam?.appleTeamIdentifier === appleTeamId &&
        Boolean(credential.appStoreConnectApiKeyForSubmissions?.id),
    );
  if (!configured) {
    throw new Error(
      "No iOS submission API key is assigned to the production app and Apple team on EAS. Run eas credentials --platform ios, select production, and set up an App Store Connect API key for EAS Submit.",
    );
  }
}
