import SwiftUI

struct HomeChromePressStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label.opacity(configuration.isPressed ? 0.7 : 1)
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
