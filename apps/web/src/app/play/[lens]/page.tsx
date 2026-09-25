import type { Metadata } from "next";
import { notFound } from "next/navigation";

import LensPage from "@/components/play/LensPage";
import { isLens, LENS_SLUGS, LENSES } from "@/lib/reveal/lenses";

type PageProps = { params: Promise<{ lens: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return LENS_SLUGS.map((lens) => ({ lens }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { lens } = await params;
  if (!isLens(lens)) return {};
  const { name, hook, blurb } = LENSES[lens];
  return {
    title: `${name} — Shelvr`,
    description: blurb,
    alternates: { canonical: `/play/${lens}` },
    openGraph: {
      title: hook,
      description: blurb,
      url: `/play/${lens}`,
      siteName: "Shelvr",
      type: "website",
    },
    twitter: { card: "summary", title: hook, description: blurb },
  };
}

export default async function PlayLensPage({ params }: PageProps) {
  const { lens } = await params;
  if (!isLens(lens)) notFound();
  return <LensPage lens={lens} />;
}
