import type { Metadata } from "next";

import Logo from "@/components/common/Logo";
import Footer from "@/components/home/Footer";
import SavedPostsViewer from "@/components/tools/SavedPostsViewer";

const PATH = "/instagram-saved-posts-viewer";
const TITLE = "Instagram Saved Posts Viewer & CSV Export | Shelvr";
const DESCRIPTION =
  "See every Instagram post you’ve saved in one searchable list, by account and date, and export it to CSV. No login, and your file never leaves your device.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PATH },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: PATH,
    siteName: "Shelvr",
    type: "website",
  },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

const STEPS = [
  "In Instagram, open your profile, tap the menu (☰) and go to Accounts Center.",
  "Tap “Your information and permissions”, then “Export your information” (some accounts call it “Download your information”).",
  "Create an export to your device. Under “Customize information”, untick everything except “Saved”.",
  "Set the date range to “All time” and the format to JSON, then start the export.",
  "Instagram emails you when the file is ready. Download the .zip and open it here.",
];

const FAQS = [
  {
    q: "Can I see all my saved posts on Instagram at once?",
    a: "Inside Instagram you can only scroll your Saved tab, newest first, with no search and no dates. Your data download has the full list. This page turns it into one list you can search by account, with the date you saved each post.",
  },
  {
    q: "Is it safe? Do you see my file?",
    a: "The file is read by your browser on your own device. It is never uploaded, so we can’t see it. You don’t need to log in or give anyone your Instagram password.",
  },
  {
    q: "How do I export Instagram saved posts to Excel or Google Sheets?",
    a: "Open your download here, then tap “Download as spreadsheet (CSV)”. Excel, Numbers and Google Sheets all open it, with the account, type, date saved, collection and link for every post.",
  },
  {
    q: "Does it show my saved collections?",
    a: "Yes. If your download includes saved_collections.json (it does when you export the whole Saved category), each post shows the collections it is in, and you can filter by collection.",
  },
  {
    q: "Why don’t I see account names or dates?",
    a: "The HTML version of the download leaves them out of the parts this page can read. Request the export again with the format set to JSON.",
  },
  {
    q: "Does it work on iPhone and Android?",
    a: "Yes. Download the .zip from Instagram’s email, then choose it from Files (iPhone) or Downloads (Android) on this page. No app needed.",
  },
];

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      name: "Instagram Saved Posts Viewer",
      url: `https://shelvr-web.vercel.app${PATH}`,
      applicationCategory: "UtilitiesApplication",
      operatingSystem: "Any",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      description: DESCRIPTION,
      publisher: { "@type": "Organization", name: "Shelvr" },
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQS.map((faq) => ({
        "@type": "Question",
        name: faq.q,
        acceptedAnswer: { "@type": "Answer", text: faq.a },
      })),
    },
  ],
};

export default function InstagramSavedPostsViewerPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-paper">
      <header className="mx-auto max-w-2xl px-5 pt-5">
        <Logo />
      </header>
      <main className="mx-auto max-w-2xl px-5 pt-10 pb-16 sm:pt-14">
        <p className="text-xs font-bold tracking-[0.1em] text-ember-deep uppercase">
          Free tool · No login
        </p>
        <h1 className="mt-3 font-display text-[clamp(38px,8vw,60px)] leading-[1.02] text-balance">
          See all your Instagram saved posts in one list
        </h1>
        <p className="mt-4 max-w-[52ch] text-[17px] leading-normal text-pretty text-muted">
          Open the data download Instagram gives you and get every post you’ve
          ever saved, with who posted it, when you saved it and which collection
          it’s in. Search it, then export it to a spreadsheet.
        </p>

        <SavedPostsViewer />

        <section className="mt-16">
          <h2 className="font-display text-[32px] leading-tight sm:text-[40px]">
            How to get your saved posts file
          </h2>
          <ol className="mt-5 flex flex-col gap-4">
            {STEPS.map((step, i) => (
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
          <p className="mt-4 text-sm text-muted">
            Instagram renames these menus from time to time. If a step looks
            different, search Accounts Center for “export”.
          </p>
        </section>

        <section className="mt-16">
          <h2 className="font-display text-[32px] leading-tight sm:text-[40px]">
            Questions
          </h2>
          <div className="mt-4 border-t border-line">
            {FAQS.map((faq) => (
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
      </main>
      <Footer />
      <script
        type="application/ld+json"
        // Static content defined above; no user input reaches it.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
    </div>
  );
}
