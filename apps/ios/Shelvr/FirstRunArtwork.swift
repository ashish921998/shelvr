import ShelvrKit
import SwiftUI

struct FirstRunPicture: View {
  let name: String
  let ext: String

  var body: some View {
    if let url = Bundle.main.url(forResource: name, withExtension: ext),
      let image = UIImage(contentsOfFile: url.path) {
      Image(uiImage: image).resizable()
    }
  }
}

struct LisbonSignInHero: View {
  let palette: HomeChromePalette
  @Environment(\.copy) private var copy
  @Environment(\.accessibilityReduceMotion) private var reduced
  @State private var drawn = false

  var body: some View {
    GeometryReader { bounds in
      VStack(alignment: .leading, spacing: 5) {
        Capsule().fill(palette.foreground).frame(width: 57, height: 13)
          .frame(maxWidth: .infinity).padding(.bottom, 8)
        Text(copy("onboarding.sceneLisbon")).font(.custom("Satoshi-Bold", size: 22))
        Text(copy("onboarding.sceneSpaceMeta")).font(.caption2).foregroundStyle(palette.muted)
        route.frame(height: 112)
        HStack(spacing: 4) {
          ForEach(["library-city-lisbon", "city-lisbon-food", "library-city-prague"], id: \.self) { photo in
            FirstRunPicture(name: photo, ext: "jpg").scaledToFill().frame(width: 31, height: 34)
              .clipShape(.rect(cornerRadius: 6))
          }
          Text(copy("signInScene.fromReels")).font(.caption2).foregroundStyle(palette.muted)
        }
        Text(copy("signInScene.dateTitle")).font(.custom("Satoshi-Bold", size: 15))
        ForEach(["Miradouro", "TimeOut", "Pasteis"], id: \.self) { key in
          Text(copy("onboarding.scene" + key)).font(.caption)
        }
      }
      .padding(13).frame(width: min(254, bounds.size.width))
      .background(palette.surface, in: .rect(cornerRadius: 31))
      .overlay { RoundedRectangle(cornerRadius: 31).strokeBorder(palette.foreground, lineWidth: 6) }
      .frame(maxWidth: .infinity)
    }
    .clipped()
    .mask(LinearGradient(stops: [.init(color: .black, location: 0), .init(color: .black, location: 0.79),
      .init(color: .clear, location: 1)], startPoint: .top, endPoint: .bottom))
    .accessibilityHidden(true)
    .onAppear { withAnimation(reduced ? nil : .easeInOut(duration: 1.4)) { drawn = true } }
  }

  private var route: some View {
    GeometryReader { proxy in
      let w = proxy.size.width, h = proxy.size.height
      let pins = [CGPoint(x: 0.24*w, y: 0.32*h), CGPoint(x: 0.62*w, y: 0.22*h), CGPoint(x: 0.70*w, y: 0.68*h)]
      ZStack {
        palette.border.opacity(0.6)
        Canvas { ctx, size in
          for block in [CGRect(x: 0.06,y: 0.08,width: 0.26,height: 0.18), CGRect(x: 0.4,y: 0.06,width: 0.32,height: 0.14),
            CGRect(x: 0.08,y: 0.4,width: 0.2,height: 0.24), CGRect(x: 0.5,y: 0.36,width: 0.4,height: 0.18),
            CGRect(x: 0.32,y: 0.52,width: 0.14,height: 0.16)] {
            ctx.fill(Path(roundedRect: block.applying(.init(scaleX: size.width, y: size.height)), cornerRadius: 5), with: .color(palette.frame))
          }
          var river = Path()
          river.move(to: CGPoint(x: -8, y: 0.68*h))
          river.addQuadCurve(to: CGPoint(x: w+8,y: 0.84*h), control: CGPoint(x: 0.5*w,y: h))
          ctx.stroke(river, with: .color(Color.cyan.opacity(0.24)), lineWidth: 12)
        }
        Path { p in
          p.move(to: pins[0]); p.addQuadCurve(to: pins[1], control: CGPoint(x: w*0.42,y: h*0.09))
          p.addQuadCurve(to: pins[2], control: CGPoint(x: w*0.79,y: h*0.42))
        }.trim(from: 0, to: drawn || reduced ? 1 : 0).stroke(palette.primaryText, lineWidth: 2)
        ForEach(pins.indices, id: \.self) { i in
          Text(String(i+1)).font(.caption2.bold()).foregroundStyle(palette.onPrimary).frame(width: 18,height: 18)
            .background(palette.primary, in: Circle()).position(pins[i])
        }
      }.clipShape(.rect(cornerRadius: 10))
    }
  }
}

