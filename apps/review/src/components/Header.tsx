"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@convex/_generated/api";

export default function Header() {
  const me = useQuery(api.campaigns.me, {});
  const { signOut } = useAuthActions();
  return (
    <header className="sticky top-0 z-20 border-b border-white/5 bg-[#0b0b0d]/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold tracking-tight"
        >
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-orange-400 to-pink-500 text-xs font-bold text-black">
            S
          </span>
          Shelvr Review
        </Link>
        <div className="flex items-center gap-3 text-sm text-zinc-400">
          <span className="hidden sm:inline">{me?.email}</span>
          <button
            type="button"
            onClick={() => void signOut()}
            className="rounded-md px-2 py-1 hover:bg-white/5 hover:text-zinc-100"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
