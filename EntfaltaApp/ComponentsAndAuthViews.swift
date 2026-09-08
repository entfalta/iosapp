import SwiftUI

struct ProductImage: View {
    let source: String
    var body: some View {
        Group {
            if source.hasPrefix("http://") || source.hasPrefix("https://") {
                AsyncImage(url: URL(string: source)) { phase in
                    switch phase {
                    case .success(let img):
                        img.resizable().scaledToFill()
                    case .failure:
                        placeholder
                    case .empty:
                        ProgressView()
                    @unknown default:
                        placeholder
                    }
                }
            } else if !source.isEmpty, let uiImage = UIImage(contentsOfFile: source) {
                Image(uiImage: uiImage).resizable().scaledToFill()
            } else {
                placeholder
            }
        }
    }

    private var placeholder: some View {
        ZStack {
            EntfaltaTheme.leaf.opacity(0.2)
            Text("Entfalta")
                .font(EntfaltaTheme.segoe(18, bold: true))
                .foregroundColor(EntfaltaTheme.leaf)
        }
    }
}

struct WatercolorBackground: View {
    var body: some View {
        ZStack {
            EntfaltaTheme.forestGreen
                .ignoresSafeArea()

            RadialGradient(
                colors: [
                    EntfaltaTheme.leaf.opacity(0.35),
                    EntfaltaTheme.clay.opacity(0.20),
                    Color.clear
                ],
                center: .topLeading,
                startRadius: 20,
                endRadius: 500
            )
            .ignoresSafeArea()

            RadialGradient(
                colors: [
                    EntfaltaTheme.brown.opacity(0.25),
                    EntfaltaTheme.leaf.opacity(0.15),
                    Color.clear
                ],
                center: .bottomTrailing,
                startRadius: 50,
                endRadius: 600
            )
            .ignoresSafeArea()
        }
    }
}

struct BundleLogo: View {
    var size: CGFloat = 48
    var body: some View {
        Group {
            if let imagePath = Bundle.main.path(forResource: "icon", ofType: "jpeg"),
               let uiImage = UIImage(contentsOfFile: imagePath) {
                Image(uiImage: uiImage)
                    .resizable()
                    .scaledToFill()
            } else if let imagePathPng = Bundle.main.path(forResource: "icon", ofType: "png"),
                      let uiImagePng = UIImage(contentsOfFile: imagePathPng) {
                Image(uiImage: uiImagePng)
                    .resizable()
                    .scaledToFill()
            } else {
                ZStack {
                    Circle().fill(EntfaltaTheme.leaf)
                    Text("E")
                        .font(EntfaltaTheme.segoe(size * 0.5, bold: true))
                        .foregroundColor(.white)
                }
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay(Circle().stroke(EntfaltaTheme.cardBorder, lineWidth: 1))
    }
}

struct CookieGate: View {
    @EnvironmentObject private var state: AppState
    var body: some View {
        ZStack {
            Color.black.opacity(0.7)
                .ignoresSafeArea()

            VStack(spacing: 20) {
                Text("Cookie-Einstellungen").font(EntfaltaTheme.segoe(24, bold: true))
                Text("Wir nutzen Cookies für notwendige Shop-Funktionen und zur Verbesserung deines Erlebnisses.")
                    .font(EntfaltaTheme.segoe(14))
                    .multilineTextAlignment(.center)
                    .foregroundColor(EntfaltaTheme.textMuted)

                HStack(spacing: 15) {
                    Button("Akzeptieren") {
                        state.cookieAccepted = true
                        state.showCookieGate = false
                    }.primaryButtonStyle()

                    Button("Nur Notwendige") {
                        state.cookieAccepted = true
                        state.showCookieGate = false
                    }.headerButtonStyle()
                }
            }
            .entfaltaCard(padding: 25)
            .frame(maxWidth: 420)
            .padding(20)
        }
    }
}

struct LoadingOverlay: View {
    var body: some View {
        ZStack {
            Color.black.opacity(0.4)
                .ignoresSafeArea()

            VStack(spacing: 15) {
                ProgressView()
                    .tint(.white)
                    .scaleEffect(1.3)
                Text("Laden...")
                    .font(EntfaltaTheme.segoe(15, bold: true))
                    .foregroundColor(.white)
            }
            .padding(25)
            .background(EntfaltaTheme.forestGreen.opacity(0.9))
            .clipShape(RoundedRectangle(cornerRadius: 20))
            .overlay(RoundedRectangle(cornerRadius: 20).stroke(EntfaltaTheme.cardBorder, lineWidth: 1))
        }
    }
}

struct LoginView: View {
    @EnvironmentObject private var state: AppState
    @State private var isRegister = false
    @State private var name = ""
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        ScrollView {
            VStack(spacing: 25) {
                BundleLogo(size: 80)
                    .padding(.top, 20)

                VStack(spacing: 6) {
                    Text(isRegister ? "Neues Konto erstellen" : "Willkommen bei Entfalta")
                        .font(EntfaltaTheme.segoe(26, bold: true))
                    Text(isRegister ? "Registriere dich für den Shop & App" : "Melde dich mit deinen Zugangsdaten an")
                        .font(EntfaltaTheme.segoe(14))
                        .foregroundColor(EntfaltaTheme.textMuted)
                }

                VStack(spacing: 15) {
                    if isRegister {
                        EntfaltaTextField(placeholder: "Vollständiger Name", text: $name)
                    }

                    EntfaltaTextField(placeholder: "E-Mail Adresse", text: $email, keyboardType: .emailAddress)
                    EntfaltaTextField(placeholder: "Passwort", text: $password, isSecure: true)

                    Button(isRegister ? "Registrieren" : "Anmelden") {
                        Task {
                            if isRegister {
                                await state.register(name: name, email: email, password: password)
                            } else {
                                await state.signIn(email: email, password: password)
                            }
                        }
                    }
                    .primaryButtonStyle()
                    .disabled(email.isEmpty || password.isEmpty)
                }
                .entfaltaCard()

                HStack {
                    Button(isRegister ? "Schon ein Konto? Anmelden" : "Noch kein Konto? Registrieren") {
                        withAnimation { isRegister.toggle() }
                    }
                    .font(EntfaltaTheme.segoe(13))
                    .foregroundColor(EntfaltaTheme.leaf)

                    Spacer()

                    Button("Als Gast spielen") {
                        state.enterGuestGames()
                    }
                    .font(EntfaltaTheme.segoe(13))
                    .foregroundColor(EntfaltaTheme.textMuted)
                }
                .padding(.horizontal, 10)
            }
            .frame(maxWidth: 440)
            .padding(20)
        }
    }
}

struct CustomerGiftVoucherView: View {
    @EnvironmentObject private var state: AppState
    @State private var checkCode = ""
    @State private var checkResult = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Gutscheine").font(EntfaltaTheme.segoe(32, bold: true))

