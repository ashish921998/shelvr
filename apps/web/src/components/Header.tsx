"use client";

import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
} from "@headlessui/react";
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import Logo from "./common/Logo";

const navigation = [
  { name: "How it works", href: "#how" },
  { name: "Spaces", href: "#spaces" },
  { name: "Search", href: "#search" },
];

export default function Header() {
  return (
    <Disclosure
      as="nav"
      className="sticky top-0 z-50 border-b border-line bg-paper/90 backdrop-blur-xl"
    >
      {({ open }) => (
        <>
          <div className="container flex h-16 items-center justify-between gap-4">
            <Logo />

            <ul className="hidden items-center gap-8 md:flex">
              {navigation.map((item) => (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className="text-sm font-medium text-muted transition-colors hover:text-ink"
                  >
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>

            <div className="hidden shrink-0 items-center sm:flex">
              <Link
                href="#get-app"
                className="inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-xl bg-ember px-5 text-sm font-semibold text-ink shadow-[0_10px_24px_rgba(154,100,22,0.18)] transition hover:-translate-y-0.5"
              >
                Join the waitlist
                <span aria-hidden>→</span>
              </Link>
            </div>

            <div className="md:hidden">
              <DisclosureButton className="inline-flex items-center justify-center rounded-lg p-2 text-ink">
                <span className="sr-only">Open main menu</span>
                {open ? (
                  <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                ) : (
                  <Bars3Icon className="h-6 w-6" aria-hidden="true" />
                )}
              </DisclosureButton>
            </div>
          </div>

          <DisclosurePanel className="border-t border-line bg-cream md:hidden">
            <div className="container flex flex-col gap-1 py-4">
              {navigation.map((item) => (
                <DisclosureButton
                  key={item.name}
                  as={Link}
                  href={item.href}
                  className="rounded-lg px-2 py-2.5 text-base font-medium text-ink hover:bg-paper-deep"
                >
                  {item.name}
                </DisclosureButton>
              ))}
              <Link
                href="#get-app"
                className="mt-2 rounded-xl bg-ember px-4 py-3 text-center text-sm font-semibold text-ink"
              >
                Join the waitlist
              </Link>
            </div>
          </DisclosurePanel>
        </>
      )}
    </Disclosure>
  );
}
