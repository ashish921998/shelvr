import SwiftUI

struct HomeChromePressStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label.opacity(configuration.isPressed ? 0.7 : 1)
  }
}

struct HomeChromePalette {
  let background, frame, surface, foreground, muted, primaryText, border: Color
  let stampInks: [Color]
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
      stampInks = [0xb3261e, 0x176b3a, 0x1f56b8, 0x6b3fb0, 0x095f63, 0x7d5100].map(Color.init(rgb:))
    } else if neutralDark {
      background = Color(rgb: 0x111417)
      frame = Color(rgb: 0x1b1f24)
      surface = frame
      foreground = Color(rgb: 0xe8ebee)
      muted = Color(rgb: 0xa2abb5)
      primaryText = Color(rgb: 0xffd60a)
      border = Color(rgb: 0x2c3238)
      stampInks = [0xf08b80, 0x6fcf8c, 0x7fabf5, 0xb79af2, 0x52cbd0, 0xe3b45a].map(Color.init(rgb:))
    } else {
      background = Color(.background)
      frame = Color(rgb: 0x231e16)
      surface = frame
      foreground = Color(.foreground)
      muted = Color(.muted)
      primaryText = Color(rgb: 0xf0c078)
      border = Color(rgb: 0x332c20)
      stampInks = [0xf08b80, 0x6fcf8c, 0x7fabf5, 0xb79af2, 0x52cbd0, 0xe3b45a].map(Color.init(rgb:))
    }
  }
}

private extension Color {
  init(rgb: UInt32) {
    self.init(red: Double((rgb >> 16) & 255) / 255,
      green: Double((rgb >> 8) & 255) / 255, blue: Double(rgb & 255) / 255)
  }
}
