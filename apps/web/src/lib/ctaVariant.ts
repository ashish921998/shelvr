const KEY = "shelvr_cta_variant";

export const CTA_VARIANT_SCRIPT = `(function(){try{var k=${JSON.stringify(KEY)},v=localStorage.getItem(k);if(v!=="plain"&&v!=="emoji"){v=Math.random()<0.5?"plain":"emoji";localStorage.setItem(k,v)}document.documentElement.setAttribute("data-cta",v)}catch(e){}})()`;

export function ctaVariant() {
  try {
    const value =
      document.documentElement.getAttribute("data-cta") ??
      window.localStorage.getItem(KEY);
    return value === "plain" || value === "emoji" ? value : undefined;
  } catch {
    return undefined;
  }
}
