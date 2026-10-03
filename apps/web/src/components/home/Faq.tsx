"use client";

import { PlusIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { useState } from "react";

const FAQS = [
  {
    q: "What can I save?",
    a: "Links, photos, screenshots and notes. Share them to Shelvr from any app, or drop them in with the + button.",
  },
  {
    q: "How does it know where things go?",
    a: "Shelvr reads each save (the page, the text in a screenshot, your note) and files it into the Space it fits. You can always move anything to another Space.",
  },
  {
    q: "Do I have to set up folders first?",
    a: "No. Name a Space whenever you like; Shelvr looks back through everything you’ve already saved and fills it.",
  },
  {
    q: "Is my stuff private?",
    a: "Your saves are yours. Shelvr doesn’t sell your data or show ads.",
  },
  {
    q: "What does it cost? Which devices?",
    a: "Shelvr Pro is a monthly or yearly subscription, and the yearly plan starts with a one-week free trial. It’s on iPhone today. Android is in the works; leave your email below and we’ll tell you the day it lands.",
  },
];

export default function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section
      id="faq"
      className="mx-auto grid max-w-[1200px] grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] items-start gap-10 px-5 pt-18 pb-10"
    >
      <div className="flex flex-col gap-3.5">
        <h2 className="font-display text-[clamp(36px,4.4vw,64px)] leading-[.98] text-balance">
          Questions, shelved.
        </h2>
        <p className="max-w-[36ch] text-[17px] leading-normal text-pretty text-muted">
          Anything else?{" "}
          <Link href="/support" className="text-ember-deep underline">
            Ask us on the support page
          </Link>
          .
        </p>
      </div>

      <div className="flex flex-col border-t border-line">
        {FAQS.map((faq, i) => {
          const isOpen = open === i;
          return (
            <div key={faq.q} className="border-b border-line">
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={`faq-${i}`}
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex min-h-14 w-full items-center justify-between gap-4 py-4 text-left text-[17px] font-bold"
              >
                <span>{faq.q}</span>
                <span
                  className={`flex size-7 flex-none items-center justify-center rounded-full bg-paper-deep transition-transform duration-250 ${isOpen ? "rotate-45" : ""}`}
                >
                  <PlusIcon aria-hidden className="size-4" strokeWidth={2} />
                </span>
              </button>
              <div
                id={`faq-${i}`}
                inert={!isOpen}
                className={`grid transition-[grid-template-rows] duration-300 ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
              >
                <div className="overflow-hidden">
                  <p className="max-w-[56ch] pr-11 pb-[18px] text-base leading-[1.55] text-pretty text-muted">
                    {faq.a}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
