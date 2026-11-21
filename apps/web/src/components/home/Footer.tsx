import Link from "next/link";

import { GUIDES } from "@/lib/guides";

const guides = [
  { title: "Reel place finder", url: "/reel-place-finder" },
  ...GUIDES.map((guide) => ({ title: guide.linkTitle, url: guide.path })),
];

const links = [
  { title: "Support", url: "/support" },
  { title: "Terms", url: "/terms" },
  { title: "Privacy", url: "/privacy" },
];

function LinkRow({
  items,
  label,
}: {
  items: { title: string; url: string }[];
  label: string;
}) {
  return (
    <ul
      aria-label={label}
      className="flex flex-wrap items-center justify-center gap-x-5"
    >
      {items.map((link) => (
        <li key={link.url}>
          <Link
            href={link.url}
            className="inline-flex min-h-11 items-center transition-colors hover:text-ember-deep"
          >
            {link.title}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function Footer() {
  return (
    <footer className="mx-auto flex max-w-[1200px] flex-col items-center gap-1 px-5 pb-8 text-[13px] font-medium text-muted">
      <LinkRow items={guides} label="Guides" />
      <div className="flex flex-wrap items-center justify-center gap-x-5">
        <LinkRow items={links} label="About" />
        <span>Shelvr ©{new Date().getFullYear()}</span>
      </div>
    </footer>
  );
}
