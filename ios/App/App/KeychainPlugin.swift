import Capacitor
import Foundation
import Security

/// Small Keychain store for the bundled app's Supabase session (src/ios/supabaseClient.ts). Items are
/// generic passwords for this app only, readable after the first unlock, never synced or backed up
/// to another device (…ThisDeviceOnly). Values are never logged.
@objc(KeychainPlugin)
public class KeychainPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "KeychainPlugin"
    public let jsName = "Keychain"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
    ]

    private var service: String { Bundle.main.bundleIdentifier ?? "app" }

    private func baseQuery(_ key: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: key]
    }

    private func validKey(_ call: CAPPluginCall) -> String? {
        guard let key = call.getString("key"), !key.isEmpty, key.count <= 200 else {
            call.reject("A key is required.", "bad_key")
            return nil
        }
        return key
    }

    @objc func get(_ call: CAPPluginCall) {
        guard let key = validKey(call) else { return }
        var query = baseQuery(key)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecSuccess, let data = item as? Data, let value = String(data: data, encoding: .utf8) {
            call.resolve(["value": value])
        } else if status == errSecItemNotFound {
            call.resolve(["value": NSNull()])
        } else {
            call.reject("Keychain read failed.", "keychain_\(status)")
        }
    }

    @objc func set(_ call: CAPPluginCall) {
        guard let key = validKey(call) else { return }
        guard let value = call.getString("value"), let data = value.data(using: .utf8) else {
            call.reject("A value is required.", "bad_value")
            return
        }
        let query = baseQuery(key)
        let update: [String: Any] = [kSecValueData as String: data, kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        var status = SecItemUpdate(query as CFDictionary, update as CFDictionary)
        if status == errSecItemNotFound {
            var add = query
            add.merge(update) { _, new in new }
            status = SecItemAdd(add as CFDictionary, nil)
        }
        status == errSecSuccess ? call.resolve() : call.reject("Keychain write failed.", "keychain_\(status)")
    }

    @objc func remove(_ call: CAPPluginCall) {
        guard let key = validKey(call) else { return }
        let status = SecItemDelete(baseQuery(key) as CFDictionary)
        status == errSecSuccess || status == errSecItemNotFound ? call.resolve() : call.reject("Keychain delete failed.", "keychain_\(status)")
    }
}
