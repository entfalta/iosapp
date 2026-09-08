import SwiftUI

struct StatisticsView: View {
    @EnvironmentObject private var state: AppState
    var body: some View {
        VStack(alignment: .leading, spacing: 25) {
            Text("Live-Statistiken").font(EntfaltaTheme.segoe(32, bold: true))

            VStack(spacing: 15) {
                HStack(spacing: 15) {
                    statTile(label: "Bestellungen", value: "\(state.globalStats.orderCount)", hint: "historisch gesamt")
                    statTile(label: "Offen", value: "\(state.orders.filter { !$0.archived }.count)", hint: "nicht archiviert")
                    statTile(label: "Einnahmen", value: money(state.globalStats.totalRevenue), hint: "historisch gesamt")
                }
                HStack(spacing: 15) {
                    statTile(label: "Heute", value: "0", hint: "verkauft")
                    statTile(label: "31 Tage", value: "0", hint: "verkauft")
                    statTile(label: "Live App", value: "1", hint: "gerade in der App")
                }
                statTile(label: "Live Web", value: "0", hint: "gerade auf der Webseite")
            }

            Text("Archiv: \(state.orders.filter{$0.archived}.count) | Artikel: \(state.products.count) | Verkauft gesamt: 0 | Download/Print: 0/0")
                .font(EntfaltaTheme.segoe(13))
                .foregroundStyle(EntfaltaTheme.textMuted)
                .frame(maxWidth: .infinity, alignment: .center)

            VStack(alignment: .leading, spacing: 15) {
                Text("Meistverkauft").font(EntfaltaTheme.segoe(18, bold: true))
                HStack(spacing: 15) {
                    RoundedRectangle(cornerRadius: 15).fill(EntfaltaTheme.leaf.opacity(0.2))
                        .frame(width: 80, height: 100)
                        .overlay(Text("Entfalta").font(.caption2).foregroundStyle(EntfaltaTheme.leaf))
                    VStack(alignment: .leading) {
                        Text("Titel: Noch nichts verkauft").bold()
                        Text("Verkauft: 0").font(.caption)
                    }
                }.entfaltaCard(padding: 15)
            }
        }
    }

    private func statTile(label: String, value: String, hint: String) -> some View {
        VStack(spacing: 4) {
            Text(label).font(EntfaltaTheme.segoe(12)).foregroundStyle(EntfaltaTheme.textMuted)
            Text(value).font(EntfaltaTheme.segoe(24, bold: true)).foregroundStyle(.white)
            Text(hint).font(EntfaltaTheme.segoe(10)).foregroundStyle(EntfaltaTheme.textMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 15)
        .background(LinearGradient(colors: [Color.white.opacity(0.05), Color.white.opacity(0.02)], startPoint: .top, endPoint: .bottom))
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(Color.white.opacity(0.1), lineWidth: 1))
    }
}

struct AdminSupportContributionsView: View {
    @EnvironmentObject private var state: AppState

    var body: some View {
        VStack(alignment: .leading, spacing: 25) {
            Text("Unterstützungen").font(EntfaltaTheme.segoe(32, bold: true))

            VStack(spacing: 12) {
                if state.supportContributions.isEmpty {
                    Text("Noch keine Unterstützungen vorhanden.").padding().frame(maxWidth: .infinity, alignment: .center)
                } else {
                    ForEach(state.supportContributions) { contribution in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(contribution.name)
                                .font(EntfaltaTheme.segoe(18, bold: true))
                                .foregroundStyle(EntfaltaTheme.leaf)

                            HStack {
                                Text("Betrag: \(money(contribution.amount))")
                                Spacer()
                                Text(formatDate(contribution.createdAtMs))
                                    .font(.caption)
                                    .foregroundStyle(EntfaltaTheme.textMuted)
                            }
                        }.entfaltaCard(padding: 15)
                    }
                }
            }
        }
    }

    private func formatDate(_ ms: Double) -> String {
        let date = Date(timeIntervalSince1970: ms / 1000)
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm dd.MM.yyyy"
        return formatter.string(from: date)
    }
}

struct AdminGiftVoucherView: View {
    @EnvironmentObject private var state: AppState
    @State private var amount = ""
    @State private var code = ""
    @State private var editingVoucher: GiftVoucher?
    @State private var newBalance = ""
    @State private var showBalanceAlert = false

