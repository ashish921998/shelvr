import type { Metadata } from "next";

import Logo from "@/components/common/Logo";
import OracleApp from "@/components/oracle/OracleApp";

const description =
  "Show me three things you saved and I’ll tell you who you are. A free verdict from Shelvr, no sign-up.";

export const metadata: Metadata = {
  title: "The Shelvr Oracle",
  description,
  alternates: { canonical: "/oracle" },
  openGraph: {
    title: "The Shelvr Oracle",
    description,
    url: "/oracle",
    siteName: "Shelvr",
    type: "website",
  },
  twitter: { card: "summary", title: "The Shelvr Oracle", description },
};

export default function OraclePage() {
  return (
    <main className="min-h-screen bg-paper">
      <div className="container max-w-2xl pt-6">
        <Logo />
      </div>
      <OracleApp />
    </main>
  );
}
