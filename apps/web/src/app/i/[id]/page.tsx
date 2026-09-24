import type { Metadata } from "next";

import AppStoreButton from "@/components/AppStoreButton";
import Logo from "@/components/common/Logo";
import { fetchSharePreview } from "@/lib/sharePreview";

type PageProps = { params: Promise<{ id: string }> };

const FALLBACK_TITLE = "Someone saved this with Shelvr";
const FALLBACK_DESCRIPTION =
  "Shelvr captures links, images, and notes, then sorts them into spaces so you can find them later.";

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const preview = await fetchSharePreview(id);

  const title = preview?.title || FALLBACK_TITLE;
  const description =
    preview?.description || preview?.noteText || FALLBACK_DESCRIPTION;

  return {
    title: `${title} — Shelvr`,
    description,
    alternates: { canonical: `/i/${id}` },
    // A share link is for its recipients, not for search results.
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      url: `/i/${id}`,
      siteName: "Shelvr",
      type: "article",
      images: preview?.imageUrl ? [{ url: preview.imageUrl }] : undefined,
    },
    twitter: {
      card: preview?.imageUrl ? "summary_large_image" : "summary",
      title,
      description,
    },
  };
}

export default async function SharedItemPage({ params }: PageProps) {
  const { id } = await params;
  const preview = await fetchSharePreview(id);

  return (
    <main className="min-h-screen bg-paper">
      <div className="container max-w-xl py-10 sm:py-16">
        <Logo />

        <div className="mt-10 overflow-hidden rounded-3xl border border-line bg-card shadow-[0_20px_60px_rgba(43,36,24,0.08)]">
          {preview?.imageUrl && (
            // A remote, per-item image isn't worth configuring next/image's
            // remote patterns for a page whose host varies by save.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview.imageUrl}
              alt=""
              className="h-56 w-full object-cover sm:h-72"
            />
          )}
          <div className="p-6 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-shelf">
              Saved with Shelvr
            </p>
            <h1 className="mt-2 font-display text-2xl text-ink sm:text-3xl">
              {preview?.title || FALLBACK_TITLE}
            </h1>
            {(preview?.description || preview?.noteText) && (
              <p className="mt-3 text-[15px] leading-7 text-ink/90">
                {preview?.description || preview?.noteText}
              </p>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <AppStoreButton source="share" compact />
              {preview?.sourceUrl && (
                <a
                  href={preview.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-muted underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink"
                >
                  View original
                </a>
              )}
            </div>
          </div>
        </div>

        <p className="mt-8 text-sm text-muted">
          Shelvr is a save-it-for-later app for links, images, and notes.
          {!preview && " This save may have moved or is no longer shared."}
        </p>
      </div>
    </main>
  );
}
