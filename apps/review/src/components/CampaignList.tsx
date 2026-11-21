"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import Spinner from "./Spinner";

export default function CampaignList() {
  const me = useQuery(api.campaigns.me, {});
  const campaigns = useQuery(api.campaigns.list, {});
  const create = useMutation(api.campaigns.create);
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const id = await create({ name });
      router.push(`/campaigns/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create it");
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
      {campaigns === undefined ? (
        <div className="mt-8">
          <Spinner />
        </div>
      ) : campaigns.length === 0 ? (
        <p className="mt-4 text-zinc-400">
          You&apos;re not in a campaign yet. Ask a Shelvr admin to invite you.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10">
          {campaigns.map((campaign) => (
            <li key={campaign._id}>
              <Link
                href={`/campaigns/${campaign._id}`}
                className="flex items-center justify-between bg-white/[0.02] px-4 py-4 hover:bg-white/[0.05]"
              >
                <span className="font-medium">{campaign.name}</span>
                <span className="text-xs uppercase tracking-wide text-zinc-500">
                  {campaign.role}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {me?.isStaff && (
        <form onSubmit={submit} className="mt-10 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New campaign name"
            className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 outline-none focus:border-orange-400"
          />
          <button
            type="submit"
            disabled={name.trim().length === 0}
            className="rounded-lg bg-white px-4 py-2 font-medium text-black disabled:opacity-40"
          >
            Start campaign
          </button>
        </form>
      )}
      {error && <p className="mt-2 text-sm text-rose-300">{error}</p>}
    </main>
  );
}
