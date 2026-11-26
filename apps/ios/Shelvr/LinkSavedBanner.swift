import SwiftUI

struct LinkSavedBanner: View {
  let viewSave: () -> Void
  let dismiss: () -> Void

  @Environment(\.copy) private var copy
  @Environment(\.colorScheme) private var scheme
  @Environment(\.accessibilityVoiceOverEnabled) private var voiceOver
  @AppStorage("swift.appearance") private var appearance = "system"

  var body: some View {
    let palette = HomeChromePalette(scheme, appearance: appearance)
    let shape = RoundedRectangle(cornerRadius: 16)
    let message = copy("capture.linkSaved")
    ViewThatFits(in: .horizontal) {
      HStack(spacing: 4) {
        Text(message).fixedSize()
        Spacer(minLength: 4)
        actions(palette)
      }
      VStack(alignment: .leading, spacing: 2) {
        Text(message).fixedSize(horizontal: false, vertical: true)
        actions(palette)
      }
    }
    .font(.subheadline)
    .foregroundStyle(palette.foreground)
    .padding(.leading, 14)
    .padding(.trailing, 4)
    .padding(.vertical, 4)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(palette.surface, in: shape)
    .overlay { shape.strokeBorder(palette.border).allowsHitTesting(false) }
    .shadow(color: palette.shadow.opacity(0.19), radius: 8, y: 3)
    .task(id: voiceOver) {
      if voiceOver { AccessibilityNotification.Announcement(message).post() }
      else {
        try? await Task.sleep(for: .seconds(8))
        if !Task.isCancelled { dismiss() }
      }
    }
  }

  private func actions(_ palette: HomeChromePalette) -> some View {
    HStack(spacing: 0) {
      Button(action: viewSave) {
        Text(copy("capture.viewSave")).fontWeight(.semibold)
          .fixedSize(horizontal: false, vertical: true)
          .frame(minHeight: 44)
      }
      .foregroundStyle(palette.primaryText)
      Button(action: dismiss) {
        Image(systemName: "xmark").font(.footnote.weight(.semibold))
          .frame(width: 44, height: 44)
      }
      .foregroundStyle(palette.muted)
      .accessibilityLabel(copy("common.dismiss"))
    }
    .buttonStyle(HomeChromePressStyle())
  }
}
