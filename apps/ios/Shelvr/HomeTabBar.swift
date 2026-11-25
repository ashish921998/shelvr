import ShelvrInbox
import SwiftUI

struct HomeTabBar: View {
  let library: Bool
  let switchTab: () -> Void
  let add: () -> Void
  let plan: () -> Void
  @Environment(\.copy) private var copy
  @Environment(\.colorScheme) private var scheme
  @AppStorage("swift.appearance") private var appearance = "system"

  var body: some View {
    let palette = HomeChromePalette(scheme, appearance: appearance)
    HStack(alignment: .bottom, spacing: 0) {
      destination(copy(library ? "navigation.map" : "navigation.library"),
        symbol: library ? "map" : "books.vertical", palette: palette, action: switchTab)
      Button(action: add) {
        Image(systemName: "plus")
          .font(.system(size: 27, weight: .bold))
          .foregroundStyle(palette.foreground)
          .frame(width: 64, height: 64)
          .background(palette.frame, in: Circle())
          .overlay { Circle().strokeBorder(palette.border, lineWidth: 0.5) }
          .shadow(color: palette.shadow.opacity(0.18), radius: 7, y: 4)
      }
      .accessibilityLabel(copy("common.add"))
      .padding(.bottom, 8)
      destination(copy("plan.goOut"), symbol: "shoeprints.fill", palette: palette, action: plan)
    }
    .buttonStyle(HomeChromePressStyle())
    .frame(maxWidth: .infinity)
    .padding(.top, library ? 16 : 0)
    .padding(.bottom, 32)
    .background {
      if library {
        palette.background.ignoresSafeArea(edges: .bottom)
        VStack {
          Rectangle().fill(palette.border).frame(height: 0.5)
          Spacer(minLength: 0)
        }
      }
    }
  }

  func mapDock(search: @escaping () -> Void, palette: HomeChromePalette) -> some View {
    HStack(spacing: 8) {
      mapAction(copy("navigation.library"), symbol: "books.vertical", palette: palette, action: switchTab)
      Button(action: search) {
        Label(copy("map.searchPlaceholder"), systemImage: "magnifyingglass")
          .font(.custom("Satoshi-Regular", size: 16, relativeTo: .body))
          .foregroundStyle(palette.foreground)
          .lineLimit(1)
          .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
          .padding(.horizontal, 16)
          .background(palette.surface, in: Capsule())
          .overlay { Capsule().strokeBorder(palette.border, lineWidth: 0.5) }
      }
      .accessibilityLabel(copy("map.searchPlaceholder"))
      mapAction(copy("plan.goOut"), symbol: "shoeprints.fill", palette: palette, action: plan)
    }
    .padding(.horizontal, 20)
    .padding(.bottom, 32)
    .buttonStyle(HomeChromePressStyle())
  }

  private func mapAction(_ label: String, symbol: String, palette: HomeChromePalette,
    action: @escaping () -> Void) -> some View {
    Button(action: action) {
      VStack(spacing: 2) {
        Image(systemName: symbol).font(.system(size: 18, weight: .medium))
          .foregroundStyle(palette.primaryText)
        Text(label).font(.custom("Satoshi-Regular", size: 11, relativeTo: .caption2))
          .foregroundStyle(palette.foreground).lineLimit(1)
      }
      .frame(minWidth: 58, minHeight: 52)
      .padding(.horizontal, 4)
      .background(palette.surface, in: RoundedRectangle(cornerRadius: 18))
      .overlay { RoundedRectangle(cornerRadius: 18).strokeBorder(palette.border, lineWidth: 0.5) }
    }
    .accessibilityLabel(label)
  }

  private func destination(_ label: String, symbol: String, palette: HomeChromePalette,
    action: @escaping () -> Void) -> some View {
    Button(action: action) {
      VStack(spacing: 5) {
        Image(systemName: symbol)
          .font(.system(size: 26, weight: .medium))
          .foregroundStyle(palette.primaryText)
          .frame(width: 44, height: 44)
          .background(palette.frame, in: RoundedRectangle(cornerRadius: 16))
          .overlay { RoundedRectangle(cornerRadius: 16).strokeBorder(palette.border, lineWidth: 0.5) }
          .shadow(color: palette.shadow.opacity(0.10), radius: 2.5, y: 2)
        Text(label)
          .font(.custom("Satoshi-Regular", size: 11, relativeTo: .caption2))
          .foregroundStyle(palette.muted)
          .lineLimit(1)
      }
      .frame(maxWidth: 100)
      .contentShape(Rectangle())
    }
    .accessibilityLabel(label)
  }
}

struct HomeChromePressStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label.opacity(configuration.isPressed ? 0.7 : 1)
  }
}

struct HomeChromePalette {
  let background, frame, surface, foreground, muted, primaryText, border: Color
  let shadow = Color(rgb: 0x2b2418)

  init(_ scheme: ColorScheme, appearance: String) {
    if scheme == .light {
      background = Color(.background)
      frame = .white
      surface = Color(rgb: 0xfffdf8)
      foreground = Color(.foreground)
      muted = Color(.muted)
      primaryText = Color(rgb: 0x935d09)
      border = Color(rgb: 0xece3d1)
    } else if appearance == "neutralDark" {
      background = Color(rgb: 0x111417)
      frame = Color(rgb: 0x1b1f24)
      surface = frame
      foreground = Color(rgb: 0xe8ebee)
      muted = Color(rgb: 0xa2abb5)
      primaryText = Color(rgb: 0xffd60a)
      border = Color(rgb: 0x2c3238)
    } else {
      background = Color(.background)
      frame = Color(rgb: 0x231e16)
      surface = frame
      foreground = Color(.foreground)
      muted = Color(.muted)
      primaryText = Color(rgb: 0xf0c078)
      border = Color(rgb: 0x332c20)
    }
  }
}

private extension Color {
  init(rgb: UInt32) {
    self.init(red: Double((rgb >> 16) & 255) / 255,
      green: Double((rgb >> 8) & 255) / 255, blue: Double(rgb & 255) / 255)
  }
}