struct OnboardingOpener: View {
  let palette: HomeChromePalette
  @Environment(\.copy) private var copy
  @Environment(\.accessibilityReduceMotion) private var reduced
  @Environment(\.accessibilityVoiceOverEnabled) private var voiceOver
  @Environment(\.dynamicTypeSize) private var type
  @Environment(\.scenePhase) private var phase
  @State private var position: Int? = 0
  private var page: Int { ((position ?? 0) + photos.count) % photos.count }
  @State private var interacted = false
  private let photos = ["your-cities", "san-francisco-places", "san-francisco-date", "san-francisco-trip"]
  private var captions: [String] {
    [copy("opener.yourCities"), copy("onboarding.openerFileTitle") + " " + copy("onboarding.openerFileAccent"),
      copy("plan.dateNight"), copy("trip.yourTripNoCity")]
  }

  var body: some View {
    VStack(spacing: 9) {
      HStack(spacing: 6) {
        FirstRunPicture(name: "first-run-icon", ext: "png").frame(width: 25, height: 25).clipShape(.rect(cornerRadius: 6))
        Text("shelvr").font(.custom("CrimsonProRoman-Regular", size: 34, relativeTo: .largeTitle))
      }.foregroundStyle(palette.primaryText).accessibilityElement(children: .combine).accessibilityAddTraits(.isHeader)
      Text(copy("opener.tagline")).font(.custom("Satoshi-Regular", size: 15, relativeTo: .subheadline))
        .foregroundStyle(palette.muted).multilineTextAlignment(.center).frame(maxWidth: 285)
      GeometryReader { bounds in
        let stride = min(bounds.size.width * 0.68, bounds.size.height * 0.49)
        ScrollView(.horizontal) {
          HStack(spacing: 0) {
            ForEach(-1...photos.count, id: \.self) { slot in
              let i = (slot + photos.count) % photos.count
              FirstRunPicture(name: photos[i], ext: "webp").scaledToFit()
                .clipShape(.rect(cornerRadius: 22))
                .overlay { RoundedRectangle(cornerRadius: 22).strokeBorder(palette.foreground, lineWidth: 3) }
                .aspectRatio(640/1391.0, contentMode: .fit).padding(4)
                .frame(width: stride, height: bounds.size.height)
                .scrollTransition(.interactive, axis: .horizontal) { card, phase in
                  card.opacity(1 - abs(phase.value) * 0.72)
                    .rotation3DEffect(.degrees(phase.value * 16), axis: (x: 0, y: 1, z: 0))
                }
                .id(slot)
            }
          }.scrollTargetLayout()
        }.scrollIndicators(.hidden)
          .contentMargins(.horizontal, (bounds.size.width - stride)/2, for: .scrollContent)
          .scrollTargetBehavior(.viewAligned(limitBehavior: .alwaysByOne)).scrollPosition(id: $position, anchor: .center)
          .onScrollPhaseChange { _, next in
            if next == .idle, let position, !photos.indices.contains(position) { self.position = page }
          }
          .simultaneousGesture(DragGesture(minimumDistance: 8).onChanged { _ in interacted = true })
      }.containerRelativeFrame(.vertical) { length, _ in min(max(305, length * 0.67), 520) }
        .padding(.horizontal, -24)
        .accessibilityElement(children: .ignore).accessibilityLabel(captions[page])
        .accessibilityValue(page == 0 ? "" : copy(["", "onboarding.openerFileBody", "opener.datePreviewDescription", "opener.tripPreviewDescription"][page]))
        .accessibilityAdjustableAction { direction in
          interacted = true
          switch direction {
          case .increment: position = (page + 1) % photos.count
          case .decrement: position = (page + photos.count - 1) % photos.count
          @unknown default: break
          }
        }
      Text(captions[page]).font(.custom("Satoshi-Bold", size: 23, relativeTo: .title2)).multilineTextAlignment(.center)
      HStack(spacing: 0) {
        ForEach(photos.indices, id: \.self) { i in
          Button { interacted = true; position = i } label: {
            Capsule().fill(i == page ? palette.foreground : palette.border).frame(width: i == page ? 18 : 7, height: 6)
              .frame(width: 44, height: 44).contentShape(Rectangle())
          }.accessibilityLabel(captions[i]).accessibilityAddTraits(i == page ? .isSelected : [])
        }
      }
    }.frame(maxWidth: .infinity)
    .task(id: phase == .active && !interacted && !reduced && !voiceOver && !type.isAccessibilitySize) {
      guard phase == .active && !interacted && !reduced && !voiceOver && !type.isAccessibilitySize else { return }
      while !Task.isCancelled {
        do { try await Task.sleep(for: .seconds(3)) } catch { return }
        withAnimation(.easeInOut(duration: 0.3)) { position = page + 1 }
      }
    }
  }
}

