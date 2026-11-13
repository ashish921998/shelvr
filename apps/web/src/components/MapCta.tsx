"use client";

import { useAppStoreLink } from "@/lib/appStoreLink";

const BIG =
  "min-h-14 rounded-xl px-7 text-[17px] bg-ink text-paper shadow-[0_12px_28px_rgba(43,36,24,0.2)] hover:-translate-y-0.5 hover:bg-ember-deep focus-visible:outline-ember-deep";

const LOOKS = {
  header:
    "h-11 gap-1.5 rounded-full px-4 text-sm bg-ink text-paper hover:bg-ember-deep focus-visible:outline-ember-deep",
  hero: BIG,
  footer: BIG,
  place_tool:
    "min-h-12 rounded-xl px-6 text-base bg-ember text-ink hover:-translate-y-0.5 hover:bg-ember-soft focus-visible:outline-white",
};

const APPLE_LOGO = (
  <svg
    aria-hidden="true"
    viewBox="0 0 814 1000"
    fill="currentColor"
    className="block h-4 w-[13px] flex-none"
  >
    <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z" />
  </svg>
);

export default function MapCta({ source }: { source: keyof typeof LOOKS }) {
  const { href, onClick } = useAppStoreLink(source);
  const label =
    source === "place_tool" ? "Save these to Shelvr" : "Map my saves";
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      aria-label={`${label}, on the App Store`}
      className={`inline-flex shrink-0 items-center justify-center font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 ${LOOKS[source]}`}
    >
      {source === "header" ? APPLE_LOGO : null}
      <span>{label}</span>
    </a>
  );
}
