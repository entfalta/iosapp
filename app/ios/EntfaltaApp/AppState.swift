import SwiftUI
import UIKit

@MainActor
final class AppState: ObservableObject {
    @AppStorage("entfalta_ios_refresh_token") private var savedRefreshToken = ""
    @AppStorage("entfalta_ios_cookie_ok") var cookieAccepted = false
    @AppStorage("entfalta_ios_theme") var themeMode = "dark" // Default to dark as per Android
    @AppStorage("entfalta_ios_nav_mode") var navMode = "minimiert" // "minimiert" or "erweitert"

    @Published var session: AuthSession?
    @Published var profile: UserProfile?
    @Published var products: [Product] = []
    @Published var orders: [Order] = []
    @Published var giftVouchers: [GiftVoucher] = []
    @Published var isbns: [ISBNEntry] = []
    @Published var supportContributions: [SupportContribution] = []
    @Published var newsletterPosts: [NewsletterPost] = []
    @Published var globalStats = GlobalStats()
    @Published var cart: [CartItem] = []
    @Published var selectedSection = "Statistiken" // Default admin section
    @Published var adminMode = true // Start in admin mode for testing parity
    @Published var busy = false
    @Published var message = ""
    @Published var showCookieGate = false

    var colorScheme: ColorScheme? {
        if themeMode == "dark" { return .dark }
        if themeMode == "light" { return .light }
        return nil
    }

    var isLoggedIn: Bool { session != nil }
    var isAdmin: Bool { profile?.admin == true || adminMode }
    var cartCount: Int { cart.reduce(0) { $0 + $1.quantity } }
    var cartTotal: Double { cart.reduce(0) { $0 + Double($1.quantity) * $1.unitPrice } }

    func bootstrap() async {
        showCookieGate = !cookieAccepted
        if !savedRefreshToken.isEmpty {
            do {
                let refreshed = try await FirebaseRest.shared.refresh(refreshToken: savedRefreshToken)
                session = AuthSession(uid: refreshed.uid, email: "", idToken: refreshed.idToken, refreshToken: refreshed.refreshToken)
                savedRefreshToken = refreshed.refreshToken
                await loadProfile()
            } catch {
                savedRefreshToken = ""
            }
        }
        await refreshAll()
    }

    func refreshAll() async {
        await runBusy(nil) {
            await loadProducts()
            await loadNewsletter()
            if isAdmin {
                await loadGlobalStats()
                await loadISBNs()
                await loadGiftVouchers()
                await loadSupportContributions()
            }
            if isLoggedIn {
                await loadOrders()
            }
        }
    }

    func loadGlobalStats() async {
        do {
            if let data = try await FirebaseRest.shared.get(collection: "stats", id: "global", token: session?.idToken) {
                globalStats = GlobalStats(
                    orderCount: Int(data["orderCount"] as? Double ?? 0),
                    totalRevenue: data["totalRevenue"] as? Double ?? 0.0,
                    lastUpdateMs: data["lastUpdateMs"] as? Double ?? 0.0
                )
            }
        } catch { print("Stats Error: \(error)") }
    }

    func loadProducts() async {
        do {
            let now = Date().timeIntervalSince1970 * 1000
            products = try await FirebaseRest.shared.list(collection: "books", token: session?.idToken).compactMap { doc in
                if !isAdmin {
                    let release = doc["releaseDateMs"] as? Double ?? 0
                    if release > now { return nil }
                }
                return Product(
                    id: doc["id"] as? String ?? UUID().uuidString,
                    title: doc["title"] as? String ?? "Artikel",
                    description: doc["description"] as? String ?? "",
                    category: doc["category"] as? String ?? "",
                    itemType: doc["itemType"] as? String ?? "book",
                    cover: doc["cover"] as? String ?? "",
                    price: doc["price"] as? Double ?? 0,
                    downloadPrice: doc["downloadPrice"] as? Double ?? 0,
                    printPrice: doc["printPrice"] as? Double ?? 0,
                    stock: Int(doc["stock"] as? Double ?? 0),
                    sold: Int(doc["sold"] as? Double ?? 0),
                    active: doc["active"] as? Bool ?? true,
                    publishedAtMs: doc["publishedAtMs"] as? Double ?? 0,
                    variants: (doc["variants"] as? [[String: Any]])?.compactMap {
                        guard let name = $0["name"] as? String, let p = $0["price"] as? Double else { return nil }
                        return ProductVariant(name: name, price: p)
                    }
                )
            }
        } catch { message = error.localizedDescription }
    }

