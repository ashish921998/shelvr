import SiteDocument from "@/app/site-document";
import { SITE_METADATA } from "@/lib/siteMetadata";

export const metadata = SITE_METADATA;

export default function FrenchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SiteDocument lang="fr">{children}</SiteDocument>;
}
