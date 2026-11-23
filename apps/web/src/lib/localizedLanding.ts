import type { Metadata } from "next";

import { pageMetadata, SITE_ORIGIN } from "@/lib/siteMetadata";

type LandingLocale = "de" | "fr";

export type LocalizedLanding = {
  locale: LandingLocale;
  path: string;
  ogLocale: string;
  title: string;
  description: string;
  heading: string;
  accent: string;
  lede: string;
  cta: string;
  ctaAria: string;
  ctaNote: string;
  stepsHeading: string;
  steps: string[];
  sections: { heading: string; body: string }[];
  faqHeading: string;
  faqs: { q: string; a: string }[];
  footer: { support: string; privacy: string; terms: string; english: string };
};

const NBSP = " ";

export const LANGUAGE_ALTERNATES = {
  en: "/",
  de: "/de",
  fr: "/fr",
  "x-default": "/",
};

export const GERMAN: LocalizedLanding = {
  locale: "de",
  path: "/de",
  ogLocale: "de_DE",
  title: "Shelvr: Orte aus Reels und TikToks auf deiner Karte",
  description:
    "Teile ein Reel oder TikTok mit Shelvr. Die Orte darin landen auf einer Karte ihrer Stadt, bereit für ein Date oder eine Reise.",
  heading: "Orte aus Reels und TikToks",
  accent: "auf deiner Karte",
  lede: "Teile ein Reel oder TikTok mit Shelvr. Die App sucht nach den genannten Orten und zeigt sie auf der Karte der jeweiligen Stadt. Aus deinen gespeicherten Orten kannst du ein Date oder eine Reise planen.",
  cta: "Orte auf die Karte",
  ctaAria: "Orte auf die Karte, im App Store",
  ctaNote: "Für iPhone. Zum Speichern und Planen brauchst du Shelvr Pro.",
  stepsHeading: "So funktioniert’s",
  steps: [
    "Tippe in Instagram oder TikTok auf Teilen und wähle Shelvr.",
    "Shelvr sucht im Beitrag nach Restaurants, Cafés, Bars und Sehenswürdigkeiten.",
    "Die gefundenen Orte erscheinen auf der Karte der jeweiligen Stadt. Den Link zum Originalbeitrag behältst du.",
    "Öffne die Stadt in Shelvr und plane ein Date oder eine Reise mit deinen gespeicherten Orten.",
  ],
  sections: [
    {
      heading: "Deine gespeicherten Orte nach Stadt",
      body: "Öffne die Karte einer Stadt, um deine gespeicherten Restaurants, Bars und Sehenswürdigkeiten wiederzufinden.",
    },
    {
      heading: "Date planen",
      body: "Wähle „Klassisch“, „Entspannt“ oder „Überrasch mich“. Shelvr schlägt zwei Orte vor, die nur einen kurzen Fußweg auseinanderliegen. Mindestens einen davon hast du gespeichert.",
    },
    {
      heading: "Reise planen",
      body: "Wähle die Reisedauer, dein Tempo und deine Interessen. Shelvr verteilt deine gespeicherten Orte auf die Tage und ergänzt bei Bedarf Vorschläge aus Apple Karten.",
    },
  ],
  faqHeading: "Fragen",
  faqs: [
    {
      q: "Braucht Shelvr mein Instagram- oder TikTok-Konto?",
      a: "Du brauchst nur den Link zu einem öffentlichen Beitrag. Teile ihn im Teilen-Menü mit Shelvr.",
    },
    {
      q: "Aus welchen Apps kann ich teilen?",
      a: "Instagram, TikTok, YouTube, Pinterest und X.",
    },
    {
      q: "Und wenn ein Reel keinen Ort nennt?",
      a: "Dann bleibt der Inhalt in Shelvr, markiert mit „Hier wird kein Ort genannt“. Schau in die Kommentare, dort steht die Liste oft.",
    },
    {
      q: "Gibt es Shelvr auf Deutsch?",
      a: "Ja. Shelvr erscheint auf Deutsch, wenn dein iPhone auf Deutsch eingestellt ist.",
    },
    {
      q: "Auf welchen Geräten kann ich Shelvr nutzen?",
      a: "Shelvr gibt es im App Store fürs iPhone.",
    },
  ],
  footer: {
    support: "Hilfe",
    privacy: "Datenschutz",
    terms: "Nutzungsbedingungen",
    english: "English",
  },
};

