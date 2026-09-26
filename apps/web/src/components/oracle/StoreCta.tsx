"use client";

import { useAppStoreLink } from "@/lib/appStoreLink";

export default function StoreCta({
  headline = "Shelvr already sorted these. Keep them.",
}: {
  headline?: string;
}) {
  const { href, onClick } = useAppStoreLink("oracle");
  return (
    <div className="mt-8 rounded-3xl bg-ink px-6 py-7 text-center text-white sm:px-8">
      <p className="display text-2xl sm:text-3xl">{headline}</p>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClick}
        className="mt-5 inline-flex min-h-12 items-center justify-center rounded-xl bg-ember px-6 text-base font-bold text-ink transition hover:-translate-y-0.5 hover:bg-ember-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        Get Shelvr on the App Store
      </a>
    </div>
  );
}
