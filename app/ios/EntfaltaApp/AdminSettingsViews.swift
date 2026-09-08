import SwiftUI

struct UserManagementView: View {
    @EnvironmentObject private var state: AppState
    @State private var users: [[String: Any]] = []
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
                        let mail = $0["email"] as? String ?? ""
                        let name = $0["name"] as? String ?? ""
                        return search.isEmpty || mail.contains(search) || name.contains(search)
                    }.prefix(20)), id: \.id) { user in
                        VStack(alignment: .leading) {
                            Text(user["name"] as? String ?? "Unbekannt").bold()
                            Text(user["email"] as? String ?? "").font(.caption)
                            HStack {
                                Text("Admin: \( (user["admin"] as? Bool ?? false) ? "Ja" : "Nein" )")
                                Spacer()
                                Text("Support: \( (user["support"] as? Bool ?? false) ? "Ja" : "Nein" )")
                            }.font(.system(size: 10))
                        }.entfaltaCard(padding: 12)
                    }
                }
            }
        }
        .onAppear { Task { try? await loadUsers() } }
    }

    private func loadUsers() async throws {
        users = try await FirebaseRest.shared.list(collection: "users", token: state.session?.idToken)
    }
}

extension Dictionary where Key == String, Value == Any {
    var id: String { (self["id"] as? String) ?? (self["uid"] as? String) ?? (self["email"] as? String) ?? "user" }
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
