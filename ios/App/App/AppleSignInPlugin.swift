import AuthenticationServices
import Capacitor
import Foundation

/// Native "Sign in with Apple" for the web app inside the WebView. Kept in this repo (no third-party
/// plugin) on purpose: it is the login path. The page passes a SHA-256 *hashed* nonce; the raw nonce
/// never leaves JavaScript and is sent only to Supabase with the identity token
/// (src/lib/appleSignIn.ts). Nothing here stores or logs a token.
@objc(AppleSignInPlugin)
public class AppleSignInPlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    public let identifier = "AppleSignInPlugin"
    public let jsName = "AppleSignIn"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise),
    ]

    private var pending: CAPPluginCall?

    @objc func authorize(_ call: CAPPluginCall) {
        guard let hashedNonce = call.getString("nonce"), !hashedNonce.isEmpty else {
            call.reject("A nonce is required.", "missing_nonce")
            return
        }
        if pending != nil {
            call.reject("Sign in with Apple is already open.", "busy")
            return
        }
        pending = call
        DispatchQueue.main.async {
            let request = ASAuthorizationAppleIDProvider().createRequest()
            request.requestedScopes = [.email]
            request.nonce = hashedNonce
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        return bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let call = pending else { return }
        pending = nil
        guard
            let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
            let tokenData = credential.identityToken,
            let identityToken = String(data: tokenData, encoding: .utf8)
        else {
            call.reject("Apple didn't return an identity token.", "no_token")
            return
        }
        var result: [String: Any] = ["identityToken": identityToken]
        if let codeData = credential.authorizationCode, let code = String(data: codeData, encoding: .utf8) {
            result["authorizationCode"] = code
        }
        call.resolve(result)
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        guard let call = pending else { return }
        pending = nil
        let code = (error as? ASAuthorizationError)?.code
        call.reject(error.localizedDescription, code == .canceled ? "canceled" : "failed")
    }
}
