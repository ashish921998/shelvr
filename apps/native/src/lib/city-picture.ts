import { CITY_PICTURES } from "@/components/onboarding/city-pictures";
import { SAMPLE_CITY_IDS, type SampleCityId } from "@/lib/sample-cities";

const ALIASES = new Map<string, SampleCityId>(
  Object.entries({
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
  }),
);

function fold(city: string): string {
  return city
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/ø/g, "o")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function curatedCityId(city: string): SampleCityId | undefined {
  const name = fold(city);
  return (
    SAMPLE_CITY_IDS.find((id) => id.replace(/-/g, " ") === name) ??
    ALIASES.get(name)
  );
}

export function curatedCityPicture(city: string): number | undefined {
  const id = curatedCityId(city);
  return id === undefined ? undefined : CITY_PICTURES[id].view;
}
