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
    HStack(spacing: 6) {
      HStack(spacing: 0) {
        viewControl(false, palette: palette)
        viewControl(true, palette: palette)
      }
      .frame(maxWidth: .infinity)
      Button(action: add) {
        Image(systemName: "plus")
          .font(.system(size: 24, weight: .semibold))
          .foregroundStyle(palette.onPrimary)
          .frame(width: 50, height: 50)
          .background(palette.primary, in: Circle())
      }
      .accessibilityLabel(copy("common.add"))
      destination(copy("plan.goOut"), symbol: "shoeprints.fill", palette: palette, action: plan)
    }
    .buttonStyle(HomeChromePressStyle())
    .padding(.horizontal, 8)
    .padding(.vertical, 6)
    .frame(maxWidth: 352)
    .background(palette.surface, in: RoundedRectangle(cornerRadius: 32, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 32, style: .continuous).strokeBorder(palette.border, lineWidth: 0.75)
        .allowsHitTesting(false)
    }
    .shadow(color: palette.shadow.opacity(0.16), radius: 8, y: 3)
    .padding(.horizontal, 16)
    .frame(maxWidth: .infinity)
    .padding(.top, library ? 8 : 0)
    .padding(.bottom, 32)
  }

  private func viewControl(_ opensLibrary: Bool, palette: HomeChromePalette) -> some View {
    let selected = library == opensLibrary
    return destination(copy(opensLibrary ? "navigation.library" : "navigation.map"),
      symbol: opensLibrary ? "books.vertical" : "map", palette: palette, selected: selected) {
        if !selected { switchTab() }
      }
  }

  private func destination(_ label: String, symbol: String, palette: HomeChromePalette,
    selected: Bool = false, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      VStack(spacing: 3) {
        Image(systemName: symbol)
          .font(.system(size: 18, weight: selected ? .semibold : .medium))
          .accessibilityHidden(true)
        Text(label)
          .font(.custom("Satoshi-Bold", size: 12, relativeTo: .caption))
          .multilineTextAlignment(.center)
          .fixedSize(horizontal: false, vertical: true)
      }
      .foregroundStyle(selected ? palette.background : palette.foreground)
      .frame(maxWidth: .infinity, minHeight: 48)
      .background(selected ? palette.foreground : .clear, in: RoundedRectangle(cornerRadius: 21))
      .contentShape(Rectangle())
    }
    .accessibilityLabel(label)
    .accessibilityAddTraits(selected ? .isSelected : [])
  }
}

struct HomeChromePressStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label.opacity(configuration.isPressed ? 0.7 : 1)
  }
}

struct HomeChromePalette {
  let background, frame, surface, foreground, muted, primaryText, border: Color
  let primary, onPrimary: Color
  let shadow = Color(rgb: 0x2b2418)

  init(_ scheme: ColorScheme, appearance: String) {
    let neutralDark = scheme == .dark && appearance == "neutralDark"
    primary = neutralDark ? Color(rgb: 0xffd60a) : Color("AccentColor")
    onPrimary = Color(rgb: neutralDark ? 0x111417 : 0x2b2418)
    if scheme == .light {
      background = Color(.background)
      frame = .white
      surface = Color(rgb: 0xfffdf8)
      foreground = Color(.foreground)
      muted = Color(.muted)
      primaryText = Color(rgb: 0x935d09)
      border = Color(rgb: 0xece3d1)
    } else if neutralDark {
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
