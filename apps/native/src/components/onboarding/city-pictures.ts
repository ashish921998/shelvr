import type { SampleCityId } from "@/lib/sample-cities";

// Each city's covers: a dish for the reel, a view for the article. Unsplash,
// under its free licence; credits are kept with the onboarding notes.
export const CITY_PICTURES: Record<
  SampleCityId,
  Record<"food" | "view", number>
> = {
  barcelona: {
    food: require("../../../assets/onboarding/city-barcelona-food.jpg"),
    view: require("../../../assets/onboarding/city-barcelona-view.jpg"),
  },
  lisbon: {
    food: require("../../../assets/onboarding/city-lisbon-food.jpg"),
    view: require("../../../assets/onboarding/city-lisbon-view.jpg"),
  },
  london: {
    food: require("../../../assets/onboarding/city-london-food.jpg"),
    view: require("../../../assets/onboarding/city-london-view.jpg"),
  },
  "los-angeles": {
    food: require("../../../assets/onboarding/city-los-angeles-food.jpg"),
    view: require("../../../assets/onboarding/city-los-angeles-view.jpg"),
  },
  "new-york": {
    food: require("../../../assets/onboarding/city-new-york-food.jpg"),
    view: require("../../../assets/onboarding/city-new-york-view.jpg"),
  },
  paris: {
    food: require("../../../assets/onboarding/city-paris-food.jpg"),
    view: require("../../../assets/onboarding/city-paris-view.jpg"),
  },
  prague: {
    food: require("../../../assets/onboarding/city-prague-food.jpg"),
    view: require("../../../assets/onboarding/prague.jpg"),
  },
  "san-francisco": {
    food: require("../../../assets/onboarding/city-san-francisco-food.jpg"),
    view: require("../../../assets/onboarding/city-san-francisco-view.jpg"),
  },
  seoul: {
    food: require("../../../assets/onboarding/city-seoul-food.jpg"),
    view: require("../../../assets/onboarding/city-seoul-view.jpg"),
  },
  tokyo: {
    food: require("../../../assets/onboarding/city-tokyo-food.jpg"),
    view: require("../../../assets/onboarding/city-tokyo-view.jpg"),
  },
  toronto: {
    food: require("../../../assets/onboarding/city-toronto-food.jpg"),
    view: require("../../../assets/onboarding/city-toronto-view.jpg"),
  },
};
