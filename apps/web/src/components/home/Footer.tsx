import Link from "next/link";
import { APP_STORE_URL } from "@/lib/app-store";
import Logo from "../common/Logo";
import FooterAppStoreLink from "./FooterAppStoreLink";

const links = [
  { title: "How it works", url: "#how" },
  { title: "Spaces", url: "#spaces" },
  { title: "Search", url: "#search" },
  { title: "Download for iPhone", url: APP_STORE_URL },
  { title: "Support", url: "/support" },
];

const Footer = () => {
  return (
    <footer className="border-t border-line bg-paper-deep/40">
      <div className="container py-12 sm:py-14">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-4 text-sm leading-relaxed text-muted">
              Capture links, notes, and images. AI shelves them so you can find
              them later.
            </p>
          </div>
          <nav className="grid grid-cols-2 gap-x-10 gap-y-3 sm:text-right">
            {links.map((item) => (
              item.url === APP_STORE_URL ? (
                <FooterAppStoreLink key={item.title}>
                  {item.title}
                </FooterAppStoreLink>
              ) : (
                <Link
                  key={item.title}
                  href={item.url}
                  className="text-sm font-medium text-muted transition-colors hover:text-ink"
                >
                  {item.title}
                </Link>
              )
            ))}
          </nav>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted">
            © {new Date().getFullYear()} Shelvr. All rights reserved.
          </p>
          <p className="text-sm text-muted">
            <Link
              href="/terms"
              className="transition-colors hover:text-ink"
            >
              Terms
            </Link>{" "}
            ·{" "}
            <Link
              href="/privacy"
              className="transition-colors hover:text-ink"
            >
              Privacy
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
