import SwiftUI

struct ProfileOverlay: View {
    @EnvironmentObject private var state: AppState
    @Environment(\.dismiss) private var dismiss
    @State private var showSettings = false
    @State private var showSupport = false

    var body: some View {
        ZStack {
            WatercolorBackground()

            if showSettings {
                AdminKontoSettings(onBack: { showSettings = false })
            } else if showSupport {
                SupportOverlay(onBack: { showSupport = false })
            } else {
                VStack(spacing: 20) {
                    Text("Profil").font(EntfaltaTheme.segoe(32, bold: true))

                    VStack(alignment: .leading, spacing: 12) {
                        Text("Status: Admin").bold()
                        Text("Konto: entfalta@gmail.com")
                        Text("Name: Lara")

                        HStack {
                            Toggle("", isOn: .constant(true)).labelsHidden()
                            Text("Öffentliches Profil (für andere sichtbar)")
                        }.font(.caption)
                    }

                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 15) {
                        ProfileBtn(label: "Kontoeinstellungen", icon: "person.fill") { showSettings = true }
                        ProfileBtn(label: "Meine Käufe", icon: "bag.fill") {}
                        ProfileBtn(label: "Support", icon: "lifepreserver.fill") { showSupport = true }
                        ProfileBtn(label: "Abmelden", icon: "door.right.hand.open") { state.signOut(); dismiss() }
                    }

                    Button("Schließen") { dismiss() }.primaryButtonStyle().padding(.top, 10)
                }
                .entfaltaCard()
                .frame(maxWidth: 450)
                .padding(30)
            }
        }
    }
}

struct ProfileBtn: View {
    let label: String
    let icon: String
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Text(label)
                .font(EntfaltaTheme.segoe(13, bold: true))
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity, minHeight: 60)
                .background(EntfaltaTheme.leaf.opacity(0.3), in: Capsule())
                .overlay(Capsule().stroke(Color.white.opacity(0.1), lineWidth: 1))
                .foregroundColor(.white)
        }
    }
}

struct AdminKontoSettings: View {
    @EnvironmentObject private var state: AppState
    let onBack: () -> Void
    @State private var name = "Lara"
    @State private var email = "entfalta@gmail.com"
    @State private var street = "Richard-Wagner-Straße 10s"
    @State private var zip = "23556"
    @State private var city = "Lübeck"

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 25) {
                HStack {
                    Button(action: onBack) { Image(systemName: "chevron.left").bold() }
                    Text("Admin-Konto").font(EntfaltaTheme.segoe(32, bold: true))
                }

                VStack(alignment: .leading, spacing: 15) {
                    Text("Profil").font(EntfaltaTheme.segoe(18, bold: true))
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Profilbild").font(.headline)
                        Text("Admins nutzen in der App immer das Entfalta-Logo oben rechts.").font(.caption).foregroundColor(EntfaltaTheme.textMuted)
                        EntfaltaTextField(placeholder: "Name", text: $name)
                        EntfaltaTextField(placeholder: "Email", text: $email)
                    }
                }.entfaltaCard()

                VStack(alignment: .leading, spacing: 15) {
                    Text("Geräte-Typ & Terminal").font(EntfaltaTheme.segoe(18, bold: true))
                    Text("Dieses Gerät ist konfiguriert als: Tablet / Kasse").font(.caption)
                    Button("Geräte-Typ ändern") {}.headerButtonStyle()
                    Text("Gekoppeltes Terminal: Verbunden (3RE72FQJBUNK)").font(.caption)
                    Button("Kopplung aufheben") {}.headerButtonStyle()
                }.entfaltaCard()

                VStack(alignment: .leading, spacing: 15) {
                    Text("Adresse").font(EntfaltaTheme.segoe(18, bold: true))
                    EntfaltaTextField(placeholder: "Straße", text: $street)
                    EntfaltaTextField(placeholder: "PLZ", text: $zip)
                    EntfaltaTextField(placeholder: "Stadt", text: $city)
                }.entfaltaCard()

                Button("Speichern") {}.primaryButtonStyle().frame(maxWidth: .infinity)
            }.padding(24)
        }
    }
}

struct SupportOverlay: View {
    let onBack: () -> Void
    @State private var msg = ""
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Support kontaktieren").font(EntfaltaTheme.segoe(24, bold: true))
            Text("Beschreibe dein Problem so genau wie möglich.").font(.caption)
            TextEditor(text: $msg)
                .frame(height: 150)
                .padding(10)
                .background(Color.black.opacity(0.2), in: RoundedRectangle(cornerRadius: 15))

            HStack {
                Button("Abbrechen", action: onBack).headerButtonStyle()
                Spacer()
                Button("Absenden") {}.headerButtonStyle().background(EntfaltaTheme.leaf.opacity(0.5), in: Capsule())
            }
        }
        .entfaltaCard()
        .frame(maxWidth: 450)
        .padding(30)
    }
}
