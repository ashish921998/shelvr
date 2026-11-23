import Link from "next/link";

const links = [
  { title: "Reel place finder", url: "/reel-place-finder" },
  { title: "Compare apps", url: "/alternatives" },
  { title: "Support", url: "/support" },
  { title: "Terms", url: "/terms" },
  { title: "Privacy", url: "/privacy" },
];

const languages = [
  { title: "Deutsch", url: "/de", lang: "de" },
  { title: "Français", url: "/fr", lang: "fr" },
];

export default function Footer() {
  return (
    <footer className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-center gap-2.5 px-5 pb-8 text-[13px] font-medium text-muted">
      {links.map((link) => (
        <span key={link.url} className="flex items-center gap-2.5">
          <Link
            href={link.url}
            className="inline-flex min-h-11 items-center transition-colors hover:text-ember-deep"
          >
            {link.title}
          </Link>
          <span aria-hidden>•</span>
        </span>
      ))}
      {languages.map((link) => (
        <span key={link.url} className="flex items-center gap-2.5">
          <Link
            href={link.url}
            lang={link.lang}
            hrefLang={link.lang}
            className="inline-flex min-h-11 items-center transition-colors hover:text-ember-deep"
          >
            {link.title}
          </Link>
          <span aria-hidden>•</span>
        </span>
      ))}
      <span>Shelvr ©{new Date().getFullYear()}</span>
    </footer>
  );
}