    var body: some View {
        VStack(alignment: .leading, spacing: 25) {
            Text("Gutscheine").font(EntfaltaTheme.segoe(32, bold: true))

            VStack(spacing: 15) {
                EntfaltaTextField(placeholder: "Code leer lassen = automatisch", text: $code)
                EntfaltaTextField(placeholder: "Betrag in EUR", text: $amount)

                HStack {
                    Toggle("", isOn: .constant(false)).labelsHidden()
                    Text("Nur Admins dürfen diesen Code einlösen").font(EntfaltaTheme.segoe(14))
                }
                HStack {
                    Toggle("", isOn: .constant(false)).labelsHidden()
                    Text("Für Admins unendlich nutzbar").font(EntfaltaTheme.segoe(14))
                }

                Button("Gutschein erstellen") {}.primaryButtonStyle().frame(maxWidth: .infinity)
            }.entfaltaCard()

            HStack(spacing: 0) {
                tab("Alle", active: true)
                tab("Aktiv", active: false)
                tab("Leer", active: false)
            }
            .background(Color.white.opacity(0.05), in: Capsule())
            .padding(.horizontal)

            VStack(spacing: 12) {
                if state.giftVouchers.isEmpty {
                    Text("Noch keine Gutscheine vorhanden.").padding().frame(maxWidth: .infinity, alignment: .center)
                } else {
                    ForEach(state.giftVouchers) { voucher in
                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                VStack(alignment: .leading) {
                                    Text(voucher.code).bold()
                                    Text("\(money(voucher.remainingAmount)) / \(money(voucher.amount))").font(.caption)
                                    Text("Status: \(voucher.status)").font(.system(size: 10)).foregroundStyle(voucher.status == "disabled" ? .red : .green)
                                }
                                Spacer()
                                Button(voucher.status == "disabled" ? "Aktivieren" : "Sperren") {
                                    Task { await state.toggleVoucherStatus(voucher) }
                                }.font(.caption).padding(6).background(Color.white.opacity(0.1), in: RoundedRectangle(cornerRadius: 8))
                            }
                            HStack {
                                Button("Guthaben") {
                                    editingVoucher = voucher
                                    newBalance = String(voucher.remainingAmount)
                                    showBalanceAlert = true
                                }.font(.caption).padding(6).background(Color.white.opacity(0.1), in: RoundedRectangle(cornerRadius: 8))

                                Spacer()

                                Button("Löschen") {
                                    Task { await state.deleteVoucher(voucher) }
                                }.font(.caption).foregroundStyle(.red).padding(6).background(Color.white.opacity(0.1), in: RoundedRectangle(cornerRadius: 8))
                            }
                        }.entfaltaCard(padding: 12)
                    }
                }
            }
        }
        .alert("Guthaben bearbeiten", isPresented: $showBalanceAlert) {
            TextField("Neuer Betrag", text: $newBalance).keyboardType(.decimalPad)
            Button("Speichern") {
                if let v = editingVoucher, let val = Double(newBalance.replacingOccurrences(of: ",", with: ".")) {
                    Task { await state.updateVoucherBalance(v, amount: val) }
                }
            }
            Button("Abbrechen", role: .cancel) {}
        } message: {
            Text("Gib den neuen Restwert für den Gutschein ein.")
        }
    }

    private func tab(_ text: String, active: Bool) -> some View {
        Text(active ? "✓ \(text)" : text)
            .font(EntfaltaTheme.segoe(14, bold: true))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(active ? EntfaltaTheme.buttonGradient : LinearGradient(colors: [.clear], startPoint: .top, endPoint: .bottom), in: Capsule())
            .foregroundStyle(.white)
    }
}

struct DiscountCodeView: View {
    @EnvironmentObject private var state: AppState
    @State private var code = ""
    @State private var value = ""
    @State private var type = 0 // 0: %, 1: EUR
    @State private var limit = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 25) {
            Text("Rabattcodes").font(EntfaltaTheme.segoe(32, bold: true))

            VStack(spacing: 15) {
                EntfaltaTextField(placeholder: "Code (z.B. SOMMER24)", text: $code)
                HStack {
                    Picker("Typ", selection: $type) {
                        Text("Prozent (%)").tag(0)
                        Text("Fester Betrag (EUR)").tag(1)
                    }.pickerStyle(.segmented)
                    EntfaltaTextField(placeholder: "Wert", text: $value)
                }
                EntfaltaTextField(placeholder: "Nutzungslimits (0 = unendlich)", text: $limit)
                Button("Code speichern") {}.primaryButtonStyle().frame(maxWidth: .infinity)
            }.entfaltaCard()

            Text("Aktive Codes").font(EntfaltaTheme.segoe(20, bold: true))
            Text("Keine Rabattcodes gefunden.").padding().frame(maxWidth: .infinity, alignment: .center)
        }
    }
}

