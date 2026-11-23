import NotFound, { metadata as notFoundMetadata } from "@/app/(en)/not-found";
import SiteDocument from "@/app/site-document";

export const metadata = notFoundMetadata;

export default function GlobalNotFound() {
  return (
    <SiteDocument lang="en">
      <NotFound />
    </SiteDocument>
  );
}
