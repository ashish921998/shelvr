"use client";

import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { useState } from "react";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    return url ? new ConvexReactClient(url) : null;
  });
  if (client === null) {
    return (
      <main className="mx-auto max-w-md p-8 text-sm text-muted">
        Set NEXT_PUBLIC_CONVEX_URL to the review backend&apos;s URL.
      </main>
    );
  }
  return <ConvexAuthProvider client={client}>{children}</ConvexAuthProvider>;
}
