export const SECTION_HEADING =
  "font-display text-[32px] leading-tight sm:text-[40px]";

export default function FaqList({
  faqs,
  heading = "Questions",
}: {
  faqs: { q: string; a: string }[];
  heading?: string;
}) {
  return (
    <section className="mt-16">
      <h2 className={SECTION_HEADING}>{heading}</h2>
      <div className="mt-4 border-t border-line">
        {faqs.map((faq) => (
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
  );
}
