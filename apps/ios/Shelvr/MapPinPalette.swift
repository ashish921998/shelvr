import ShelvrKit
import UIKit

enum MapPinPalette {
  static func primaryKind(for place: MapPlace) -> PlaceKind? {
    place.preferredPinKind ?? (place.kinds.contains(.dateNight) ? .dateNight : nil)
  }

  static func color(for kind: PlaceKind?) -> UIColor {
    let rgb: UInt32 = switch kind {
    case .food: 0xBB4B35
    case .coffee: 0x8F562A
    case .dessert: 0xAF4877
    case .drinks: 0x7652A7
    case .activities: 0x2F805D
    case .shopping: 0x336C9F
    case .stay: 0x555F9A
    case .dateNight: 0xAA4860
    case nil: 0xB47824
    }
    return UIColor(red: CGFloat((rgb >> 16) & 255) / 255, green: CGFloat((rgb >> 8) & 255) / 255,
      blue: CGFloat(rgb & 255) / 255, alpha: 1)
  }
}
