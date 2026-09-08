import SwiftUI

struct RootView: View {
    @EnvironmentObject private var state: AppState
    @State private var showProfile = false
    @State private var showCart = false

    var body: some View {
        ZStack {
            WatercolorBackground()
            VStack(spacing: 0) {
                AppHeader(showProfile: $showProfile, showCart: $showCart)

                if state.isAdmin && state.adminMode {
                    AdminNavBar()
                } else {
                    CustomerNavBar()
                }

                content
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }

            if state.showCookieGate { CookieGate() }
            if state.busy { LoadingOverlay() }
        }
        .preferredColorScheme(.dark) // Based on screenshots
        .sheet(isPresented: $showProfile) { ProfileOverlay() }
        .sheet(isPresented: $showCart) { CartSheet() }
        .alert("Entfalta", isPresented: Binding(get: { !state.message.isEmpty }, set: { if !$0 { state.message = "" } })) {
            Button("OK") { state.message = "" }
        } message: {
            Text(state.message).font(EntfaltaTheme.segoe(16))
        }
    }

    @ViewBuilder private var content: some View {
        if !state.isLoggedIn && state.selectedSection != "Spiele" {
            LoginView()
        } else {
            ScrollView {
                VStack(spacing: 20) {
                    switch state.selectedSection {
                    case "Shop": ShopView()
                    case "Spiele": GamesHomeView()
                    case "Merkliste": WishlistView()
                    case "Meine Käufe": MyPurchasesView()
                    case "Offline E-Books": OfflineEbooksView()
                    case "Statistiken": StatisticsView()
                    case "Gutscheine":
                        if state.isAdmin && state.adminMode {
                            AdminGiftVoucherView()
                        } else {
                            CustomerGiftVoucherView()
                        }
                    case "Rabattcodes": DiscountCodeView()
                    case "ISBNs": ISBNView()
                    case "Lager": LagerView()
                    case "Produkte": AdminProductsView()
                    case "Bestellungen": OrdersView()
                    case "Downloads": AdminDownloadsView()
                    case "Newsletter": NewsletterView()
                    case "Lieferung": DeliveryView()
                    case "Rücksendungen": ReturnRequestsView()
                    case "Nutzer": UserManagementView()
                    case "Auth-Mail": AuthMailView()
                    case "E-Mail": EmailConfigView()
                    case "Nicknames": NicknamesView()
                    case "Unterstützungen": AdminSupportContributionsView()
                    case "Zahlung": PaymentSettingsView()
                    case "Stripe": StripeDashboardView()
                    case "Login-Code": LoginCodeSettingsView()
                    case "Buy": QuickBuyView()
                    default: ShopView()
                    }
                }
                .padding()
            }
        }
    }
}

struct AppHeader: View {
    @EnvironmentObject private var state: AppState
    @Binding var showProfile: Bool
    @Binding var showCart: Bool

    var body: some View {
        HStack(spacing: 15) {
            VStack(alignment: .leading, spacing: -2) {
                Text("Entfalta App").font(EntfaltaTheme.segoe(28, bold: true))
                Text("Entfalta").font(EntfaltaTheme.segoe(12)).foregroundColor(EntfaltaTheme.textMuted)
            }
            Spacer()

            HStack(spacing: 10) {
                Button(state.navMode == "minimiert" ? "Minimiert" : "Erweitert") {
                    state.navMode = (state.navMode == "minimiert" ? "erweitert" : "minimiert")
                }.headerButtonStyle()

                Button("Shop") {
                    state.adminMode = false
                    state.selectedSection = "Shop"
                }.headerButtonStyle()

                Button("Buy") {
                    state.adminMode = true
                    state.selectedSection = "Buy"
                }.headerButtonStyle()
            }

            Button { showProfile = true } label: {
                BundleLogo(size: 48)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 10)
        .padding(.bottom, 15)
    }
}

extension View {
    func headerButtonStyle() -> some View {
        self
            .font(EntfaltaTheme.segoe(14, bold: true))
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(Color.white.opacity(0.1), in: Capsule())
            .overlay(Capsule().stroke(Color.white.opacity(0.2), lineWidth: 1))
            .foregroundColor(.white)
    }
}

struct AdminNavBar: View {
    @EnvironmentObject private var state: AppState

    let rows = [
        ["Statistiken", "Gutscheine", "Rabattcodes", "ISBNs", "Lager", "Produkte"],
        ["Bestellungen", "Downloads", "Newsletter", "Lieferung", "Rücksendungen", "Nutzer"],
        ["Auth-Mail", "E-Mail", "Nicknames", "Unterstützungen", "Zahlung", "Stripe", "Login-Code"]
    ]

    var body: some View {
        VStack(spacing: 12) {
            ForEach(0..<(state.navMode == "erweitert" ? rows.count : 1), id: \.self) { rowIndex in
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 25) {
                        ForEach(rows[rowIndex], id: \.self) { title in
                            Button(title) { state.selectedSection = title }
                                .font(EntfaltaTheme.segoe(14, bold: state.selectedSection == title))
                                .foregroundColor(state.selectedSection == title ? EntfaltaTheme.leaf : .white)
                                .overlay(alignment: .bottom) {
                                    if state.selectedSection == title {
                                        Rectangle().fill(EntfaltaTheme.leaf).frame(height: 1).offset(y: 4)
                                    }
                                }
                        }
                    }
                    .padding(.horizontal, 25)
                }
            }
        }
        .padding(.vertical, 18)
        .background(Color.white.opacity(0.03))
        .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 30, style: .continuous).stroke(Color.white.opacity(0.1), lineWidth: 1))
        .padding(.horizontal, 20)
    }
}

struct CustomerNavBar: View {
    @EnvironmentObject private var state: AppState
    let sections = ["Shop", "Gutscheine", "Newsletter", "Merkliste", "Meine Käufe", "Spiele", "Offline E-Books"]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 25) {
                ForEach(sections, id: \.self) { title in
                    Button(title) { state.selectedSection = title }
                        .font(EntfaltaTheme.segoe(14, bold: state.selectedSection == title))
                        .foregroundColor(state.selectedSection == title ? EntfaltaTheme.leaf : .white)
                }
            }
            .padding(.horizontal, 25)
        }
        .padding(.vertical, 18)
        .background(Color.white.opacity(0.03))
        .clipShape(Capsule())
        .padding(.horizontal, 20)
    }
}
