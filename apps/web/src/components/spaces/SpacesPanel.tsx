"use client";

import { api } from "@packages/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";

export default function SpacesPanel() {
  const spaces = useQuery(api.spaces.listSpaces);
  const createSpace = useMutation(api.spaces.createSpace);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const onCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await createSpace({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      setName("");
      setDescription("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container pb-16 px-4 sm:px-0">
      <div className="flex items-center justify-between mt-8 mb-8">
        <div>
          <h1 className="text-[#2A2118] text-[28px] sm:text-[40px] font-medium tracking-tight">
            Spaces
          </h1>
          <p className="text-[#7A5C3E] mt-1">
            Themed collections. New spaces pull in matching existing saves.
          </p>
        </div>
        <Link href="/app" className="text-[#C47B2C] font-medium">
          ← Saves
        </Link>
      </div>

      <div className="rounded-2xl border border-[#F0DFC8] bg-white p-5 mb-8 space-y-3 max-w-xl">
        <h2 className="font-medium text-[#8A4F12]">Create a space</h2>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Design inspiration"
          className="w-full rounded-xl border border-[#D0D5DD] px-3.5 py-2.5"
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description"
          className="w-full rounded-xl border border-[#D0D5DD] px-3.5 py-2.5"
        />
        <button
          type="button"
          onClick={onCreate}
          disabled={saving}
          className="button text-white px-6 py-2.5 rounded-xl disabled:opacity-60"
        >
          {saving ? "Creating…" : "Create space"}
        </button>
      </div>

      {spaces === undefined ? (
        <p className="text-[#9A7B5C]">Loading…</p>
      ) : spaces.length === 0 ? (
        <p className="text-[#9A7B5C]">No spaces yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {spaces.map((space) => (
            <Link
              key={space._id}
              href={`/app/spaces/${space._id}`}
              className="rounded-2xl border border-[#F0DFC8] bg-white p-5 hover:border-[#C47B2C] transition-colors"
            >
              <div className="flex gap-3 items-start">
                <div
                  className="w-2 h-12 rounded-full"
                  style={{ backgroundColor: space.color ?? "#C47B2C" }}
                />
                <div>
                  <h3 className="text-lg font-medium text-[#2A2118]">
                    {space.name}
                  </h3>
                  {space.description ? (
                    <p className="text-sm text-[#5C4A38] mt-1 line-clamp-2">
                      {space.description}
                    </p>
                  ) : null}
                  <p className="text-xs text-[#A07448] mt-2">
                    {space.itemCount}{" "}
                    {space.itemCount === 1 ? "item" : "items"}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
