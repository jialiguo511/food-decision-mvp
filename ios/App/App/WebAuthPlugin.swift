import AuthenticationServices
import Capacitor
import Foundation

/// Opens one of OUR https pages in Apple's authentication sheet (ASWebAuthenticationSession) and
/// returns the URL it finishes on — used by the sign-in check bridge (src/lib/appCheck.ts). The
/// session is ephemeral (no shared cookies, no "wants to use … to sign in" prompt). Only https URLs
/// on the allowed host and the app's own callback scheme are accepted. Nothing is logged.
@objc(WebAuthPlugin)
public class WebAuthPlugin: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "WebAuthPlugin"
    public let jsName = "WebAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
    ]

    private static let callbackScheme = "whattoeat-auth"
    private var session: ASWebAuthenticationSession?

    @objc func start(_ call: CAPPluginCall) {
        guard let raw = call.getString("url"), let url = URL(string: raw), url.scheme == "https", let host = url.host else {
            call.reject("An https URL is required.", "bad_url")
            return
        }
        // The page must be on the host the app was built against.
        let allowed = (call.getString("allowedHost") ?? "")
        guard !allowed.isEmpty, host == allowed else {
            call.reject("That host isn't allowed.", "bad_host")
            return
        }
        if session != nil {
            call.reject("A check is already open.", "busy")
            return
        }
        DispatchQueue.main.async {
            let s = ASWebAuthenticationSession(url: url, callbackURLScheme: WebAuthPlugin.callbackScheme) { [weak self] callback, error in
                self?.session = nil
                if let callback = callback {
                    call.resolve(["url": callback.absoluteString])
                } else if let error = error as? ASWebAuthenticationSessionError, error.code == .canceledLogin {
                    call.reject("Closed.", "canceled")
                } else {
                    call.reject("The check didn't finish.", "failed")
                }
            }
            s.presentationContextProvider = self
            s.prefersEphemeralWebBrowserSession = true
            self.session = s
            if !s.start() {
                self.session = nil
                call.reject("The check couldn't open.", "failed")
            }
        }
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        return bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }
}
