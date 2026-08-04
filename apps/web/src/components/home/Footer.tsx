import Link from "next/link";
import Logo from "../common/Logo";

const links = [
  { title: "How it works", url: "#how" },
  { title: "Features", url: "#features" },
  { title: "Spaces", url: "#spaces" },
  { title: "FAQ", url: "#faq" },
  { title: "Get the app", url: "#get-app" },
];

const Footer = () => {
  return (
    <footer className="border-t border-line bg-paper">
      <div className="container py-10 sm:py-12">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <Logo />
          <nav className="flex flex-wrap gap-x-6 gap-y-2">
            {links.map((item) => (
              <Link
                key={item.title}
                href={item.url}
                className="text-sm font-medium text-muted hover:text-ink transition-colors"
              >
                {item.title}
              </Link>
            ))}
          </nav>
        </div>

        <div className="mt-8 pt-6 border-t border-line flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-sm text-muted max-w-lg">
            Shelvr — capture links, notes, and images. AI shelves them so you
            can find them later.
          </p>
          <p className="text-sm text-muted">
            © {new Date().getFullYear()} Shelvr. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
