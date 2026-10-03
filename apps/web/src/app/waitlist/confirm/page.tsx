import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { clientIp } from "@/lib/convexForward";
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
  searchParams: Promise<{ token?: string; status?: string }>;
}) {
  const { token, status } = await searchParams;
  async function confirm() {
    "use server";
    const site = convexSiteUrl();
    const secret = process.env.WAITLIST_SHARED_SECRET;
    if (!site || !secret) redirect("/waitlist/confirm?status=unavailable");
    if (!token || !/^[a-f0-9]{64}$/.test(token))
      redirect("/waitlist/confirm?status=expired");
    const ip = clientIp(
      new Request("https://shelvr-web.vercel.app/waitlist/confirm", {
        headers: await headers(),
      }),
    );
    let response: Response;
    try {
      response = await fetch(`${site}/waitlist/confirm`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-waitlist-secret": secret,
          ...(ip ? { "x-shelvr-client-ip": ip } : {}),
        },
        body: JSON.stringify({ token }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      redirect("/waitlist/confirm?status=unavailable");
    }
    if (!response.ok) {
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      redirect(
        response.status === 400 && result.error === "invalid_token"
          ? "/waitlist/confirm?status=expired"
          : "/waitlist/confirm?status=unavailable",
      );
    }
    redirect("/waitlist/confirmed");
  }
  if (
    status === "expired" ||
    status === "unavailable" ||
    !token ||
    !/^[a-f0-9]{64}$/.test(token)
  ) {
    return (
      <main className="container py-16">
        <h1 className="text-3xl">Confirmation unavailable</h1>
        <p className="mt-4">
          {status === "unavailable"
            ? "We couldn’t confirm your request right now. Please try again later."
            : "This link has expired or has already been used. Request a new confirmation if you still want to join."}
        </p>
        <Link
          href="/#android-waitlist-email"
          className="mt-6 inline-block underline"
        >
          Request a new confirmation
        </Link>
      </main>
    );
  }
  return (
    <main className="container py-16">
      <h1>Confirm your Shelvr waitlist request</h1>
      <p>
        Receive one launch notification. No newsletter. Ignore this link if you
        did not request it.
      </p>
      <form action={confirm}>
        <button
          type="submit"
          className="mt-6 min-h-12 rounded-xl bg-ember px-6 font-semibold text-ink"
        >
          Confirm my request
        </button>
      </form>
    </main>
  );
}
