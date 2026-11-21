import Link from "next/link";

import Header from "@/components/Header";
import MapCta from "@/components/MapCta";
import Footer from "@/components/home/Footer";
import { SITE_URL } from "@/lib/siteMetadata";
import { GUIDES, type Guide, guideStructuredData } from "@/lib/guides";

const SECTION_HEADING = "font-display text-[32px] leading-tight sm:text-[40px]";

export default function GuidePage({ page }: { page: Guide }) {
  const related = GUIDES.filter((other) => other.path !== page.path);
  return (
    <div className="min-h-screen overflow-x-clip bg-paper">
      <Header />
      <main className="mx-auto max-w-2xl px-5 pt-10 pb-16 sm:pt-14">
        <p className="text-xs font-bold tracking-[0.1em] text-ember-deep uppercase">
          {page.eyebrow}
        </p>
        <h1 className="mt-3 font-display text-[clamp(38px,8vw,60px)] leading-[1.02] text-balance">
          {page.heading}
        </h1>
        <p className="mt-4 max-w-[52ch] text-[17px] leading-normal text-pretty text-muted">
          {page.lede}
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3">
          <MapCta source="guide" />
          <span className="text-sm text-muted">
            On the App Store, for iPhone.
          </span>
        </div>

        <section className="mt-16">
          <h2 className={SECTION_HEADING}>How it works</h2>
          <ol className="mt-5 flex flex-col gap-4">
            {page.steps.map((step, i) => (
              <li key={step} className="flex gap-4">
                <span
                  aria-hidden
                  className="flex size-8 flex-none items-center justify-center rounded-full bg-ember-soft text-sm font-bold text-ember-deep"
                >
                  {i + 1}
                </span>
                <p className="pt-1 text-base leading-normal text-ink-soft">
                  {step}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {page.sections.map((section) => (
          <section key={section.heading} className="mt-14">
            <h2 className={SECTION_HEADING}>{section.heading}</h2>
            <p className="mt-4 max-w-[56ch] text-[17px] leading-[1.6] text-pretty text-ink-soft">
              {section.body}
            </p>
          </section>
        ))}

        <section className="mt-16">
          <h2 className={SECTION_HEADING}>Questions</h2>
          <div className="mt-4 border-t border-line">
            {page.faqs.map((faq) => (
              <details key={faq.q} className="group border-b border-line">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-[17px] font-bold [&::-webkit-details-marker]:hidden">
                  <h3>{faq.q}</h3>
                  <span
                    aria-hidden
                    className="flex size-7 flex-none items-center justify-center rounded-full bg-paper-deep text-lg leading-none transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="max-w-[56ch] pr-11 pb-[18px] text-base leading-[1.55] text-pretty text-muted">
                  {faq.a}
                </p>
              </details>
            ))}
          </div>
        </section>

        <nav aria-label="More guides" className="mt-16">
          <h2 className={SECTION_HEADING}>More guides</h2>
          <ul className="mt-4 flex flex-col">
            {related.map((other) => (
              <li key={other.path} className="border-b border-line">
                <Link
                  href={other.path}
                  className="flex min-h-12 items-center text-[17px] font-bold transition-colors hover:text-ember-deep"
                >
                  {other.linkTitle}
                </Link>
              </li>
            ))}
            <li className="border-b border-line">
              <Link
                href="/reel-place-finder"
                className="flex min-h-12 items-center text-[17px] font-bold transition-colors hover:text-ember-deep"
              >
                Find the places in a reel, no app needed
              </Link>
            </li>
          </ul>
        </nav>
      </main>
      <Footer />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(guideStructuredData(page, SITE_URL)),
        }}
      />
    </div>
  );
}
