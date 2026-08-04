"use client";

import { api } from "@packages/backend/convex/_generated/api";
import type { Id } from "@packages/backend/convex/_generated/dataModel";
import { useMutation, usePaginatedQuery } from "convex/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import CreateItem from "./CreateItem";

export default function ItemsFeed() {
  const [search, setSearch] = useState("");
  const { results, status, loadMore } = usePaginatedQuery(
    api.items.listItems,
    {},
    { initialNumItems: 30 },
  );
  const deleteItem = useMutation(api.items.deleteItem);

  const items = useMemo(() => {
    if (!search.trim()) return results;
    const q = search.toLowerCase();
    return results.filter((item) => {
      const haystack = [
        item.title,
        item.description,
        item.url,
        item.note,
        ...(item.tags ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [results, search]);

  return (
    <div className="container pb-16 px-4 sm:px-0">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mt-8 mb-8">
        <div>
          <h1 className="text-[#2A2118] text-[28px] sm:text-[40px] font-medium tracking-tight">
            Your saves
          </h1>
          <p className="text-[#7A5C3E] mt-1 text-base sm:text-lg">
            Links, images, and notes — classified into spaces.
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/app/spaces"
            className="rounded-xl border border-[#E2C9A8] bg-white px-4 py-2.5 text-[#8A4F12] font-medium"
          >
            Spaces
          </Link>
        </div>
      </div>

      <div className="bg-white flex items-center h-[48px] sm:h-[56px] rounded-xl border border-[#E2C9A8] gap-3 mb-8 px-4 sm:px-5">
        <span className="text-[#B08A68]">⌕</span>
        <input
          type="text"
          placeholder="Search saves"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 text-[#2A2118] text-base sm:text-lg font-light focus:outline-none border-0"
        />
      </div>

      {status === "LoadingFirstPage" ? (
        <p className="text-center text-[#9A7B5C] py-16">Loading…</p>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#E2C9A8] bg-[#FFFCF8] py-16 text-center text-[#9A7B5C]">
          Save a link or note to get started.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
          {items.map((item) => (
            <article
              key={item._id}
              className="rounded-2xl border border-[#F0DFC8] bg-white overflow-hidden shadow-sm flex flex-col"
            >
              {item.resolvedImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.resolvedImageUrl}
                  alt=""
                  className="w-full object-cover max-h-48 bg-[#F6EADF]"
                />
              ) : null}
              <div className="p-4 flex flex-col gap-2 flex-1">
                <div className="flex items-center justify-between gap-2 text-xs uppercase tracking-wide">
                  <span className="text-[#C47B2C] font-medium">{item.type}</span>
                  <span className="text-[#9A7B5C]">{item.status}</span>
                </div>
                <Link href={`/app/items/${item._id}`} className="hover:underline">
                  <h2 className="text-[#2A2118] text-lg font-medium leading-snug">
                    {item.title ??
                      (item.status === "processing" ? "Processing…" : "Untitled")}
                  </h2>
                </Link>
                {item.description ? (
                  <p className="text-[#5C4A38] text-sm line-clamp-3">
                    {item.description}
                  </p>
                ) : null}
                {item.tags && item.tags.length > 0 ? (
                  <p className="text-[#A07448] text-xs">
                    {item.tags.map((t) => `#${t}`).join(" ")}
                  </p>
                ) : null}
                <div className="mt-auto pt-3 flex justify-between items-center">
                  <Link
                    href={`/app/items/${item._id}`}
                    className="text-[#C47B2C] text-sm font-medium"
                  >
                    Open
                  </Link>
                  <button
                    type="button"
                    onClick={() =>
                      deleteItem({ itemId: item._id as Id<"items"> })
                    }
                    className="text-[#B42318] text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {status === "CanLoadMore" ? (
        <div className="flex justify-center mb-10">
          <button
            type="button"
            onClick={() => loadMore(20)}
            className="rounded-xl border border-[#E2C9A8] px-5 py-2 text-[#8A4F12]"
          >
            Load more
          </button>
        </div>
      ) : null}

      <CreateItem />
    </div>
  );
}
