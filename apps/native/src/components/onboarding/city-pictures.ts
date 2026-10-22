import type { SampleCityId } from "@/lib/sample-cities";

// The city-*.jpg photos are from Unsplash, under its free licence; prague.jpg was generated for the app.
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
  chicago: {
    food: require("../../../assets/onboarding/city-chicago-food.jpg"),
    view: require("../../../assets/onboarding/city-chicago-view.jpg"),
  },
  seattle: {
    food: require("../../../assets/onboarding/city-seattle-food.jpg"),
    view: require("../../../assets/onboarding/city-seattle-view.jpg"),
  },
  austin: {
    food: require("../../../assets/onboarding/city-austin-food.jpg"),
    view: require("../../../assets/onboarding/city-austin-view.jpg"),
  },
  dallas: {
    food: require("../../../assets/onboarding/city-dallas-food.jpg"),
    view: require("../../../assets/onboarding/city-dallas-view.jpg"),
  },
  "las-vegas": {
    food: require("../../../assets/onboarding/city-las-vegas-food.jpg"),
    view: require("../../../assets/onboarding/city-las-vegas-view.jpg"),
  },
  vancouver: {
    food: require("../../../assets/onboarding/city-vancouver-food.jpg"),
    view: require("../../../assets/onboarding/city-vancouver-view.jpg"),
  },
  montreal: {
    food: require("../../../assets/onboarding/city-montreal-food.jpg"),
    view: require("../../../assets/onboarding/city-montreal-view.jpg"),
  },
  madrid: {
    food: require("../../../assets/onboarding/city-madrid-food.jpg"),
    view: require("../../../assets/onboarding/city-madrid-view.jpg"),
  },
  berlin: {
    food: require("../../../assets/onboarding/city-berlin-food.jpg"),
    view: require("../../../assets/onboarding/city-berlin-view.jpg"),
  },
  florence: {
    food: require("../../../assets/onboarding/city-florence-food.jpg"),
    view: require("../../../assets/onboarding/city-florence-view.jpg"),
  },
  amsterdam: {
    food: require("../../../assets/onboarding/city-amsterdam-food.jpg"),
    view: require("../../../assets/onboarding/city-amsterdam-view.jpg"),
  },
  rome: {
    food: require("../../../assets/onboarding/city-rome-food.jpg"),
    view: require("../../../assets/onboarding/city-rome-view.jpg"),
  },
  copenhagen: {
    food: require("../../../assets/onboarding/city-copenhagen-food.jpg"),
    view: require("../../../assets/onboarding/city-copenhagen-view.jpg"),
  },
  milan: {
    food: require("../../../assets/onboarding/city-milan-food.jpg"),
    view: require("../../../assets/onboarding/city-milan-view.jpg"),
  },
};
