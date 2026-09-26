"use client";

import { useEffect } from "react";

import { captureWebException } from "@/lib/analytics";
import { SUPPORT_EMAIL } from "@/lib/support";

// Replaces the root layout when it throws, so this file must render its own
// <html>/<body> and cannot rely on the layout's global styles — inline styles
// only, no Tailwind classes.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureWebException(error, { boundary: "root" });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <main style={{ maxWidth: 480, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 28, marginBottom: 12 }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 24 }}>
            The page hit an unexpected error. You can try again, or email
            {SUPPORT_EMAIL} if it keeps happening.
          </p>
          <button
            onClick={reset}
            style={{
              border: 0,
              borderRadius: 999,
              padding: "12px 24px",
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