            VStack(spacing: 15) {
                Text("Gutscheincode prüfen").font(EntfaltaTheme.segoe(18, bold: true))
                EntfaltaTextField(placeholder: "Gutscheincode eingeben", text: $checkCode)
                Button("Prüfen") {
                    if let found = state.giftVouchers.first(where: { $0.code.lowercased() == checkCode.trimmingCharacters(in: .whitespaces).lowercased() }) {
                        checkResult = "Guthaben: \(money(found.remainingAmount)) (\(found.status))"
                    } else {
                        checkResult = "Gutschein nicht gefunden."
                    }
                }
                .primaryButtonStyle()

                if !checkResult.isEmpty {
                    Text(checkResult)
                        .font(EntfaltaTheme.segoe(16, bold: true))
                        .foregroundColor(EntfaltaTheme.leaf)
                }
            }
            .entfaltaCard()
        }
    }
}

struct WishlistView: View {
    @EnvironmentObject private var state: AppState
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Merkliste").font(EntfaltaTheme.segoe(32, bold: true))
            Text("Hier werden deine gemerkten Artikel gespeichert.")
                .font(EntfaltaTheme.segoe(14))
                .foregroundColor(EntfaltaTheme.textMuted)
            Text("Keine Artikel auf der Merkliste.")
                .padding()
                .frame(maxWidth: .infinity, alignment: .center)
        }
    }
}

struct MyPurchasesView: View {
    @EnvironmentObject private var state: AppState
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Meine Käufe").font(EntfaltaTheme.segoe(32, bold: true))

            if state.orders.isEmpty {
                Text("Keine vergangenen Käufe vorhanden.")
                    .padding()
                    .frame(maxWidth: .infinity, alignment: .center)
            } else {
                ForEach(state.orders) { order in
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text(order.orderNumber).font(EntfaltaTheme.segoe(18, bold: true))
                            Spacer()
                            Text(money(order.total)).bold().foregroundColor(EntfaltaTheme.clay)
                        }
                        Text(dateString(order.createdAtMs)).font(.caption).foregroundColor(EntfaltaTheme.textMuted)
                        Text("Status: \(order.status)")
                            .font(.caption)
                            .foregroundColor(EntfaltaTheme.leaf)
                    }
                    .entfaltaCard()
                }
            }
        }
        .refreshable { await state.loadOrders() }
    }
}

struct OfflineEbooksView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Offline E-Books").font(EntfaltaTheme.segoe(32, bold: true))
            Text("Heruntergeladene E-Books stehen hier ohne Internetverbindung zur Verfügung.")
                .font(EntfaltaTheme.segoe(14))
                .foregroundColor(EntfaltaTheme.textMuted)
            Text("Keine Offline-E-Books vorhanden.")
                .padding()
                .frame(maxWidth: .infinity, alignment: .center)
        }
    }
}
