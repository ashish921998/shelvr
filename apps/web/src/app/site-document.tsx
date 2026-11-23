import PageShell from "@/components/PageShell";
import { CTA_VARIANT_SCRIPT } from "@/lib/ctaVariant";
import "@/app/globals.css";

export default function SiteDocument({
  children,
  lang,
}: {
  children: React.ReactNode;
  lang: "en" | "de" | "fr";
}) {
  return (
    <html lang={lang} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: CTA_VARIANT_SCRIPT }} />
      </head>
      <body>
        <PageShell>{children}</PageShell>
      </body>
    </html>
  );
}
