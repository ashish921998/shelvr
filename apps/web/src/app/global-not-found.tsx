import NotFound, { metadata as notFoundMetadata } from "@/app/(en)/not-found";
import SiteDocument from "@/app/site-document";
import { SITE_METADATA } from "@/lib/siteMetadata";

export const metadata = { ...SITE_METADATA, ...notFoundMetadata };

export default function GlobalNotFound() {
  return (
    <SiteDocument lang="en">
      <NotFound />
    </SiteDocument>
  );
}
