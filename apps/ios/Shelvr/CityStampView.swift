import ShelvrKit
import SwiftUI

private struct StampOutline: Shape {
  let shape: StampShape

  func path(in rect: CGRect) -> Path {
    let k = rect.width / 100
    func point(_ x: Double, _ y: Double) -> CGPoint { CGPoint(x: rect.minX + x * k, y: rect.minY + y * k) }
    var path = Path()
    switch shape {
    case .circle:
      path.addEllipse(in: CGRect(origin: point(5, 5), size: CGSize(width: 90 * k, height: 90 * k)))
    case .octagon:
      path.addLines([point(30, 6), point(70, 6), point(94, 30), point(94, 70), point(70, 94), point(30, 94),
        point(6, 70), point(6, 30)])
      path.closeSubpath()
    case .arch:
      path.move(to: point(12, 94))
      path.addLine(to: point(12, 50))
      path.addArc(center: point(50, 50), radius: 38 * k, startAngle: .degrees(180), endAngle: .degrees(0), clockwise: false)
      path.addLine(to: point(88, 94))
      path.closeSubpath()
    case .shield:
      path.move(to: point(12, 8))
      path.addLine(to: point(88, 8))
      path.addLine(to: point(88, 52))
      path.addCurve(to: point(50, 96), control1: point(88, 76), control2: point(68, 90))
      path.addCurve(to: point(12, 52), control1: point(32, 90), control2: point(12, 76))
      path.closeSubpath()
    }
    return path
  }
}

private extension StampShape {
  var sideInset: Double {
    switch self {
    case .circle: 0.16
    case .octagon: 0.14
    case .arch, .shield: 0.22
    }
  }
}

struct CityStampView<Art: View>: View {
  let city: StampCity
  var size: CGFloat = 112
  var tilt: Angle = .degrees(-6)
  let palette: HomeChromePalette
  @ViewBuilder var art: Art
  @Environment(\.copy) private var copy

  var body: some View {
    let look = city.look
    let ink = palette.stampInks[look.ink % palette.stampInks.count]
    let outline = StampOutline(shape: look.shape)
    ZStack {
      outline.fill(ink.opacity(0.08))
      outline.stroke(ink, style: StrokeStyle(lineWidth: 3 * size / 100, lineJoin: .round))
      outline.stroke(ink, style: StrokeStyle(lineWidth: 1.6 * size / 100, lineJoin: .round,
        dash: look.shape == .circle ? [3 * size / 100, 2.5 * size / 100] : []))
        .scaleEffect(0.84)
      VStack(spacing: 2) {
        art.frame(width: size * 0.3, height: size * 0.3)
        Text(copy(city.labelKey).uppercased())
          .font(.system(size: size * 0.12, weight: .bold)).tracking(1)
          .lineLimit(2).minimumScaleFactor(0.5).multilineTextAlignment(.center)
        if size >= 72 { Text(city.country).font(.system(size: size * 0.09)).tracking(2) }
      }
      .foregroundStyle(ink)
      .dynamicTypeSize(...DynamicTypeSize.large)
      .padding(.horizontal, size * look.shape.sideInset)
      .padding(.top, size * 0.16)
      .padding(.bottom, size * (look.shape == .shield ? 0.24 : 0.16))
    }
    .frame(width: size, height: size)
    .rotationEffect(tilt)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(copy(city.labelKey))
  }
}

extension CityStampView where Art == EmptyView {
  init(city: StampCity, size: CGFloat = 112, tilt: Angle = .degrees(-6), palette: HomeChromePalette) {
    self.init(city: city, size: size, tilt: tilt, palette: palette) { EmptyView() }
  }
}

struct ContourPaper: View {
  let seed: UInt32
  let palette: HomeChromePalette

  var body: some View {
    Canvas { context, canvasSize in
      let scale = CGSize(width: canvasSize.width / 100, height: canvasSize.height / 100)
      for loop in ContourLoops.loops(seed: seed) {
        var path = Path()
        for (index, point) in loop.enumerated() {
          let mapped = CGPoint(x: point.x * scale.width, y: point.y * scale.height)
          if index == 0 { path.move(to: mapped) } else { path.addLine(to: mapped) }
        }
        context.stroke(path, with: .color(palette.primaryText.opacity(0.12)), lineWidth: 1)
      }
    }
    .accessibilityHidden(true)
  }
}