    func loadISBNs() async {
        do {
            isbns = try await FirebaseRest.shared.list(collection: "isbnEntries", token: session?.idToken).map {
                ISBNEntry(id: $0["id"] as? String ?? "", isbn: $0["isbn"] as? String ?? "", title: $0["title"] as? String ?? "", price: $0["price"] as? Double, used: $0["used"] as? Bool ?? false)
            }
        } catch { message = error.localizedDescription }
    }

    func loadGiftVouchers() async {
        do {
            giftVouchers = try await FirebaseRest.shared.list(collection: "giftVouchers", token: session?.idToken).map { doc in
                GiftVoucher(
                    id: doc["id"] as? String ?? "",
                    code: doc["code"] as? String ?? "",
                    amount: doc["amount"] as? Double ?? 0,
                    remainingAmount: doc["remainingAmount"] as? Double ?? 0,
                    status: doc["status"] as? String ?? "active"
                )
            }
        } catch { message = error.localizedDescription }
    }

    func toggleVoucherStatus(_ voucher: GiftVoucher) async {
        let next = voucher.status == "disabled" ? "active" : "disabled"
        await runBusy("Status konnte nicht geändert werden") {
            try await FirebaseRest.shared.set(collection: "giftVouchers", id: voucher.id, values: ["status": next], token: session?.idToken ?? "")
            await loadGiftVouchers()
        }
    }

    func updateVoucherBalance(_ voucher: GiftVoucher, amount: Double) async {
        await runBusy("Guthaben konnte nicht geändert werden") {
            try await FirebaseRest.shared.set(collection: "giftVouchers", id: voucher.id, values: ["remainingAmount": amount], token: session?.idToken ?? "")
            await loadGiftVouchers()
        }
    }

    func deleteVoucher(_ voucher: GiftVoucher) async {
        await runBusy("Gutschein konnte nicht gelöscht werden") {
            try await FirebaseRest.shared.delete(collection: "giftVouchers", id: voucher.id, token: session?.idToken ?? "")
            await loadGiftVouchers()
        }
    }

    func loadNewsletter() async {
        do {
            newsletterPosts = try await FirebaseRest.shared.list(collection: "newsletterPosts", token: session?.idToken).map {
                NewsletterPost(id: $0["id"] as? String ?? "", title: $0["title"] as? String ?? "", text: $0["text"] as? String ?? "", image: $0["image"] as? String ?? "", createdAtMs: $0["createdAtMs"] as? Double ?? 0, hidden: $0["hidden"] as? Bool ?? false)
            }
        } catch { message = error.localizedDescription }
    }

    func loadSupportContributions() async {
        do {
            supportContributions = try await FirebaseRest.shared.list(collection: "supportContributions", token: session?.idToken).map {
                SupportContribution(
                    id: $0["id"] as? String ?? "",
                    name: $0["name"] as? String ?? "Anonym",
                    amount: $0["amount"] as? Double ?? 0.0,
                    createdAtMs: $0["createdAtMs"] as? Double ?? 0.0
                )
            }.sorted(by: { $0.createdAtMs > $1.createdAtMs })
        } catch { print("Contributions Error: \(error)") }
    }

