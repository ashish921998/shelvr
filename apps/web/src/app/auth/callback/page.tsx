import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Return to Shelvr",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default function AuthCallbackPage() {
  return (
    <main className="container py-16">
      <h1>Return to Shelvr</h1>
      <p>If the app did not open, return to Shelvr and retry sign-in.</p>
    </main>
  );
}