export const FRENCH: LocalizedLanding = {
  locale: "fr",
  path: "/fr",
  ogLocale: "fr_FR",
  title: `Shelvr${NBSP}: les lieux de vos reels et TikToks sur une carte`,
  description:
    "Partagez un reel ou un TikTok avec Shelvr. Les lieux qu’il cite arrivent sur la carte de leur ville, prêts pour un rendez-vous ou un voyage.",
  heading: "Les lieux de vos Reels et TikToks",
  accent: "sur une carte",
  lede: "Partagez un Reel ou un TikTok avec Shelvr. L’app repère les lieux cités et les ajoute à la carte de la ville correspondante. Retrouvez-les pour préparer une soirée à deux ou un voyage.",
  cta: "Mettre mes lieux sur la carte",
  ctaAria: "Mettre mes lieux sur la carte, sur l’App Store",
  ctaNote:
    "Pour iPhone. Shelvr Pro est requis pour enregistrer des lieux et préparer un itinéraire.",
  stepsHeading: "Comment ça marche",
  steps: [
    "Dans Instagram ou TikTok, touchez Partager et choisissez Shelvr.",
    "Shelvr recherche les restaurants, cafés, bars et sites cités dans la publication.",
    "Retrouvez les lieux repérés sur la carte de leur ville et gardez le lien vers la publication d’origine.",
    "Ouvrez la ville dans Shelvr et utilisez vos lieux enregistrés pour préparer un rendez-vous ou un voyage.",
  ],
  sections: [
    {
      heading: "Vos lieux enregistrés, classés par ville",
      body: "Ouvrez la carte d’une ville pour retrouver les restaurants, bars et sites que vous y avez enregistrés.",
    },
    {
      heading: "Planifier un rendez-vous",
      body: `Choisissez «${NBSP}Classique${NBSP}», «${NBSP}Tranquille${NBSP}» ou «${NBSP}Surprenez-moi${NBSP}». Shelvr propose deux étapes à quelques minutes à pied l’une de l’autre, dont au moins un lieu que vous avez enregistré.`,
    },
    {
      heading: "Planifier un voyage",
      body: "Choisissez la durée du voyage, votre rythme et vos centres d’intérêt. Shelvr répartit vos lieux enregistrés jour par jour et complète l’itinéraire avec des suggestions de Plans d’Apple si besoin.",
    },
  ],
  faqHeading: "Questions",
  faqs: [
    {
      q: `Shelvr a-t-il besoin de mon compte Instagram ou TikTok${NBSP}?`,
      a: "Il suffit d’un lien vers une publication publique. Envoyez-le à Shelvr depuis le menu de partage.",
    },
    {
      q: `Depuis quelles applis puis-je partager${NBSP}?`,
      a: "Instagram, TikTok, YouTube, Pinterest et X.",
    },
    {
      q: `Et si un reel ne cite aucun lieu${NBSP}?`,
      a: `L’enregistrement reste dans Shelvr, avec la mention «${NBSP}Aucun lieu dans celui-ci${NBSP}». Regardez les commentaires${NBSP}: les créateurs y épinglent souvent la liste.`,
    },
    {
      q: `Shelvr est-il disponible en français${NBSP}?`,
      a: "Oui. Shelvr s’affiche en français quand votre iPhone est réglé en français.",
    },
    {
      q: `Sur quels appareils puis-je utiliser Shelvr${NBSP}?`,
      a: "Shelvr est disponible sur l’App Store pour iPhone.",
    },
  ],
  footer: {
    support: "Assistance",
    privacy: "Confidentialité",
    terms: "Conditions",
    english: "English",
  },
};

export const LANDINGS = [GERMAN, FRENCH] as const;

export function landingMetadata(page: LocalizedLanding): Metadata {
  const base = pageMetadata(page.path, page.title, page.description);
  return {
    ...base,
    alternates: { canonical: page.path, languages: LANGUAGE_ALTERNATES },
    openGraph: { ...base.openGraph, locale: page.ogLocale },
    twitter: {
      card: "summary_large_image",
      title: page.title,
      description: page.description,
    },
  };
}

export function landingStructuredData(page: LocalizedLanding) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: page.title,
    url: `${SITE_ORIGIN}${page.path}`,
    inLanguage: page.locale,
    description: page.description,
    isPartOf: { "@id": `${SITE_ORIGIN}/#website` },
    publisher: { "@id": `${SITE_ORIGIN}/#organization` },
  };
}