    func loadOrders() async {
        do {
            let docs = try await FirebaseRest.shared.list(collection: "orders", token: session?.idToken)
            orders = docs.compactMap { doc in
                let customer = doc["customer"] as? [String: Any] ?? [:]
                return Order(
                    id: doc["id"] as? String ?? UUID().uuidString,
                    orderNumber: doc["orderNumber"] as? String ?? "---",
                    customerName: customer["name"] as? String ?? "Unbekannt",
                    customerEmail: customer["email"] as? String ?? "",
                    total: doc["total"] as? Double ?? 0,
                    status: doc["fulfillmentStatus"] as? String ?? "offen",
                    fulfillmentStatus: doc["fulfillmentStatus"] as? String,
                    shipmentStatus: doc["shipmentStatus"] as? String,
                    trackingNumber: doc["trackingNumber"] as? String,
                    trackingUrl: doc["trackingUrl"] as? String,
                    shippingLabelUrl: doc["shippingLabelUrl"] as? String,
                    createdAtMs: doc["createdAtMs"] as? Double ?? 0,
                    archived: doc["archived"] as? Bool ?? false,
                    type: doc["type"] as? String,
                    giftVoucher: doc["giftVoucher"] as? [String: Any],
                    items: doc["items"] as? [[String: Any]]
                )
            }
        } catch { message = error.localizedDescription }
    }

    func isDigitalOnlyOrder(_ order: Order) -> Bool {
        if order.type == "giftVoucher" {
            let delivery = order.giftVoucher?["deliveryMethod"] as? String ?? "email"
            return delivery == "email"
        }

        guard let items = order.items, !items.isEmpty else { return false }
        for item in items {
            let fulfillment = item["fulfillment"] as? String ?? item["format"] as? String ?? ""
            if fulfillment != "download" { return false }
        }
        return true
    }

    func isPhysicalOrder(_ order: Order) -> Bool {
        !isDigitalOnlyOrder(order)
    }

    func loadProfile() async {
        guard let s = session else { return }
        do {
            if let data = try await FirebaseRest.shared.get(collection: "users", id: s.uid, token: s.idToken) {
                let addressMap = data["address"] as? [String: Any] ?? [:]
                profile = UserProfile(
                    id: s.uid,
                    name: data["name"] as? String ?? "",
                    email: data["email"] as? String ?? s.email,
                    admin: data["admin"] as? Bool ?? false,
                    support: data["support"] as? Bool ?? false,
                    profilePhotoDataUrl: data["profilePhotoDataUrl"] as? String ?? "",
                    address: Address(
                        street: addressMap["street"] as? String ?? "",
                        zip: addressMap["zip"] as? String ?? "",
                        city: addressMap["city"] as? String ?? ""
                    )
                )
            }
        } catch {
            print("Profile Load Error: \(error)")
        }
    }

    func signIn(email: String, password: String) async {
        await runBusy("Login fehlgeschlagen") {
            let auth = try await FirebaseRest.shared.signIn(email: email, password: password)
            session = auth
            savedRefreshToken = auth.refreshToken
            await loadProfile()
            await refreshAll()
        }
    }

    func register(name: String, email: String, password: String) async {
        await runBusy("Registrierung fehlgeschlagen") {
            let auth = try await FirebaseRest.shared.signUp(email: email, password: password)
            session = auth
            savedRefreshToken = auth.refreshToken
            try await FirebaseRest.shared.set(collection: "users", id: auth.uid, values: ["name": name, "email": email, "admin": false], token: auth.idToken)
            await loadProfile()
            await refreshAll()
        }
    }

    func signOut() {
        session = nil
        profile = nil
        savedRefreshToken = ""
        adminMode = false
    }

    func enterGuestGames() {
        selectedSection = "Spiele"
    }

    func addToCart(_ product: Product, format: String = "print", quantity: Int = 1, variant: String? = nil) {
        let price = variant != nil ? (product.variants?.first(where: { $0.name == variant })?.price ?? product.price) : (format == "download" ? product.downloadPrice : product.printPrice)

        if let index = cart.firstIndex(where: { $0.product.id == product.id && $0.format == format && $0.variant == variant }) {
            cart[index].quantity += quantity
        } else {
            cart.append(CartItem(product: product, format: format, quantity: quantity, unitPrice: price, variant: variant))
        }
        message = "\(quantity)x \(product.title) hinzugefügt"
    }

    private func runBusy(_ failurePrefix: String?, _ work: () async throws -> Void) async {
        busy = true
        defer { busy = false }
        do { try await work() }
        catch { message = failurePrefix != nil ? "\(failurePrefix!): \(error.localizedDescription)" : error.localizedDescription }
    }
}
