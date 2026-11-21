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
    <main className="mx-auto max-w-5xl px-5 py-12">
      <p className="eyebrow">Workspace</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Campaigns</h1>
      {campaigns === undefined ? (
        <div className="mt-10">
          <Spinner />
        </div>
      ) : campaigns.length === 0 ? (
        <div className="panel mt-8 p-10 text-center text-sm text-muted">
          You&apos;re not in a campaign yet. Ask a Shelvr admin to invite you.
        </div>
      ) : (
        <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((campaign) => (
            <li key={campaign._id}>
              <Link
                href={`/campaigns/${campaign._id}`}
                className="panel group flex h-full flex-col justify-between gap-8 p-5 transition hover:-translate-y-0.5 hover:border-line-strong hover:bg-raised"
              >
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-base font-semibold text-accent">
                  {campaign.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="flex items-end justify-between gap-3">
                  <span className="font-medium leading-snug">
                    {campaign.name}
                  </span>
                  <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[11px] text-muted capitalize">
                    {campaign.role}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {me?.isStaff && (
        <form
          onSubmit={submit}
          className="panel mt-10 flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New campaign name"
            className="field flex-1"
          />
          <button
            type="submit"
            disabled={name.trim().length === 0}
            className="btn-primary"
          >
            Start campaign
          </button>
        </form>
      )}
      {error && <p className="mt-2 text-sm text-rose-300">{error}</p>}
    </main>
  );
}
