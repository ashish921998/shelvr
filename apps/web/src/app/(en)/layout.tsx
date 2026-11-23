import SiteDocument from "@/app/site-document";
import { SITE_METADATA } from "@/lib/siteMetadata";

export const metadata = SITE_METADATA;

export default function EnglishLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SiteDocument lang="en">{children}</SiteDocument>;
}
