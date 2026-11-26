import ShelvrKit
import SwiftUI
import UIKit

struct PassportBookletView: View {
  let counts: (cities: Int, countries: Int)
  @State private var pages: [PassportBooklet.Page]
  @State private var index = 0
  @Environment(\.dismiss) private var dismiss
  @Environment(\.copy) private var copy
  @Environment(\.colorScheme) private var scheme
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @AppStorage("swift.appearance") private var appearance = "system"

  init(cities: [PassportCityStamp], counts: (cities: Int, countries: Int)) {
    self.counts = counts
    _pages = State(initialValue: PassportBooklet.pages(cities: cities))
  }

  var body: some View {
    let palette = HomeChromePalette(scheme, appearance: appearance)
    let page = RoundedRectangle(cornerRadius: 22, style: .continuous)
    ZStack {
      palette.background.ignoresSafeArea()
      ZStack {
        ForEach([6.0, 3.0], id: \.self) { offset in
          page.fill(palette.surface).overlay(page.stroke(palette.border, lineWidth: 1)).offset(x: offset, y: offset)
        }
        BookletPager(pages: pages, index: $index, copy: copy, reduceMotion: reduceMotion) { page, position in
          BookletPageView(page: page, position: position, total: pages.count, counts: counts, palette: palette) { step in
            index = min(max(index + step, 0), pages.count - 1)
          }
          .environment(\.copy, copy)
        }
        .id(reduceMotion)
        .clipShape(page)
        .overlay(page.stroke(palette.border, lineWidth: 1))
      }
      .shadow(color: palette.shadow.opacity(0.18), radius: 18, y: 8)
      .padding(.horizontal, 24)
      .padding(.top, 72)
      .padding(.bottom, 56)
    }
    .overlay(alignment: .topTrailing) {
      Button { dismiss() } label: {
        Image(systemName: "xmark").font(.headline).padding(12)
          .background(.thinMaterial, in: Circle())
      }
      .foregroundStyle(palette.primaryText)
      .accessibilityLabel(copy("common.close"))
      .padding()
    }
    .overlay(alignment: .bottom) {
      Text("\(index + 1) / \(pages.count)")
        .font(.footnote.monospacedDigit()).foregroundStyle(palette.muted)
        .padding(.bottom, 16).accessibilityHidden(true)
    }
  }
}

private struct BookletPageView: View {
  let page: PassportBooklet.Page
  let position: Int
  let total: Int
  let counts: (cities: Int, countries: Int)
  let palette: HomeChromePalette
  let turn: (Int) -> Void
  @Environment(\.copy) private var copy

  var body: some View {
    content
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background { ZStack { palette.surface; ContourPaper(seed: seed, palette: palette) } }
      .accessibilityValue("\(position + 1) / \(total)")
      .accessibilityScrollAction { edge in
        switch edge {
        case .trailing, .bottom: turn(1)
        default: turn(-1)
        }
      }
      .accessibilityAdjustableAction { direction in
        turn(direction == .increment ? 1 : -1)
      }
  }

  private var seed: UInt32 {
    guard case .city(let city, _) = page else { return 1000 }
    return UInt32(StampCity.catalog.firstIndex { $0.id == city.id } ?? 0) + 1
  }

  @ViewBuilder private var content: some View {
    switch page {
    case .cover:
      VStack(spacing: 24) {
        Text(copy("passport.title")).font(.largeTitle.bold()).foregroundStyle(palette.primaryText)
        HStack(spacing: 32) {
          count(counts.cities, "passport.cities")
          if counts.countries > 0 { count(counts.countries, "passport.countries") }
        }
      }
      .accessibilityElement(children: .combine)
    case .city(let city, let stamped):
      VStack(spacing: 28) {
        Text(copy("cityStamps.title").uppercased()).font(.caption.weight(.semibold)).tracking(4)
          .foregroundStyle(palette.muted)
        CityStampView(city: city, size: 200, tilt: .degrees(seed.isMultiple(of: 2) ? 5 : -5), palette: palette)
        Text(stamped, format: .dateTime.day().month(.wide).year())
          .font(.title3).foregroundStyle(palette.primaryText)
      }
      .accessibilityElement(children: .ignore)
      .accessibilityLabel("\(copy(city.labelKey)), \(stamped.formatted(date: .long, time: .omitted))")
    }
  }

  private func count(_ number: Int, _ key: String) -> some View {
    VStack {
      Text(number, format: .number).font(.largeTitle.bold()).foregroundStyle(palette.primaryText)
      Text(copy(key)).font(.caption).foregroundStyle(palette.muted)
    }
  }
}

private struct BookletPager<Page: View>: UIViewControllerRepresentable {
  let pages: [PassportBooklet.Page]
  @Binding var index: Int
  let copy: Copy
  let reduceMotion: Bool
  let page: (PassportBooklet.Page, Int) -> Page

  func makeCoordinator() -> Coordinator { Coordinator(self) }

  func makeUIViewController(context: Context) -> UIPageViewController {
    let style: UIPageViewController.TransitionStyle = reduceMotion ? .scroll : .pageCurl
    let controller = UIPageViewController(transitionStyle: style, navigationOrientation: .horizontal)
    controller.dataSource = context.coordinator
    controller.delegate = context.coordinator
    controller.isDoubleSided = false
    controller.view.backgroundColor = .clear
    context.coordinator.controllers = pages.enumerated().map { position, item in
      let host = UIHostingController(rootView: AnyView(page(item, position)))
      host.view.backgroundColor = .clear
      return host
    }
    let start = min(max(index, 0), context.coordinator.controllers.count - 1)
    context.coordinator.current = start
    controller.setViewControllers([context.coordinator.controllers[start]], direction: .forward, animated: false)
    return controller
  }

  func updateUIViewController(_ controller: UIPageViewController, context: Context) {
    let coordinator = context.coordinator
    coordinator.parent = self
    for (position, item) in pages.enumerated() where position < coordinator.controllers.count {
      coordinator.controllers[position].rootView = AnyView(page(item, position))
    }
    guard index != coordinator.current, coordinator.controllers.indices.contains(index) else { return }
    let direction: UIPageViewController.NavigationDirection = index > coordinator.current ? .forward : .reverse
    coordinator.current = index
    controller.setViewControllers([coordinator.controllers[index]], direction: direction, animated: true)
  }

  final class Coordinator: NSObject, UIPageViewControllerDataSource, UIPageViewControllerDelegate {
    var parent: BookletPager
    var controllers: [UIHostingController<AnyView>] = []
    var current = 0

    init(_ parent: BookletPager) { self.parent = parent }

    private func neighbor(of controller: UIViewController, by step: Int) -> UIViewController? {
      guard let host = controller as? UIHostingController<AnyView>, let at = controllers.firstIndex(of: host),
        controllers.indices.contains(at + step) else { return nil }
      return controllers[at + step]
    }

    func pageViewController(_ pageViewController: UIPageViewController, viewControllerBefore viewController: UIViewController) -> UIViewController? {
      neighbor(of: viewController, by: -1)
    }

    func pageViewController(_ pageViewController: UIPageViewController, viewControllerAfter viewController: UIViewController) -> UIViewController? {
      neighbor(of: viewController, by: 1)
    }

    func pageViewController(_ pageViewController: UIPageViewController, didFinishAnimating finished: Bool,
      previousViewControllers: [UIViewController], transitionCompleted completed: Bool) {
      guard completed, let host = pageViewController.viewControllers?.first as? UIHostingController<AnyView>,
        let at = controllers.firstIndex(of: host) else { return }
      current = at
      parent.index = at
    }
  }
}
