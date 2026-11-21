import Link from "next/link";

import Header from "@/components/Header";
import MapCta from "@/components/MapCta";
import FaqList, { SECTION_HEADING } from "@/components/guides/FaqList";
import Footer from "@/components/home/Footer";
import {
  ALTERNATIVES,
  type Alternative,
  alternativePath,
  alternativeStructuredData,
  CHECKED,
  HUB_PATH,
  ROWS,
  SHELVR_CELLS,
} from "@/lib/alternatives";
import { SITE_URL } from "@/lib/siteMetadata";

function PickList({ heading, items }: { heading: string; items: string[] }) {
  return (
    <div className="rounded-2xl bg-paper-deep p-5">
      <h3 className="text-[17px] font-bold">{heading}</h3>
      <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-base leading-normal text-ink-soft">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export default function AlternativePage({ alt }: { alt: Alternative }) {
  const others = ALTERNATIVES.filter((other) => other.slug !== alt.slug);
  return (
    <div className="min-h-screen overflow-x-clip bg-paper">
      <Header />
      <main className="mx-auto max-w-2xl px-5 pt-10 pb-16 sm:pt-14">
        <p className="text-xs font-bold tracking-[0.1em] text-ember-deep uppercase">
          <Link href={HUB_PATH} className="hover:underline">
            Compare apps
          </Link>
        </p>
        <h1 className="mt-3 font-display text-[clamp(38px,8vw,60px)] leading-[1.02] text-balance">
          {alt.heading}
        </h1>
        <p className="mt-4 max-w-[52ch] text-[17px] leading-normal text-pretty text-muted">
          {alt.lede}
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3">
          <MapCta source="alternative" />
          <span className="text-sm text-muted">
            On the App Store, for iPhone.
          </span>
        </div>

        <section className="mt-16">
          <h2 className={SECTION_HEADING}>Side by side</h2>
          <table className="mt-5 w-full table-fixed border-collapse text-left text-[15px] leading-snug">
            <caption className="sr-only">
              Shelvr and {alt.name} compared
            </caption>
            <thead>
              <tr className="border-b border-line">
                <td className="w-[28%] py-3" />
                <th scope="col" className="py-3 pr-3 font-bold">
                  Shelvr
                </th>
                <th scope="col" className="py-3 font-bold">
                  {alt.name}
                </th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.key} className="border-b border-line align-top">
                  <th
                    scope="row"
                    className="py-3 pr-3 text-sm font-bold text-muted"
                  >
                    {row.label}
                  </th>
                  <td className="py-3 pr-3 text-ink-soft">
                    {SHELVR_CELLS[row.key]}
                  </td>
                  <td className="py-3 text-ink-soft">{alt.cells[row.key]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-4 text-sm leading-normal text-pretty text-muted">
            The {alt.name} column comes from{" "}
            {alt.sources.map((source, i) => (
              <span key={source.url}>
                {i > 0 ? " and " : ""}
                <a
                  href={source.url}
                  rel="nofollow noopener noreferrer"
                  target="_blank"
                  className="underline hover:text-ember-deep"
                >
                  {source.label}
                </a>
              </span>
            ))}
            , as of {CHECKED}. Apps change, so check theirs before you choose.
          </p>
        </section>

        <section className="mt-16">
          <h2 className={SECTION_HEADING}>Which one to pick</h2>
          <div className="mt-5 grid gap-4">
            <PickList heading={`Pick ${alt.name} if`} items={alt.pickThem} />
            <PickList heading="Pick Shelvr if" items={alt.pickShelvr} />
          </div>
        </section>

        <FaqList faqs={alt.faqs} />

        <nav aria-label="Other comparisons" className="mt-16">
          <h2 className={SECTION_HEADING}>Other comparisons</h2>
          <ul className="mt-4 flex flex-col">
            {others.map((other) => (
              <li key={other.slug} className="border-b border-line">
                <Link
                  href={alternativePath(other)}
                  className="flex min-h-12 items-center text-[17px] font-bold transition-colors hover:text-ember-deep"
                >
                  Shelvr vs {other.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </main>
      <Footer />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(alternativeStructuredData(alt, SITE_URL)),
        }}
      />
    </div>
  );
}
