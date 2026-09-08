import SwiftUI
import UIKit
#if canImport(FirebaseCore)
import FirebaseCore
#endif

final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        #if canImport(FirebaseCore)
        FirebaseApp.configure()
        #endif
        return true
    }
}

@main
struct EntfaltaApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var delegate
    @StateObject private var state = AppState()

    init() {
        EntfaltaTheme.registerFonts()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(state)
                .preferredColorScheme(state.colorScheme)
                .task { await state.bootstrap() }
        }
    }
}
