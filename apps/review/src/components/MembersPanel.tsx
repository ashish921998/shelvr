"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

type Role = "admin" | "creator";

type Props = {
  campaign: {
    _id: Id<"campaigns">;
    brief: string | null;
    role: Role;
    members: {
      _id: Id<"members">;
      name: string;
      email: string | null;
      role: Role;
      isYou: boolean;
    }[];
    invites: { _id: Id<"invites">; email: string; role: Role }[];
  };
};

export default function MembersPanel({ campaign }: Props) {
  const isAdmin = campaign.role === "admin";
  const invite = useMutation(api.campaigns.invite);
  const revoke = useMutation(api.campaigns.revokeInvite);
  const remove = useMutation(api.campaigns.removeMember);
  const updateBrief = useMutation(api.campaigns.updateBrief);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("creator");
  const [message, setMessage] = useState<string | null>(null);
  const [brief, setBrief] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      const result = await invite({ campaignId: campaign._id, email, role });
      setMessage(
        result === "added" ? `Added ${email}` : `Invite sent to ${email}`,
      );
      setEmail("");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Couldn't invite");
    }
  }

  return (
    <aside className="space-y-6 text-sm">
      <div className="rounded-xl border border-white/10 p-4">
        <h2 className="mb-2 font-medium">Brief</h2>
        {brief !== null ? (
          <div className="space-y-2">
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={6}
              className="w-full rounded-lg border border-white/10 bg-black/40 p-2 outline-none focus:border-orange-400"
            />
            <button
              type="button"
              onClick={async () => {
                await updateBrief({ campaignId: campaign._id, brief });
                setBrief(null);
              }}
              className="rounded-md bg-white px-3 py-1 font-medium text-black"
            >
              Save
            </button>
          </div>
        ) : (
          <>
            <p className="whitespace-pre-wrap text-zinc-400">
              {campaign.brief ?? "No brief yet."}
            </p>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setBrief(campaign.brief ?? "")}
                className="mt-2 text-zinc-500 hover:text-zinc-200"
              >
                Edit
              </button>
            )}
          </>
        )}
      </div>
      <div className="rounded-xl border border-white/10 p-4">
        <h2 className="mb-3 font-medium">People · {campaign.members.length}</h2>
        <ul className="space-y-2">
          {campaign.members.map((member) => (
            <li
              key={member._id}
              className="flex items-center justify-between gap-2"
            >
              <span className="min-w-0">
                <span className="block truncate">
                  {member.name}
                  {member.isYou && (
                    <span className="text-zinc-500"> (you)</span>
                  )}
                </span>
                {member.email && (
                  <span className="block truncate text-xs text-zinc-500">
                    {member.email}
                  </span>
                )}
              </span>
              <span className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wide text-zinc-500">
                  {member.role}
                </span>
                {isAdmin && !member.isYou && (
                  <button
                    type="button"
                    onClick={() => void remove({ memberId: member._id })}
                    className="text-zinc-600 hover:text-rose-300"
                    aria-label={`Remove ${member.name}`}
                  >
                    ×
                  </button>
                )}
              </span>
            </li>
          ))}
          {campaign.invites.map((pending) => (
            <li
              key={pending._id}
              className="flex items-center justify-between gap-2 text-zinc-500"
            >
              <span className="truncate">{pending.email}</span>
              <span className="flex items-center gap-2">
                <span className="text-xs">invited</span>
                <button
                  type="button"
                  onClick={() => void revoke({ inviteId: pending._id })}
                  className="hover:text-rose-300"
                  aria-label={`Cancel invite for ${pending.email}`}
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ul>
        {isAdmin && (
          <form onSubmit={submit} className="mt-4 space-y-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Invite by email"
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 outline-none focus:border-orange-400"
            />
            <div className="flex gap-2">
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="flex-1 rounded-lg border border-white/10 bg-black/40 px-2 py-2"
              >
                <option value="creator">Creator</option>
                <option value="admin">Admin</option>
              </select>
              <button
                type="submit"
                className="rounded-lg bg-white px-3 py-2 font-medium text-black"
              >
                Invite
              </button>
            </div>
            {message && <p className="text-xs text-zinc-400">{message}</p>}
          </form>
        )}
      </div>
    </aside>
  );
}
