import Link from "next/link";

import Logo from "@/components/common/Logo";
import FaqList, { SECTION_HEADING } from "@/components/guides/FaqList";
import MapCta from "@/components/MapCta";
import {
  type LocalizedLanding,
  landingStructuredData,
} from "@/lib/localizedLanding";
import { SITE_URL } from "@/lib/siteMetadata";

function Cta({ page }: { page: LocalizedLanding }) {
  return (
    <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3">
      <MapCta source="landing" label={page.cta} ariaLabel={page.ctaAria} />
      <span className="text-sm text-muted">{page.ctaNote}</span>
    </div>
  );
}

export default function LocalizedLandingPage({
  page,
}: {
  page: LocalizedLanding;
}) {
  const footerLinks = [
    { title: page.footer.support, url: "/support" },
    { title: page.footer.privacy, url: "/privacy" },
    { title: page.footer.terms, url: "/terms" },
  ];
  return (
    <div lang={page.locale} className="min-h-screen overflow-x-clip bg-paper">
      <header className="mx-auto flex max-w-2xl items-center justify-between px-5 pt-5">
        <Logo />
        <Link
          href="/"
          lang="en"
          hrefLang="en"
          className="inline-flex min-h-11 items-center text-sm font-medium text-muted transition-colors hover:text-ember-deep"
        >
          {page.footer.english}
        </Link>
      </header>
      <main className="mx-auto max-w-2xl px-5 pt-10 pb-16 sm:pt-14">
        <h1 className="font-display text-[clamp(44px,10vw,72px)] leading-[1.02] text-balance">
          {page.heading}
          <br />
          <span className="text-ember-deep">{page.accent}</span>
        </h1>
        <p className="mt-5 max-w-[52ch] text-[17px] leading-normal text-pretty text-muted">
          {page.lede}
        </p>
        <Cta page={page} />

        <section className="mt-16">
          <h2 className={SECTION_HEADING}>{page.stepsHeading}</h2>
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

        <FaqList faqs={page.faqs} heading={page.faqHeading} />
        <Cta page={page} />
      </main>
      <footer className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-center gap-x-5 px-5 pb-8 text-[13px] font-medium text-muted">
        {footerLinks.map((link) => (
          <Link
            key={link.url}
            href={link.url}
            className="inline-flex min-h-11 items-center transition-colors hover:text-ember-deep"
          >
            {link.title}
          </Link>
        ))}
        <span>Shelvr ©{new Date().getFullYear()}</span>
      </footer>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(landingStructuredData(page, SITE_URL)),
        }}
      />
    </div>
  );
}
