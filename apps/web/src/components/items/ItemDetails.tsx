"use client";

import { api } from "@packages/backend/convex/_generated/api";
import type { Id } from "@packages/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function ItemDetails({ itemId }: { itemId: Id<"items"> }) {
  const item = useQuery(api.items.getItem, { itemId });
  const deleteItem = useMutation(api.items.deleteItem);
  const router = useRouter();

  if (item === undefined) {
    return <p className="text-center py-20 text-[#9A7B5C]">Loading…</p>;
  }

  if (item === null) {
    return <p className="text-center py-20 text-[#9A7B5C]">Item not found</p>;
  }

  return (
    <div className="container max-w-3xl py-12 px-4 sm:px-0 space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/app" className="text-[#C47B2C] font-medium">
          ← Back
        </Link>
        <button
          type="button"
          className="text-[#B42318] text-sm"
          onClick={async () => {
            await deleteItem({ itemId });
            router.push("/app");
          }}
        >
          Delete
        </button>
      </div>

      {item.resolvedImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.resolvedImageUrl}
          alt=""
          className="w-full rounded-2xl object-cover max-h-[420px] bg-[#F6EADF]"
        />
      ) : null}

      <div className="flex gap-3 text-xs uppercase tracking-wide">
        <span className="text-[#C47B2C] font-medium">{item.type}</span>
        <span className="text-[#9A7B5C]">{item.status}</span>
      </div>

      <h1 className="text-3xl sm:text-4xl font-semibold text-[#2A2118] tracking-tight">
        {item.title ??
          (item.status === "processing" ? "Processing…" : "Untitled")}
      </h1>

      {item.description ? (
        <p className="text-lg text-[#5C4A38] leading-relaxed">
          {item.description}
        </p>
      ) : null}

      {item.tags && item.tags.length > 0 ? (
        <p className="text-[#A07448]">{item.tags.map((t) => `#${t}`).join("  ")}</p>
      ) : null}

      {item.url ? (
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="text-[#C47B2C] font-medium break-all"
        >
          {item.url}
        </a>
      ) : null}

      {item.note ? (
        <section className="rounded-2xl border border-[#F0DFC8] bg-white p-5">
          <h2 className="font-medium text-[#8A4F12] mb-2">Original note</h2>
          <p className="text-[#2A2118] whitespace-pre-wrap">{item.note}</p>
        </section>
      ) : null}

      {item.extractedText ? (
        <section className="rounded-2xl border border-[#F0DFC8] bg-white p-5">
          <h2 className="font-medium text-[#8A4F12] mb-2">Extracted content</h2>
          <p className="text-[#2A2118] whitespace-pre-wrap leading-relaxed">
            {item.extractedText}
          </p>
        </section>
      ) : null}

      {item.error ? (
        <p className="text-[#B42318] text-sm">Error: {item.error}</p>
      ) : null}
    </div>
  );
}
