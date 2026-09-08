import SwiftUI

struct QuickBuyView: View {
    @State private var name = ""
    @State private var email = ""
    @State private var street = ""
    @State private var zip = ""
    @State private var city = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 25) {
            HStack {
                Text("Buy am Stand").font(EntfaltaTheme.segoe(32, bold: true))
                Spacer()
                HStack(spacing: 10) {
                    Text("Terminal: Verbunden").font(.caption).bold().padding(.horizontal, 12).padding(.vertical, 6).background(EntfaltaTheme.leaf.opacity(0.3), in: Capsule())
                    Text("Fake Daten").font(.caption).bold().padding(.horizontal, 12).padding(.vertical, 6).background(EntfaltaTheme.leaf.opacity(0.3), in: Capsule())
                }
            }

            VStack(alignment: .leading, spacing: 15) {
                Text("Lieferdaten").font(EntfaltaTheme.segoe(18, bold: true))
                VStack(spacing: 10) {
                    EntfaltaTextField(placeholder: "Name", text: $name)
                    EntfaltaTextField(placeholder: "E-Mail", text: $email)
                    EntfaltaTextField(placeholder: "Straße und Hausnummer", text: $street)
                    EntfaltaTextField(placeholder: "PLZ", text: $zip)
                    EntfaltaTextField(placeholder: "Stadt", text: $city)
                }
            }.entfaltaCard()

            VStack(alignment: .leading, spacing: 15) {
                Text("Artikel").font(EntfaltaTheme.segoe(18, bold: true))
                Text("Summe: 0,00 EUR").font(EntfaltaTheme.segoe(15, bold: true))
            }.entfaltaCard().frame(maxWidth: .infinity, alignment: .leading)

            HStack(spacing: 20) {
                Text("Zahlung öffnet Stripe Checkout.").font(.caption).foregroundColor(EntfaltaTheme.textMuted)
                Spacer()
                Button("Leeren") {}.headerButtonStyle().foregroundColor(.white).background(EntfaltaTheme.leaf.opacity(0.4), in: Capsule())
                Button("Mit Stripe zahlen") {}.headerButtonStyle().foregroundColor(.white).background(EntfaltaTheme.leaf.opacity(0.6), in: Capsule())
            }
        }
    }
}
