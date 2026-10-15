import Foundation
import Security

/// Minimal generic-password Keychain wrapper (login passwords, M2).
enum KeychainStore {
    private static let service = "dev.avien.pokemonshowdown"

    private static func query(for account: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: account]
    }

    static func setPassword(_ password: String, account: String) {
        deletePassword(account: account)
        var attributes = query(for: account)
        attributes[kSecValueData as String] = Data(password.utf8)
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(attributes as CFDictionary, nil)
    }

    static func password(account: String) -> String? {
        var attributes = query(for: account)
        attributes[kSecReturnData as String] = true
        attributes[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        guard SecItemCopyMatching(attributes as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return String(decoding: data, as: UTF8.self)
    }

    static func deletePassword(account: String) {
        SecItemDelete(query(for: account) as CFDictionary)
    }
}
