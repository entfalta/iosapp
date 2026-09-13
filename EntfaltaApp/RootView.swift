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
        if !state.isLoggedIn {
            LoginView()
        } else {
            ScrollView {
                VStack(spacing: 20) {
                    switch state.selectedSection {
                    case "Shop": ShopView()
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
                if state.isAdmin {
                    Button(state.navMode == "minimiert" ? "Minimiert" : "Erweitert") {
                        state.navMode = (state.navMode == "minimiert" ? "erweitert" : "minimiert")
                    }.headerButtonStyle()

                    if state.selectedSection == "Shop" {
                        Button("Admin") {
                            state.adminMode = true
                            state.selectedSection = "Statistiken"
                        }.headerButtonStyle()
                    } else {
                        Button("Shop") {
                            state.selectedSection = "Shop"
                        }.headerButtonStyle()
                    }
                }

                Button {
                    showCart = true
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "cart.fill")
                        if state.cartCount > 0 {
                            Text("\(state.cartCount)")
                                .font(EntfaltaTheme.segoe(12, bold: true))
                        }
                    }
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
            .padding(.vertical, 9)
            .background(
                Capsule()
                    .fill(.thinMaterial)
                    .overlay(Capsule().fill(Color.white.opacity(0.08)))
            )
            .overlay(Capsule().stroke(EntfaltaTheme.glassBorderGradient, lineWidth: 1))
            .foregroundColor(.white)
            .shadow(color: Color.black.opacity(0.15), radius: 4, x: 0, y: 2)
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
                    HStack(spacing: 22) {
                        ForEach(rows[rowIndex], id: \.self) { title in
                            Button(title) { state.selectedSection = title }
                                .font(EntfaltaTheme.segoe(14, bold: state.selectedSection == title))
                                .padding(.horizontal, 14)
                                .padding(.vertical, 8)
                                .background(
                                    state.selectedSection == title
                                    ? EntfaltaTheme.leaf.opacity(0.35)
                                    : Color.clear,
                                    in: Capsule()
                                )
                                .overlay(
                                    Capsule().stroke(
                                        state.selectedSection == title ? EntfaltaTheme.glassBorderGradient : LinearGradient(colors: [.clear], startPoint: .top, endPoint: .bottom),
                                        lineWidth: 1
                                    )
                                )
                                .foregroundColor(state.selectedSection == title ? .white : EntfaltaTheme.textMuted)
                        }
                    }
                    .padding(.horizontal, 20)
                }
            }
        }
        .padding(.vertical, 14)
        .background(
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous).fill(Color.white.opacity(0.04)))
        )
        .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous).stroke(EntfaltaTheme.glassBorderGradient, lineWidth: 1.2))
        .padding(.horizontal, 16)
    }
}

struct CustomerNavBar: View {
    @EnvironmentObject private var state: AppState
    let sections = ["Shop", "Gutscheine", "Newsletter", "Merkliste", "Meine Käufe", "Offline E-Books"]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 22) {
                ForEach(sections, id: \.self) { title in
                    Button(title) { state.selectedSection = title }
                        .font(EntfaltaTheme.segoe(14, bold: state.selectedSection == title))
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(
                            state.selectedSection == title
                            ? EntfaltaTheme.leaf.opacity(0.35)
                            : Color.clear,
                            in: Capsule()
                        )
                        .foregroundColor(state.selectedSection == title ? .white : EntfaltaTheme.textMuted)
                }
            }
            .padding(.horizontal, 20)
        }
        .padding(.vertical, 14)
        .background(
            Capsule()
                .fill(.ultraThinMaterial)
                .overlay(Capsule().fill(Color.white.opacity(0.04)))
        )
        .clipShape(Capsule())
        .overlay(Capsule().stroke(EntfaltaTheme.glassBorderGradient, lineWidth: 1.2))
        .padding(.horizontal, 16)
    }
}
