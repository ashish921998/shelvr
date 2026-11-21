"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import Avatar from "./Avatar";

export default function Header() {
  const me = useQuery(api.campaigns.me, {});
  const { signOut } = useAuthActions();
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-canvas/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between px-5">
        <Link
          href="/"
          className="flex items-center gap-2.5 text-sm font-semibold tracking-tight"
        >
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-orange-400 to-pink-500 text-xs font-bold text-black shadow-[0_6px_20px_-6px_rgb(249_115_22/0.7)]">
            S
          </span>
          Shelvr <span className="font-normal text-muted">Review</span>
        </Link>
        <div className="flex items-center gap-2 text-sm">
          {me?.email && (
            <span className="hidden items-center gap-2 rounded-full border border-line bg-panel py-1 pr-3 pl-1 text-muted sm:flex">
              <Avatar name={me.email} size="sm" />
              {me.email}
            </span>
          )}
          <button
            type="button"
            onClick={() => void signOut()}
            className="btn-ghost px-2.5 py-1.5"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
