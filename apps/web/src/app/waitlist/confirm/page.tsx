import type { Metadata } from "next";
import { convexSiteUrl } from "@/lib/convexSiteUrl";

export const metadata: Metadata = {
  title: "Confirm your waitlist request",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  async function confirm() {
    "use server";
    const site = convexSiteUrl();
    const secret = process.env.WAITLIST_SHARED_SECRET;
    if (!site || !secret || !token || !/^[a-f0-9]{64}$/.test(token))
      throw new Error(
        "Confirmation is unavailable. Please request a new link.",
      );
    const response = await fetch(`${site}/waitlist/confirm`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-waitlist-secret": secret,
      },
      body: JSON.stringify({ token }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok)
      throw new Error(
        "This confirmation link is expired or already used. Please request a new link.",
      );
    const { redirect } = await import("next/navigation");
    redirect("/waitlist/confirmed");
  }
  return (
    <main className="container py-16">
      <h1>Confirm your Shelvr waitlist request</h1>
      <p>
        Receive one launch notification. No newsletter. Ignore this link if you
        did not request it.
      </p>
      <form action={confirm}>
        <button type="submit">Confirm my request</button>
      </form>
    </main>
  );
}
