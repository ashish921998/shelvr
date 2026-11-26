import SwiftUI

struct HomeChromePressStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label.opacity(configuration.isPressed ? 0.7 : 1)
  }
}

struct HomeActionCard: View {
  enum Emphasis { case primary, standard, secondary }

  let title: String
  let detail: String
  let symbol: String
  let palette: HomeChromePalette
  var emphasis: Emphasis = .standard
  let action: () -> Void

  var body: some View {
    let primary = emphasis == .primary
    let secondary = emphasis == .secondary
    let shape = RoundedRectangle(cornerRadius: 18)
    Button(action: action) {
      HStack(spacing: 14) {
        Image(systemName: symbol)
          .font(.system(size: secondary ? 19 : 24, weight: .medium))
          .foregroundStyle(secondary ? palette.muted : palette.primaryText)
          .frame(width: secondary ? 40 : 52, height: secondary ? 40 : 52)
          .background(secondary ? palette.background : palette.primaryText.opacity(0.10),
            in: RoundedRectangle(cornerRadius: 12))
          .accessibilityHidden(true)
        VStack(alignment: .leading, spacing: 3) {
          Text(title).font(.custom("Satoshi-Bold", size: secondary ? 16 : 21, relativeTo: .headline))
            .foregroundStyle(palette.foreground)
          Text(detail).font(.custom("Satoshi-Regular", size: 14, relativeTo: .subheadline))
            .foregroundStyle(palette.muted)
        }
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: .infinity, alignment: .leading)
        Image(systemName: "chevron.right")
          .font(.system(size: 12, weight: .semibold))
          .foregroundStyle(palette.muted)
          .accessibilityHidden(true)
      }
      .padding(secondary ? 12 : 16)
      .background {
        shape.fill(palette.surface)
        if primary { shape.fill(Color("AccentColor").opacity(0.13)) }
      }
      .overlay { shape.strokeBorder(primary ? palette.primaryText.opacity(0.30) : palette.border) }
      .contentShape(shape)
    }
    .buttonStyle(HomeChromePressStyle())
    .accessibilityLabel(Text(title))
    .accessibilityHint(Text(detail))
  }
}

struct HomeChromePalette {
  let background, frame, surface, foreground, muted, primaryText, border: Color
  let shadow = Color(rgb: 0x2b2418)

  init(_ scheme: ColorScheme, appearance: String) {
    let neutralDark = scheme == .dark && appearance == "neutralDark"
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
