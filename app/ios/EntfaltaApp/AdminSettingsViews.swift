import SwiftUI

struct AdminUser: Identifiable {
    var id: String
    var name: String
    var email: String
    var admin: Bool
    var support: Bool
}

struct UserManagementView: View {
    @EnvironmentObject private var state: AppState
    @State private var users: [AdminUser] = []
    @State private var search = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Nutzerverwaltung").font(EntfaltaTheme.segoe(32, bold: true))
            EntfaltaTextField(placeholder: "UID, Name oder E-Mail suchen", text: $search)

            VStack(spacing: 12) {
                if users.isEmpty {
                    Text("Lade Nutzer...").padding()
                } else {
                    ForEach(Array(users.filter {
                        search.isEmpty || $0.email.contains(search) || $0.name.contains(search)
                    }.prefix(20))) { user in
                        VStack(alignment: .leading) {
                            Text(user.name).bold()
                            Text(user.email).font(.caption)
                            HStack {
                                Text("Admin: \( user.admin ? "Ja" : "Nein" )")
                                Spacer()
                                Text("Support: \( user.support ? "Ja" : "Nein" )")
                            }.font(.system(size: 10))
                        }.entfaltaCard(padding: 12)
                    }
                }
            }
        }
        .onAppear { Task { try? await loadUsers() } }
    }

    private func loadUsers() async throws {
        let docs = try await FirebaseRest.shared.list(collection: "users", token: state.session?.idToken)
        users = docs.map { doc in
            AdminUser(
                id: doc["id"] as? String ?? UUID().uuidString,
                name: doc["name"] as? String ?? "Unbekannt",
                email: doc["email"] as? String ?? "",
                admin: doc["admin"] as? Bool ?? false,
                support: doc["support"] as? Bool ?? false
            )
        }
    }
}

struct AuthMailView: View {
    @State private var subject = ""
    @State private var bodyText = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Auth-Mail Vorlagen").font(EntfaltaTheme.segoe(32, bold: true))
            Text("Passwort zurücksetzen").font(.headline)
            EntfaltaTextField(placeholder: "Betreff", text: $subject)
            TextEditor(text: $bodyText)
                .frame(height: 150)
                .padding(10)
                .background(Color.white.opacity(0.05))
                .cornerRadius(10)

            Button("Vorlagen speichern") {}.primaryButtonStyle()
        }
    }
}

struct EmailConfigView: View {
    @State private var host = ""
    @State private var user = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("E-Mail Konfiguration").font(EntfaltaTheme.segoe(32, bold: true))
            EntfaltaTextField(placeholder: "SMTP Host", text: $host)
            EntfaltaTextField(placeholder: "SMTP User", text: $user)
            Button("Speichern") {}.primaryButtonStyle()
        }
    }
}

struct NicknamesView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Nicknames").font(EntfaltaTheme.segoe(32, bold: true))
            Text("Hier werden Nicknames verwaltet.").padding().entfaltaCard()
        }
    }
}

struct PaymentSettingsView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Zahlung").font(EntfaltaTheme.segoe(32, bold: true))
            Text("Shop-Rabatt und Gebühren.").padding().entfaltaCard()
        }
    }
}

struct StripeDashboardView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Stripe Dashboard").font(EntfaltaTheme.segoe(32, bold: true))
            Text("Stripe-Daten werden geladen...").padding().entfaltaCard()
        }
    }
}

struct LoginCodeSettingsView: View {
    @State private var code = ""
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Login-Code").font(EntfaltaTheme.segoe(32, bold: true))
            EntfaltaTextField(placeholder: "6-stelliger Code", text: $code)
            Button("Code aktivieren") {}.primaryButtonStyle()
        }
    }
}
