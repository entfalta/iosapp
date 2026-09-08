import SwiftUI

struct OrdersView: View {
    @EnvironmentObject private var state: AppState
    @State private var showArchived = false

    var filteredOrders: [Order] {
        state.orders.filter { state.isPhysicalOrder($0) && $0.archived == showArchived }
            .sorted(by: { $0.createdAtMs > $1.createdAtMs })
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack {
                Text(showArchived ? "Archivierte Bestellungen" : "Aktive Bestellungen")
                    .font(EntfaltaTheme.segoe(32, bold: true))
                Spacer()
                Button(showArchived ? "Aktive ansehen" : "Archiv ansehen") {
                    showArchived.toggle()
                }.headerButtonStyle()
            }

            if filteredOrders.isEmpty {
                Text(showArchived ? "Keine archivierten Bestellungen." : "Keine aktiven Bestellungen.")
                    .padding().frame(maxWidth: .infinity, alignment: .center)
            } else {
                ForEach(filteredOrders) { order in
                    AdminOrderCard(order: order)
                }
            }
        }
        .refreshable { await state.loadOrders() }
    }
}

struct AdminDownloadsView: View {
    @EnvironmentObject private var state: AppState

    var filteredOrders: [Order] {
        state.orders.filter { state.isDigitalOnlyOrder($0) && !$0.archived }
            .sorted(by: { $0.createdAtMs > $1.createdAtMs })
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Download-Bestellungen").font(EntfaltaTheme.segoe(32, bold: true))
            Text("Hier siehst du alle Bestellungen, die nur Download-Artikel enthalten.").font(.caption).foregroundColor(EntfaltaTheme.textMuted)

            if filteredOrders.isEmpty {
                Text("Keine Download-Bestellungen gefunden.")
                    .padding().frame(maxWidth: .infinity, alignment: .center)
            } else {
                ForEach(filteredOrders) { order in
                    AdminOrderCard(order: order)
                }
            }
        }
        .refreshable { await state.loadOrders() }
    }
}

struct AdminOrderCard: View {
    let order: Order
    @State private var expanded = false
    @EnvironmentObject private var state: AppState

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(order.orderNumber).font(EntfaltaTheme.segoe(18, bold: true))
                    Text(order.customerName).font(EntfaltaTheme.segoe(14))
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 4) {
                    Text(money(order.total)).font(EntfaltaTheme.segoe(18, bold: true)).foregroundColor(EntfaltaTheme.clay)
                    Text(dateString(order.createdAtMs)).font(.caption).foregroundColor(EntfaltaTheme.textMuted)
                }
            }

            if expanded {
                Divider().opacity(0.1)
                Text("E-Mail: \(order.customerEmail)").font(.caption)
                Text("Status: \(order.fulfillmentStatus ?? "offen")").bold()

                if let items = order.items {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Bestellte Artikel:").font(EntfaltaTheme.segoe(14, bold: true))
                        ForEach(0..<items.count, id: \.self) { i in
                            let item = items[i]
                            let qty = Int(item["quantity"] as? Double ?? 1)
                            let price = item["price"] as? Double ?? 0.0

                            HStack(alignment: .top, spacing: 12) {
                                Text("\(qty)x")
                                    .font(EntfaltaTheme.segoe(14, bold: true))
                                    .padding(6)
                                    .background(EntfaltaTheme.leaf.opacity(0.1))
                                    .foregroundColor(EntfaltaTheme.leaf)
                                    .clipShape(RoundedRectangle(cornerRadius: 8))

                                VStack(alignment: .leading, spacing: 2) {
                                    Text(item["title"] as? String ?? "Artikel").bold()
                                    Text("\(money(price)) | \(item["fulfillment"] as? String ?? "Standard")")
                                        .font(.system(size: 10))
                                        .foregroundColor(EntfaltaTheme.textMuted)
                                }
                                Spacer()
                                Text(money(price * Double(qty)))
                                    .font(EntfaltaTheme.segoe(14, bold: true))
                            }
                            .padding(.vertical, 4)
                            if i < items.count - 1 {
                                Divider().opacity(0.05)
                            }
                        }
                    }
                    .padding(.vertical, 8)
                }

                HStack {
                    Button(order.archived ? "Wiederherstellen" : "Archivieren") {
                        Task { try? await FirebaseRest.shared.set(collection: "orders", id: order.id, values: ["archived": !order.archived], token: state.session?.idToken ?? "") ; await state.loadOrders() }
                    }.headerButtonStyle()

                    Spacer()

                    Button("Löschen") {
                        // Normally show confirmation
                    }.foregroundColor(.red).font(.caption)
                }
            }
        }
        .entfaltaCard()
        .onTapGesture { withAnimation { expanded.toggle() } }
    }
}
