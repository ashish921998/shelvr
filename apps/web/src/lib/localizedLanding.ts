import type { Metadata } from "next";

import { pageMetadata } from "@/lib/siteMetadata";

export type LandingLocale = "de" | "fr";

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
  heading: "Gespeichert.",
  accent: "Jetzt hin.",
  lede: "Teile ein Reel oder TikTok mit Shelvr. Die Orte darin landen auf einer Karte ihrer Stadt, bereit für ein Date oder eine Reise.",
  cta: "Orte auf die Karte",
  ctaAria: "Orte auf die Karte, im App Store",
  ctaNote: "Im App Store, fürs iPhone. Android folgt.",
  stepsHeading: "So funktioniert’s",
  steps: [
    "Tippe in Instagram oder TikTok auf Teilen und wähle Shelvr.",
    "Shelvr liest den Beitrag und findet die Restaurants, Cafés, Bars und Sehenswürdigkeiten, die darin genannt werden.",
    "Jeder Ort landet unter seiner Stadt auf einer Karte, neben dem Reel, aus dem er stammt.",
    "Wenn du hinfährst, öffne die Stadt und lass dir ein Date oder eine Reise planen.",
  ],
  sections: [
    {
      heading: "Deine Orte, auf einer Karte.",
      body: "Finde deine gespeicherten Orte, Stadt für Stadt. Kein Scrollen mehr durch vierzig Reels, um die eine Bar wiederzufinden.",
    },
    {
      heading: "Date planen",
      body: `Ein Abend, zwei Stopps, nur einen kurzen Fußweg voneinander entfernt, aus deinen gespeicherten Orten. Klassisch (Abendessen, danach Drinks oder Dessert), entspannt (Kaffee, danach ein Spaziergang) oder „Überrasch mich“.`,
    },
    {
      heading: "Reise planen",
      body: "Mach aus deinen gespeicherten Orten Tage: ein Viertel pro Tag, von morgens bis abends, im Tempo deiner Wahl, dazu Vorschläge in der Nähe.",
    },
    {
      heading: "Schon da gewesen?",
      body: "Hake die Orte ab, an denen du warst, und der nächste Plan wählt etwas Neues. In deinem Pass sammelst du Städte und Länder.",
    },
  ],
  faqHeading: "Fragen",
  faqs: [
    {
      q: "Braucht Shelvr mein Instagram- oder TikTok-Konto?",
      a: "Nein. Du teilst den Beitrag über das Teilen-Menü, und Shelvr liest den öffentlichen Beitrag. Private Beiträge kann Shelvr nicht lesen.",
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
      q: "Gibt es Shelvr für Android?",
      a: "Noch nicht. Shelvr gibt es im App Store fürs iPhone, Android folgt.",
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
  heading: "Enregistré.",
  accent: "Il reste à y aller.",
  lede: "Partagez un reel ou un TikTok avec Shelvr. Les lieux qu’il cite arrivent sur la carte de leur ville, prêts pour un rendez-vous ou un voyage.",
  cta: "Mettre mes lieux sur la carte",
  ctaAria: "Mettre mes lieux sur la carte, sur l’App Store",
  ctaNote: "Sur l’App Store, pour iPhone. Android arrive bientôt.",
  stepsHeading: "Comment ça marche",
  steps: [
    "Dans Instagram ou TikTok, touchez Partager et choisissez Shelvr.",
    "Shelvr lit la publication et retrouve les restaurants, cafés, bars et sites qu’elle cite.",
    "Chaque lieu arrive dans sa ville, sur une carte, à côté du reel d’où il vient.",
    "Le moment venu, ouvrez la ville et demandez un rendez-vous ou un voyage.",
  ],
  sections: [
    {
      heading: "Vos lieux, sur une seule carte.",
      body: "Retrouvez vos lieux enregistrés, ville par ville. Plus besoin de faire défiler quarante reels pour retrouver ce bar.",
    },
    {
      heading: "Planifier un rendez-vous",
      body: `Une soirée, deux étapes à quelques minutes à pied l’une de l’autre, choisies parmi vos lieux enregistrés. Classique (dîner, puis un verre ou un dessert), tranquille (un café, puis une balade) ou «${NBSP}Surprenez-moi${NBSP}».`,
    },
    {
      heading: "Planifier un voyage",
      body: `Transformez vos lieux enregistrés en journées${NBSP}: un quartier par jour, du matin au soir, au rythme que vous choisissez, avec des suggestions à proximité.`,
    },
    {
      heading: `Déjà visité${NBSP}?`,
      body: "Cochez les lieux déjà visités, et le prochain plan en choisit de nouveaux. Votre Passeport rassemble les villes et les pays.",
    },
  ],
  faqHeading: "Questions",
  faqs: [
    {
      q: `Shelvr a-t-il besoin de mon compte Instagram ou TikTok${NBSP}?`,
      a: "Non. Vous partagez la publication depuis le menu de partage, et Shelvr lit la publication publique. Les publications privées ne peuvent pas être lues.",
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
      q: `Shelvr existe-t-il sur Android${NBSP}?`,
      a: "Pas encore. Shelvr est sur l’App Store pour iPhone, et Android arrive bientôt.",
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

export function landingStructuredData(page: LocalizedLanding, site: string) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        name: page.title,
        url: `${site}${page.path}`,
        inLanguage: page.locale,
        description: page.description,
        publisher: { "@type": "Organization", name: "Shelvr" },
      },
      {
        "@type": "FAQPage",
        inLanguage: page.locale,
        mainEntity: page.faqs.map((faq) => ({
          "@type": "Question",
          name: faq.q,
          acceptedAnswer: { "@type": "Answer", text: faq.a },
        })),
      },
    ],
  };
}
