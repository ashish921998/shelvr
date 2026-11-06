import { describe, expect, it } from "vitest";
import de from "@/locales/de.json";
import frCA from "@/locales/fr-CA.json";
import fr from "@/locales/fr.json";

const tuPronoun =
  /(?<!\p{L})(?:tu|ton|ta|tes|toi|te)(?!\p{L})|(?<!\p{L})t[’']/iu;
const tuImperative =
  /(?:^|[.!?…]\s+|\bpuis\s+|,\s+|\bet\s+)(?:trouve|choisis|tire|touche|glisse|balaie|retourne|partage|découvre|essaie|fais|enregistres?|réessaie|vérifie|surprends|prépare|ajoute|ouvre|appuie|regarde|garde|reviens|va|viens|planifie|prévois|réponds|autorise|active|lis|commence|continue|passe|reprends|demande|envoie)(?!\p{L})/iu;

type Catalog = Record<string, string | Record<string, string>>;

const messages = (catalog: Catalog): [string, string][] =>
  Object.entries(catalog).flatMap(([key, value]) =>
    (typeof value === "string" ? [value] : Object.values(value)).map(
      (text): [string, string] => [key, text],
    ),
  );

const informalOnPurpose = {
  "plan.askText": "the message a person sends a friend",
  "permissions.locationUsage":
    "a native Info.plist string; changing it moves the fingerprint",
};

const rules = [
  {
    locale: "fr",
    catalog: fr as Catalog,
    breaks: (text: string) => tuPronoun.test(text) || tuImperative.test(text),
    fix: "French app copy says vous: votre/vos, Réessayez, Choisissez, Surprenez-moi",
    except: informalOnPurpose,
  },
  {
    locale: "fr-CA",
    catalog: frCA as Catalog,
    breaks: (text: string) => tuPronoun.test(text) || tuImperative.test(text),
    fix: "French app copy says vous: votre/vos, Réessayez, Choisissez, Surprenez-moi",
    except: informalOnPurpose,
  },
  {
    locale: "de",
    catalog: de as Catalog,
    breaks: (text: string) => /(?<!\p{L})Saves?(?!\p{L})/u.test(text),
    fix: "German calls a save Inhalt or gespeicherte Inhalte, never the English Saves",
    except: {},
  },
];

describe("catalog register", () => {
  it.each(rules)(
    "$locale keeps one register",
    ({ catalog, breaks, fix, except }) => {
      const offenders = messages(catalog)
        .filter(([key, text]) => !(key in except) && breaks(text))
        .map(([key, text]) => `${key}: ${text}`);
      expect(offenders, fix).toEqual([]);
    },
  );

  it("flags the strings fixed by hand in #627 and #629", () => {
    const [french, , german] = rules;
    expect(french.breaks("Trouve où manger la prochaine fois.")).toBe(true);
    expect(french.breaks("Vérifie ta connexion et réessaie.")).toBe(true);
    expect(french.breaks("Enregistre un café, puis réessaie.")).toBe(true);
    expect(french.breaks("Vérifiez votre connexion et réessaie.")).toBe(true);
    expect(french.breaks("Vérifiez votre connexion et réessayez.")).toBe(false);
    expect(french.breaks("Cuisine et recettes")).toBe(false);
    expect(german.breaks("Deine Saves werden gelesen")).toBe(true);
    expect(german.breaks("Deine Inhalte werden gelesen")).toBe(false);
  });
});
