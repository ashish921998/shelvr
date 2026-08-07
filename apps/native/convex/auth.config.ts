// Convex Auth issues its own JWTs (signed with JWT_PRIVATE_KEY / JWKS set on
// the deployment). The provider is this backend itself: the domain is the
// deployment's HTTP Actions URL (CONVEX_SITE_URL) and the application id is the
// fixed "convex" audience the library expects.
export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};
