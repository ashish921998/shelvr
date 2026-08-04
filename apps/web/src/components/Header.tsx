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
  { name: "Features", href: "#features" },
  { name: "FAQ", href: "#faq" },
];

export default function Header() {
  return (
    <Disclosure
      as="nav"
      className="sticky top-0 z-50 border-b border-line/80 bg-paper/90 backdrop-blur-xl"
    >
      {({ open }) => (
        <>
          <div className="container flex h-16 items-center justify-between">
            <Logo />

            <ul className="hidden md:flex items-center gap-8">
              {navigation.map((item) => (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className="text-sm font-medium text-muted hover:text-ink transition-colors"
                  >
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>

            <div className="hidden sm:flex items-center">
              <Link
                href="#get-app"
                className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-ink-soft transition-colors"
              >
                Get the app
              </Link>
            </div>

            <div className="sm:hidden">
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

          <DisclosurePanel className="sm:hidden border-t border-line bg-cream">
            <div className="container py-4 flex flex-col gap-2">
              {navigation.map((item) => (
                <DisclosureButton
                  key={item.name}
                  as={Link}
                  href={item.href}
                  className="py-2 text-base font-medium text-ink"
                >
                  {item.name}
                </DisclosureButton>
              ))}
              <Link
                href="#get-app"
                className="mt-2 rounded-full bg-ink px-4 py-2.5 text-center text-sm font-semibold text-white"
              >
                Get the app
              </Link>
            </div>
          </DisclosurePanel>
        </>
      )}
    </Disclosure>
  );
}
