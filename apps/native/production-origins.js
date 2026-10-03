const productionCloudOrigin = "https://amiable-setter-120.convex.cloud";
const productionSiteOrigin = "https://amiable-setter-120.convex.site";

function isExactOrigin(value, origin) {
  try {
    return new URL(value).href === `${origin}/`;
  } catch {
    return false;
  }
}

module.exports = { productionCloudOrigin, productionSiteOrigin, isExactOrigin };
