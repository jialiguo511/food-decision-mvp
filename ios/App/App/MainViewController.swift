import Capacitor
import UIKit

/// The app's WebView controller. Kept as the storyboard's class so project-local native code has a
/// home; local plugins themselves are registered through `packageClassList`
/// (scripts/ios-sync.mjs), which Capacitor reads before the page loads.
class MainViewController: CAPBridgeViewController {}
