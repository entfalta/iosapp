import SwiftUI

struct AdminProductEditView: View {
    @EnvironmentObject private var state: AppState
    @Environment(\.dismiss) private var dismiss

    let existingProduct: Product?

    @State private var title = ""
    @State private var description = ""
    @State private var price = ""
    @State private var stock = ""
    @State private var itemType = "book"
    @State private var isbn = ""

    var body: some View {
        NavigationView {
            Form {
                Section(header: Text("Allgemein")) {
                    TextField("Titel", text: $title)
                    TextEditor(text: $description).frame(height: 100)
                    Picker("Typ", selection: $itemType) {
                        Text("Buch").tag("book")
                        Text("Produkt").tag("product")
                    }
                    if itemType == "book" {
                        TextField("ISBN", text: $isbn)
                    }
                }

                Section(header: Text("Preise & Lager")) {
                    TextField("Preis", text: $price).keyboardType(.decimalPad)
                    TextField("Bestand", text: $stock).keyboardType(.numberPad)
                }

                Section {
                    Button("Speichern") {
                        Task { await save() }
                    }.disabled(title.isEmpty)
                }
            }
            .navigationTitle(existingProduct == nil ? "Neuer Artikel" : "Bearbeiten")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
            }
            .onAppear {
                if let p = existingProduct {
                    title = p.title
                    description = p.description
                    price = String(p.price)
                    stock = String(p.stock)
                    itemType = p.itemType
                    isbn = p.isbn ?? ""
                }
            }
        }
    }

    private func save() async {
        var values: [String: Any] = [
            "title": title,
            "description": description,
            "price": Double(price.replacingOccurrences(of: ",", with: ".")) ?? 0.0,
            "stock": Double(stock) ?? 0.0,
            "itemType": itemType,
            "updatedAt": [".sv": "timestamp"]
        ]

        if itemType == "book" {
            values["isbn"] = isbn
        }

        do {
            let id = existingProduct?.id ?? UUID().uuidString
            try await FirebaseRest.shared.set(collection: "books", id: id, values: values, token: state.session?.idToken ?? "")
            await state.loadProducts()
            dismiss()
        } catch {
            state.message = error.localizedDescription
        }
    }
}
