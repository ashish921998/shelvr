"use client";

import { api } from "@packages/backend/convex/_generated/api";
import type { Id } from "@packages/backend/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import Link from "next/link";

export default function SpaceDetails({ spaceId }: { spaceId: Id<"spaces"> }) {
  const space = useQuery(api.spaces.getSpace, { spaceId });
  const items = useQuery(api.spaces.listSpaceItems, { spaceId });

  if (space === undefined || items === undefined) {
    return <p className="text-center py-20 text-[#9A7B5C]">Loading…</p>;
  }

  if (space === null) {
    return <p className="text-center py-20 text-[#9A7B5C]">Space not found</p>;
  }

  return (
    <div className="container pb-16 px-4 sm:px-0">
      <div className="mt-8 mb-8">
        <Link href="/app/spaces" className="text-[#C47B2C] font-medium">
          ← Spaces
        </Link>
        <h1 className="text-[#2A2118] text-[28px] sm:text-[40px] font-medium tracking-tight mt-3">
          {space.name}
        </h1>
        {space.description ? (
          <p className="text-[#7A5C3E] mt-2">{space.description}</p>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#E2C9A8] bg-[#FFFCF8] py-16 text-center text-[#9A7B5C]">
          No items yet. Matching saves will appear here.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <Link
              key={item._id}
              href={`/app/items/${item._id}`}
              className="rounded-2xl border border-[#F0DFC8] bg-white p-4 hover:border-[#C47B2C]"
            >
              <p className="text-xs uppercase tracking-wide text-[#C47B2C] font-medium">
                {item.type}
              </p>
              <h2 className="text-lg font-medium text-[#2A2118] mt-1">
                {item.title ?? "Untitled"}
              </h2>
              {item.description ? (
                <p className="text-sm text-[#5C4A38] mt-1 line-clamp-3">
                  {item.description}
                </p>
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
