import { useWindowDimensions } from "react-native";

// The app is portrait-locked on iPhone, so only an unfolded iPhone Duo held
// sideways (or a resizable Android window) is this wide and short.
export const TRIP_SIDE_PANEL_WIDTH = 360;
export const TRIP_SIDE_PANEL_MARGIN = 12;
const TRIP_SIDE_PANEL_FROM = 800;

export function tripSidePanel(width: number, height: number): boolean {
  return width >= TRIP_SIDE_PANEL_FROM && width > height;
}

export function useTripSidePanel(): boolean {
  const { width, height } = useWindowDimensions();
  return tripSidePanel(width, height);
}
