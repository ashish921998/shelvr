export const isDevDeployment = () =>
  process.env.CONVEX_SITE_URL?.replace(/\/+$/, "") ===
  "https://amicable-antelope-639.convex.site";
