import ShelvrInbox
import ShelvrKit
import SwiftUI

@main
struct ShelvrApp: App {
  @UIApplicationDelegateAdaptor(PushDevice.self) private var pushDevice
  @State private var backend = Backend(environment: .current)
  @State private var copy = Copy()
  @Environment(\.scenePhase) private var scenePhase

  init() { Analytics.start() }

  var body: some Scene {
    WindowGroup {
      RootView()
        .environmentObject(pushDevice)
        .modifier(PushRegistrationView(device: pushDevice))
        .environment(backend)
        .environment(\.copy, copy)
        .task { await backend.start() }
        .onChange(of: scenePhase) { _, phase in
          if phase == .active || phase == .background { Analytics.active(phase == .active) }
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
