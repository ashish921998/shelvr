"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import Avatar from "./Avatar";

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
    <aside className="space-y-4 text-sm lg:sticky lg:top-20 lg:self-start">
      <div className="panel p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="eyebrow">Brief</h2>
          {isAdmin && brief === null && (
            <button
              type="button"
              onClick={() => setBrief(campaign.brief ?? "")}
              className="text-xs text-muted transition hover:text-ink"
            >
              Edit
            </button>
          )}
        </div>
        {brief !== null ? (
          <div className="space-y-2">
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={6}
              className="field resize-none leading-relaxed"
            />
            <button
              type="button"
              onClick={async () => {
                await updateBrief({ campaignId: campaign._id, brief });
                setBrief(null);
              }}
              className="btn-primary px-3 py-1.5"
            >
              Save
            </button>
          </div>
        ) : (
          <p className="leading-relaxed whitespace-pre-wrap text-muted">
            {campaign.brief ?? "No brief yet."}
          </p>
        )}
      </div>
      <div className="panel p-5">
        <h2 className="eyebrow mb-4">
          People <span className="text-muted">{campaign.members.length}</span>
        </h2>
        <ul className="space-y-1">
          {campaign.members.map((member) => (
            <li
              key={member._id}
              className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-1.5 transition hover:bg-white/[0.03]"
            >
              <Avatar name={member.name} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {member.name}
                  {member.isYou && (
                    <span className="font-normal text-faint"> (you)</span>
                  )}
                </span>
                {member.email && (
                  <span className="block truncate text-xs text-faint">
                    {member.email}
                  </span>
                )}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] capitalize ${
                  member.role === "admin"
                    ? "bg-accent-soft text-accent"
                    : "bg-white/5 text-muted"
                }`}
              >
                {member.role}
              </span>
              {isAdmin && !member.isYou && (
                <button
                  type="button"
                  onClick={() => void remove({ memberId: member._id })}
                  className="text-faint opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 hover:text-rose-300"
                  aria-label={`Remove ${member.name}`}
                >
                  ×
                </button>
              )}
            </li>
          ))}
          {campaign.invites.map((pending) => (
            <li
              key={pending._id}
              className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-1.5 text-muted"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-dashed border-line-strong text-xs text-faint">
                @
              </span>
              <span className="min-w-0 flex-1 truncate">{pending.email}</span>
              <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-faint">
                invited
              </span>
              <button
                type="button"
                onClick={() => void revoke({ inviteId: pending._id })}
                className="text-faint transition hover:text-rose-300"
                aria-label={`Cancel invite for ${pending.email}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        {isAdmin && (
          <form
            onSubmit={submit}
            className="mt-4 space-y-2 border-t border-line pt-4"
          >
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Invite by email"
              className="field"
            />
            <div className="flex gap-2">
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="field flex-1"
              >
                <option value="creator">Creator</option>
                <option value="admin">Admin</option>
              </select>
              <button type="submit" className="btn-primary">
                Invite
              </button>
            </div>
            {message && <p className="text-xs text-muted">{message}</p>}
          </form>
        )}
      </div>
    </aside>
  );
}
