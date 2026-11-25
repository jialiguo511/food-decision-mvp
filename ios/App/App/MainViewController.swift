import Capacitor
import UIKit

/// The app's WebView controller. Local plugins are registered through `packageClassList`
/// (scripts/ios-sync.mjs), which Capacitor reads before the page loads.
class MainViewController: CAPBridgeViewController {
    /// The bundled UI is a static export with one HTML file per screen (today.html, saved.html…).
    /// Capacitor's default router sends every extension-less path to index.html, which would open
    /// Home's shell for /saved after a reload. Serve each screen's own file, like a static host.
    override open func router() -> Router {
        return StaticExportRouter()
    }
}

struct StaticExportRouter: Router {
    var basePath: String = ""

    func route(for path: String) -> String {
        let url = URL(fileURLWithPath: path)
        guard url.pathExtension.isEmpty else { return basePath + path }
        let trimmed = path.hasSuffix("/") ? String(path.dropLast()) : path
        if trimmed.isEmpty { return basePath + "/index.html" }
        // Only plain path segments (no "..") map to a file.
        guard !trimmed.split(separator: "/").contains("..") else { return basePath + "/index.html" }
        for candidate in [trimmed + ".html", trimmed + "/index.html"] {
            if FileManager.default.fileExists(atPath: basePath + candidate) { return basePath + candidate }
        }
        return basePath + "/index.html"
    }
}