struct FirstRunPillStyle: ButtonStyle {
  @Environment(\.isEnabled) private var enabled

  func makeBody(configuration: Configuration) -> some View {
    configuration.label.opacity(enabled ? (configuration.isPressed ? 0.78 : 1) : 0.4)
  }
}

struct PracticeShareGuide: View {
  let complete: () -> Void
  @Environment(\.copy) private var copy
  @State private var stage = 0

  var body: some View {
    VStack(alignment: .leading, spacing: 18) {
      Text(copy(["aha.coachShare", "aha.coachMore", "aha.coachShelvr"][stage]))
        .font(.custom("Satoshi-Bold", size: 24, relativeTo: .title2)).accessibilityAddTraits(.isHeader)
      if stage == 2 {
        Text(copy("aha.sheetApps")).font(.title2.weight(.bold))
        Button(action: complete) {
          HStack {
            FirstRunPicture(name: "first-run-icon", ext: "png").frame(width: 40, height: 40).clipShape(.rect(cornerRadius: 10))
            Text("Shelvr").font(.headline)
          }.frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
        }.buttonStyle(.plain)
      } else {
        let items = stage == 0 ? [("aha.sheetStory","plus"), ("aha.shareMessages","message"), ("aha.sheetShareTo","square.and.arrow.up")] :
          [("aha.sheetMail","envelope"), ("aha.sheetNotes","note.text"), ("aha.sheetMore","ellipsis")]
        HStack(alignment: .top) {
          ForEach(items.indices, id: \.self) { i in
            let tile = VStack(spacing: 6) {
              Image(systemName: items[i].1).font(.title2).frame(width: 50, height: 50)
                .background(.thinMaterial, in: .rect(cornerRadius: 12))
              Text(copy(items[i].0)).font(.caption)
            }.frame(maxWidth: .infinity)
            if i == 2 { Button { stage += 1 } label: { tile }.buttonStyle(.plain) }
            else { tile.opacity(0.6).accessibilityHidden(true) }
          }
        }
      }
    }.padding(24).frame(maxWidth: .infinity, alignment: .leading)
      .presentationDetents([.medium, .large]).presentationDragIndicator(.visible)
  }
}
