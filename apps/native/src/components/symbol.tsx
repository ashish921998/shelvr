import ArrowUpRight from "lucide-react-native/icons/arrow-up-right";
import BedDouble from "lucide-react-native/icons/bed-double";
import BookOpen from "lucide-react-native/icons/book-open";
import Bookmark from "lucide-react-native/icons/bookmark";
import Building2 from "lucide-react-native/icons/building-2";
import CalendarDays from "lucide-react-native/icons/calendar-days";
import CakeSlice from "lucide-react-native/icons/cake-slice";
import Check from "lucide-react-native/icons/check";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import ChevronUp from "lucide-react-native/icons/chevron-up";
import ChevronsUpDown from "lucide-react-native/icons/chevrons-up-down";
import CircleCheck from "lucide-react-native/icons/circle-check";
import CircleMinus from "lucide-react-native/icons/circle-minus";
import CirclePlus from "lucide-react-native/icons/circle-plus";
import Coffee from "lucide-react-native/icons/coffee";
import Compass from "lucide-react-native/icons/compass";
import Copy from "lucide-react-native/icons/copy";
import Dice5 from "lucide-react-native/icons/dice-5";
import Ellipsis from "lucide-react-native/icons/ellipsis";
import ExternalLink from "lucide-react-native/icons/external-link";
import Folders from "lucide-react-native/icons/folders";
import Footprints from "lucide-react-native/icons/footprints";
import GripHorizontal from "lucide-react-native/icons/grip-horizontal";
import Heart from "lucide-react-native/icons/heart";
import ImagePlus from "lucide-react-native/icons/image-plus";
import Images from "lucide-react-native/icons/images";
import Info from "lucide-react-native/icons/info";
import Layers from "lucide-react-native/icons/layers";
import LibraryBig from "lucide-react-native/icons/library-big";
import Link from "lucide-react-native/icons/link";
import LocateFixed from "lucide-react-native/icons/locate-fixed";
import Lock from "lucide-react-native/icons/lock";
import Luggage from "lucide-react-native/icons/luggage";
import Mail from "lucide-react-native/icons/mail";
import Map from "lucide-react-native/icons/map";
import MapPin from "lucide-react-native/icons/map-pin";
import MessageCircle from "lucide-react-native/icons/message-circle";
import MessageSquare from "lucide-react-native/icons/message-square";
import Mic from "lucide-react-native/icons/mic";
import Minus from "lucide-react-native/icons/minus";
import Pencil from "lucide-react-native/icons/pencil";
import Phone from "lucide-react-native/icons/phone";
import Plane from "lucide-react-native/icons/plane";
import Play from "lucide-react-native/icons/play";
import Plus from "lucide-react-native/icons/plus";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import RotateCw from "lucide-react-native/icons/rotate-cw";
import Search from "lucide-react-native/icons/search";
import ShoppingBag from "lucide-react-native/icons/shopping-bag";
import Share from "lucide-react-native/icons/share";
import Sparkles from "lucide-react-native/icons/sparkles";
import SquarePen from "lucide-react-native/icons/square-pen";
import SquarePlay from "lucide-react-native/icons/square-play";
import StickyNote from "lucide-react-native/icons/sticky-note";
import Trash2 from "lucide-react-native/icons/trash-2";
import TriangleAlert from "lucide-react-native/icons/triangle-alert";
import Tickets from "lucide-react-native/icons/tickets";
import UserRound from "lucide-react-native/icons/user-round";
import UserRoundPlus from "lucide-react-native/icons/user-round-plus";
import Users from "lucide-react-native/icons/users";
import Utensils from "lucide-react-native/icons/utensils";
import Wine from "lucide-react-native/icons/wine";
import X from "lucide-react-native/icons/x";
import { I18nManager, type StyleProp, type ViewStyle } from "react-native";

const SYMBOLS = {
  xmark: X,
  checkmark: Check,
  plus: Plus,
  ellipsis: Ellipsis,
  "arrow.up.right": ArrowUpRight,
  "checkmark.circle.fill": CircleCheck,
  "exclamationmark.triangle.fill": TriangleAlert,
  "info.circle": Info,
  "person.fill": UserRound,
  "person.badge.plus": UserRoundPlus,
  envelope: Mail,
  message: MessageCircle,
  phone: Phone,
  "photo.on.rectangle": ImagePlus,
  "photo.stack": Images,
  "play.rectangle": SquarePlay,
  "play.fill": Play,
  "rectangle.stack.fill": Layers,
  link: Link,
  mic: Mic,
  users: Users,
  safari: Compass,
  map: Map,
  airplane: Plane,
  "suitcase.fill": Luggage,
  minus: Minus,
  magnifyingglass: Search,
  "square.and.arrow.up": Share,
  "square.and.pencil": SquarePen,
  sparkles: Sparkles,
  trash: Trash2,
  "doc.on.doc": Copy,
  calendar: CalendarDays,
  "arrow.up.right.square": ExternalLink,
  "chevron.left": ChevronLeft,
  "chevron.right": ChevronRight,
  "chevron.up": ChevronUp,
  "chevron.up.chevron.down": ChevronsUpDown,
  "arrow.2.circlepath": RefreshCw,
  "arrow.clockwise": RotateCw,
  "figure.walk": Footprints,
  "fork.knife": Utensils,
  mappin: MapPin,
  location: LocateFixed,
  lock: Lock,
  "heart.fill": Heart,
  "bubble.right.fill": MessageCircle,
  "square.and.arrow.up.fill": Share,
  "message.fill": MessageSquare,
  "note.text": StickyNote,
  "cup.and.saucer.fill": Coffee,
  "line.3.horizontal": GripHorizontal,
  "minus.circle.fill": CircleMinus,
  "plus.circle.fill": CirclePlus,
  pencil: Pencil,
  "map.fill": Map,
  "bookmark.fill": Bookmark,
  "books.vertical.fill": LibraryBig,
  "book.closed.fill": BookOpen,
  "dice.fill": Dice5,
  cities: Building2,
  collections: Folders,
  dessert: CakeSlice,
  drinks: Wine,
  activities: Tickets,
  shopping: ShoppingBag,
  stay: BedDouble,
} as const;

export type AppSymbolName = keyof typeof SYMBOLS;

const STROKE_WIDTH = {
  regular: 2,
  medium: 2.1,
  semibold: 2.25,
  bold: 2.5,
} as const;

function resolveSymbolName(name: AppSymbolName): AppSymbolName {
  if (I18nManager.isRTL) {
    if (name === "chevron.left") return "chevron.right";
    if (name === "chevron.right") return "chevron.left";
  }
  return name;
}

export function AppSymbolIcon({
  name,
  size = 24,
  tintColor,
  weight = "regular",
  style,
}: {
  name: AppSymbolName;
  size?: number;
  tintColor?: string;
  weight?: keyof typeof STROKE_WIDTH;
  style?: StyleProp<ViewStyle>;
}) {
  const Icon = SYMBOLS[resolveSymbolName(name)];
  return (
    <Icon
      accessible={false}
      pointerEvents="none"
      size={size}
      color={tintColor}
      strokeWidth={STROKE_WIDTH[weight]}
      style={style}
    />
  );
}
