import type { Metadata } from "next";
import { notFound } from "next/navigation";

import AlternativePage from "@/components/alternatives/AlternativePage";
import {
  ALTERNATIVES,
  alternativeMetadata,
  findAlternative,
} from "@/lib/alternatives";

type PageProps = { params: Promise<{ app: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return ALTERNATIVES.map((alt) => ({ app: alt.slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const alt = findAlternative((await params).app);
  return alt ? alternativeMetadata(alt) : {};
}

export default async function AlternativeRoute({ params }: PageProps) {
  const alt = findAlternative((await params).app);
  if (!alt) notFound();
  return <AlternativePage alt={alt} />;
}
