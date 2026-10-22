import { useWindowDimensions } from "react-native";

// The app is portrait-locked on iPhone, so only an unfolded iPhone Duo (or a
// resizable Android window) reaches these widths; every other phone stays at 2.
const THREE_COLUMNS_FROM = 600;
const FOUR_COLUMNS_FROM = 900;

export const TRIP_SIDE_PANEL_WIDTH = 360;
export const TRIP_SIDE_PANEL_MARGIN = 12;
const TRIP_SIDE_PANEL_FROM = 800;

export function feedColumns(width: number): number {
  if (width >= FOUR_COLUMNS_FROM) return 4;
  if (width >= THREE_COLUMNS_FROM) return 3;
  return 2;
}

export function useFeedColumns(): number {
  return feedColumns(useWindowDimensions().width);
}

export function tripSidePanel(width: number, height: number): boolean {
  return width >= TRIP_SIDE_PANEL_FROM && width > height;
}

export function useTripSidePanel(): boolean {
  const { width, height } = useWindowDimensions();
  return tripSidePanel(width, height);
}