struct ISBNView: View {
    @EnvironmentObject private var state: AppState
    @State private var isbn = ""
    @State private var title = ""
    @State private var price = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 25) {
            HStack {
                Text("ISBNs").font(EntfaltaTheme.segoe(32, bold: true))
                Spacer()
                Button("Liste importieren (.txt)") {}.headerButtonStyle()
            }

            VStack(spacing: 12) {
                EntfaltaTextField(placeholder: "ISBN", text: $isbn)
                EntfaltaTextField(placeholder: "Buchtitel optional", text: $title)
                EntfaltaTextField(placeholder: "Preis (EUR) optional", text: $price)
                HStack {
                    Toggle("", isOn: .constant(false)).labelsHidden()
                    Text("Schon genutzt").font(EntfaltaTheme.segoe(14))
                    Spacer()
                }
                Button("ISBN speichern") {}.primaryButtonStyle().frame(maxWidth: .infinity)
            }.entfaltaCard()

            Button("Nur ungenutzte anzeigen") {}.headerButtonStyle().frame(maxWidth: .infinity)

            VStack(spacing: 12) {
                if state.isbns.isEmpty {
                    Text("Noch keine ISBNs vorhanden.").padding().frame(maxWidth: .infinity, alignment: .center)
                } else {
                    ForEach(state.isbns) { item in
                        HStack {
                            VStack(alignment: .leading) {
                                Text(item.isbn).bold()
                                if !item.title.isEmpty { Text(item.title).font(.caption) }
                            }
                            Spacer()
                            Text(item.used ? "Benutzt" : "Frei").font(.caption).foregroundStyle(item.used ? .red : .green)
                        }.entfaltaCard(padding: 12)
                    }
                }
            }
        }
    }
}

struct AdminProductsView: View {
    @EnvironmentObject private var state: AppState
    @State private var showingEdit = false
    @State private var selectedProduct: Product?

    var body: some View {
        VStack(alignment: .leading, spacing: 25) {
            HStack {
                Text("Bücher & Produkte").font(EntfaltaTheme.segoe(32, bold: true))
                Spacer()
                Button("Neu") {
                    selectedProduct = nil
                    showingEdit = true
                }.headerButtonStyle()
            }

            VStack(spacing: 12) {
                if state.products.isEmpty {
                    Text("Noch keine Artikel vorhanden.").padding().frame(maxWidth: .infinity, alignment: .center)
                } else {
                    ForEach(state.products) { product in
                        HStack {
                            VStack(alignment: .leading) {
                                Text(product.title).bold()
                                Text(money(product.price)).font(.caption).foregroundStyle(EntfaltaTheme.leaf)
                            }
                            Spacer()
                            Button("Edit") {
                                selectedProduct = product
                                showingEdit = true
                            }.font(.caption).padding(6).background(Color.white.opacity(0.1), in: RoundedRectangle(cornerRadius: 8))
                        }.entfaltaCard(padding: 12)
                    }
                }
            }
        }
        .sheet(isPresented: $showingEdit) {
            AdminProductEditView(existingProduct: selectedProduct)
        }
        .refreshable { await state.loadProducts() }
    }
}

struct DeliveryView: View {
    @State private var name = ""
    @State private var price = ""
    @State private var scV = ""
    @State private var scR = ""
    @State private var desc = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 25) {
            Text("Lieferung").font(EntfaltaTheme.segoe(32, bold: true))

            VStack(spacing: 12) {
                Text("Diese Lieferdienste können Kunden im Checkout auswählen.").font(EntfaltaTheme.segoe(14)).foregroundStyle(EntfaltaTheme.textMuted)
                EntfaltaTextField(placeholder: "Lieferdienst, z.B. Hermes", text: $name)
                EntfaltaTextField(placeholder: "Versandpreis", text: $price)
                EntfaltaTextField(placeholder: "Sendcloud Method ID (Versand)", text: $scV)
                EntfaltaTextField(placeholder: "Sendcloud Method ID (Retoure)", text: $scR)
                EntfaltaTextField(placeholder: "Optionale Beschreibung", text: $desc)
                Button("Lieferdienst hinzufügen") {}.primaryButtonStyle().frame(maxWidth: .infinity)
            }.entfaltaCard()

            Text("Versandmethoden").font(EntfaltaTheme.segoe(20, bold: true))
            Divider().opacity(0.1)
        }
    }
}

struct ReturnRequestsView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 15) {
            Text("Rücksendungen").font(EntfaltaTheme.segoe(32, bold: true))
            Text("Hier siehst du alle beantragten Rücksendungen von Kunden.").font(.caption).foregroundStyle(EntfaltaTheme.textMuted)

            Text("Keine offenen Rücksendungen.").padding().frame(maxWidth: .infinity, alignment: .center)
        }
    }
}

struct LagerView: View {
    @EnvironmentObject private var state: AppState
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Lagerbestand").font(EntfaltaTheme.segoe(32, bold: true))

            VStack(spacing: 12) {
                ForEach(state.products) { product in
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(product.title).font(EntfaltaTheme.segoe(16, bold: true))
                            Text(product.itemType.uppercased()).font(.system(size: 10, weight: .bold)).foregroundStyle(.secondary)
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 2) {
                            Text("\(product.stock)")
                                .font(EntfaltaTheme.segoe(22, bold: true))
                                .foregroundStyle(product.stock > 5 ? EntfaltaTheme.leaf : EntfaltaTheme.clay)
                            Text("Stück auf Lager").font(.system(size: 10))
                        }
                    }
                    .entfaltaCard(padding: 15)
                }
            }
        }
        .refreshable { await state.loadProducts() }
    }
}
