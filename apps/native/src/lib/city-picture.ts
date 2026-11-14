import { CITY_PICTURES } from "@/components/onboarding/city-pictures";
import { SAMPLE_CITY_IDS, type SampleCityId } from "@/lib/sample-cities";

const ALIASES: Record<string, SampleCityId> = {
  nyc: "new-york",
  "new york city": "new-york",
  la: "los-angeles",
  sf: "san-francisco",
  lisboa: "lisbon",
  praha: "prague",
  roma: "rome",
  milano: "milan",
  firenze: "florence",
  kobenhavn: "copenhagen",
  vegas: "las-vegas",
};

function fold(city: string): string {
  return city
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ø/g, "o")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function curatedCityId(city: string): SampleCityId | undefined {
  const name = fold(city);
  return (
    SAMPLE_CITY_IDS.find((id) => id.replace(/-/g, " ") === name) ??
    ALIASES[name]
  );
}

export function curatedCityPicture(city: string): number | undefined {
  const id = curatedCityId(city);
  return id === undefined ? undefined : CITY_PICTURES[id].view;
}
