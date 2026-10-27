import {
  SymbolView,
  type AndroidSymbol,
  type SFSymbol,
  type SymbolViewProps,
} from "expo-symbols";
import { I18nManager, Platform } from "react-native";

const SF_TO_MATERIAL = {
  xmark: "close",
  checkmark: "check",
  plus: "add",
  ellipsis: "more_vert",
  "arrow.up.right": "north_east",
  "checkmark.circle.fill": "check_circle",
  "exclamationmark.triangle.fill": "warning",
  "exclamationmark.circle": "error",
  "info.circle": "info",
  "person.fill": "person",
  envelope: "mail",
  message: "chat",
  phone: "call",
  camera: "photo_camera",
  "photo.on.rectangle": "add_photo_alternate",
  "photo.on.rectangle.angled": "add_photo_alternate",
  "photo.stack": "photo_library",
  "square.grid.2x2": "grid_view",
  "square.grid.2x2.fill": "grid_view",
  "star.fill": "star",
  bell: "notifications",
  heart: "favorite",
  "play.rectangle": "smart_display",
  "play.fill": "play_arrow",
  "rectangle.stack": "collections_bookmark",
  "rectangle.stack.fill": "collections_bookmark",
  link: "link",
  safari: "language",
  map: "map",
  airplane: "flight",
  "arrow.triangle.turn.up.right.diamond.fill": "directions",
  "arrow.left.arrow.right": "swap_horiz",
  minus: "remove",
  magnifyingglass: "search",
  bag: "shopping_bag",
  "square.and.arrow.up": "ios_share",
  "square.and.pencil": "edit_note",
  sparkles: "auto_awesome",
  trash: "delete",
  "doc.on.doc": "content_copy",
  calendar: "calendar_month",
  "arrow.up.right.square": "open_in_new",
  "chevron.left": "arrow_back",
  "chevron.right": "arrow_forward",
  "chevron.up": "expand_less",
  "chevron.up.chevron.down": "unfold_more",
  "arrow.uturn.backward": "undo",
  "house.fill": "home",
  gearshape: "settings",
  "gearshape.fill": "settings",
  "arrow.2.circlepath": "refresh",
  "arrow.clockwise": "refresh",
  speedometer: "speed",
  viewfinder: "center_focus_strong",
  "figure.run": "directions_run",
  "hand.tap": "pan_tool",
  "tray.and.arrow.up": "move_up",
  "arrow.up": "arrow_upward",
  "doc.text": "description",
  "fork.knife": "restaurant",
  mappin: "location_on",
  lock: "lock",
  "arrow.triangle.2.circlepath.camera": "cameraswitch",
  "heart.fill": "favorite",
  "bubble.right.fill": "chat_bubble",
  "square.and.arrow.up.fill": "ios_share",
  "message.fill": "chat",
  "note.text": "sticky_note_2",
  "cup.and.saucer.fill": "local_cafe",
  "binoculars.fill": "landscape",
  "paintpalette.fill": "palette",
  "line.3.horizontal": "drag_handle",
  "minus.circle.fill": "remove_circle",
  "plus.circle.fill": "add_circle",
  pencil: "edit",
} as const satisfies Partial<Record<SFSymbol, AndroidSymbol>>;

export type AppSymbolName = keyof typeof SF_TO_MATERIAL;

// expo-symbols reads the `web` key in browsers, so omitting it renders nothing.
function resolveSymbolName(sfName: AppSymbolName): SymbolViewProps["name"] {
  if (Platform.OS === "ios") {
    return sfName;
  }
  const material = SF_TO_MATERIAL[sfName] ?? "circle";
  return { android: material, web: material } as const;
}

export function AppSymbolIcon({
  name,
  size = 24,
  tintColor,
  weight,
  style,
}: {
  name: AppSymbolName;
  size?: number;
  tintColor?: string;
  weight?: SymbolViewProps["weight"];
  style?: SymbolViewProps["style"];
}) {
  return (
    <SymbolView
      name={resolveSymbolName(
        I18nManager.isRTL && name === "chevron.left"
          ? "chevron.right"
          : I18nManager.isRTL && name === "chevron.right"
            ? "chevron.left"
            : name,
      )}
      size={size}
      tintColor={tintColor}
      weight={weight}
      style={style}
    />
  );
}
