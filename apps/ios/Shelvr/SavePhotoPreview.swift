import ShelvrKit
import SwiftUI

struct SavePhotoPreview: View {
  let url: URL
  let title: String
  @Environment(\.copy) private var copy
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Namespace private var transition
  @State private var expanded = false

  var body: some View {
    AsyncImage(url: url) { phase in
      switch phase {
      case let .success(image):
        Button { present(true) } label: {
          Rectangle().fill(.clear).aspectRatio(1.8, contentMode: .fit)
            .overlay { image.resizable().scaledToFill().accessibilityHidden(true) }
            .clipShape(RoundedRectangle(cornerRadius: 18))
            .overlay(alignment: .bottomTrailing) {
              Image(systemName: "arrow.up.left.and.arrow.down.right")
                .font(.caption.bold()).foregroundStyle(.white)
                .padding(8).background(.black.opacity(0.65), in: Circle()).padding(10)
            }
            .contentShape(RoundedRectangle(cornerRadius: 18))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(copy("item.savedPhoto") + ", " + title))
        .matchedTransitionSource(id: url, in: transition)
        .fullScreenCover(isPresented: $expanded) {
          if reduceMotion { viewer(image) }
          else { viewer(image).navigationTransition(.zoom(sourceID: url, in: transition)) }
        }
      case .empty:
        RoundedRectangle(cornerRadius: 18).fill(Color.secondary.opacity(0.10))
          .aspectRatio(1.8, contentMode: .fit).overlay { ProgressView() }
      default:
        EmptyView()
      }
    }
  }

  private func viewer(_ image: Image) -> some View {
    ZStack(alignment: .topTrailing) {
      Color.black.ignoresSafeArea()
      image.resizable().scaledToFit().frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityLabel(title)
      Button { present(false) } label: {
        Image(systemName: "xmark").font(.headline)
          .frame(width: 44, height: 44).background(.ultraThinMaterial, in: Circle())
      }.accessibilityLabel(copy("common.close")).padding()
    }.preferredColorScheme(.dark)
  }

  private func present(_ value: Bool) {
    var transaction = Transaction()
    transaction.disablesAnimations = reduceMotion
    withTransaction(transaction) { expanded = value }
  }
}
