"use client";

import { Disclosure, DisclosureButton, DisclosurePanel } from "@headlessui/react";
import { ChevronDownIcon } from "@heroicons/react/24/outline";

const faqs = [
  {
    q: "What is Shelvr?",
    a: "Shelvr is a save-for-later app for links, notes, and images. Capture something once, and AI shelves it with a title, tags, and spaces so you can find it later.",
  },
  {
    q: "How does the AI filing work?",
    a: "When you save a link, Shelvr fetches the page, extracts the main content, and proposes a title, description, tags, and matching spaces. Notes and images get the same classification pass.",
  },
  {
    q: "What are spaces?",
    a: "Spaces are themed collections like “Design systems” or “Weekend cooking.” Create one and Shelvr can pull matching items from your existing library automatically.",
  },
  {
    q: "Is there a web app?",
    a: "Shelvr is mobile-first. The product experience lives in the iOS app. This site is the marketing home for the product.",
  },
  {
    q: "When can I download it?",
    a: "The iOS app is coming soon. Join from the Get the app section and we’ll share it as soon as it’s ready.",
  },
];

const FAQ = () => {
  return (
    <section id="faq" className="py-20 sm:py-24 bg-cream border-y border-line">
      <div className="container">
        <div className="mx-auto max-w-2xl text-center mb-12">
          <p className="section-kicker">FAQ</p>
          <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl sm:text-5xl tracking-[-0.03em] text-ink leading-[1.08] font-medium">
            Frequently asked questions
          </h2>
        </div>

        <div className="mx-auto max-w-2xl divide-y divide-line rounded-3xl border border-line bg-white overflow-hidden">
          {faqs.map((item) => (
            <Disclosure key={item.q} as="div">
              {({ open }) => (
                <div className="px-5 sm:px-6">
                  <DisclosureButton className="flex w-full items-center justify-between gap-4 py-5 text-left">
                    <span className="text-base sm:text-lg font-medium text-ink">
                      {item.q}
                    </span>
                    <ChevronDownIcon
                      className={`h-5 w-5 shrink-0 text-muted transition-transform ${
                        open ? "rotate-180" : ""
                      }`}
                    />
                  </DisclosureButton>
                  <DisclosurePanel className="pb-5 text-sm sm:text-base leading-relaxed text-muted">
                    {item.a}
                  </DisclosurePanel>
                </div>
              )}
            </Disclosure>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FAQ;
