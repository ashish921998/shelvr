import ShelvrInbox
import ShelvrKit
import SwiftUI

@main
struct ShelvrApp: App {
  @State private var backend = Backend(environment: .current)
  @State private var copy = Copy()
  @Environment(\.scenePhase) private var scenePhase

  var body: some Scene {
    WindowGroup {
      RootView()
        .environment(backend)
        .environment(\.copy, copy)
        .task { await backend.start() }
        .onChange(of: scenePhase) { _, phase in
          if phase == .active { Task { await backend.start() } }
        }
    }
  }
}

extension AppEnvironment {
  static let current: AppEnvironment = {
    do {
      return try AppEnvironment(infoDictionary: Bundle.main.infoDictionary ?? [:])
    } catch {
      fatalError("Shelvr build configuration is invalid: \(error)")
    }
  }()
}

extension EnvironmentValues {
  @Entry var copy = Copy()
}
