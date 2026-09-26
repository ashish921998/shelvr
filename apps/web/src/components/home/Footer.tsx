import Link from "next/link";

const links = [
  { title: "Support", url: "/support" },
  { title: "Terms", url: "/terms" },
  { title: "Privacy", url: "/privacy" },
];

export default function Footer() {
  return (
    <footer className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-center gap-2.5 px-5 pt-2 pb-10 text-[13px] font-medium text-muted">
      {links.map((link) => (
        <span key={link.url} className="flex items-center gap-2.5">
          <Link
            href={link.url}
            className="transition-colors hover:text-ember-deep"
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
