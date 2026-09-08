import SwiftUI

struct ShopView: View {
    @EnvironmentObject private var state: AppState
    @State private var selected: Product?

    var body: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 200), spacing: 16)], spacing: 16) {
                ForEach(state.products) { product in
                    Button { selected = product } label: {
                        ProductCard(product: product)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding()
        }
        .refreshable { await state.refreshAll() }
        .sheet(item: $selected) { ProductDetail(product: $0) }
    }
}

struct ProductCard: View {
    let product: Product
    @EnvironmentObject private var state: AppState
    @State private var quickQuantity = 1
    @State private var selectedVariantName: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ProductImage(source: product.cover)
                .frame(height: 160)
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                .rotationEffect(.degrees(Double.random(in: -2...2)))

            Text(product.title).font(EntfaltaTheme.segoe(18, bold: true)).lineLimit(2)
            Text(product.description).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(2)

            HStack {
                Text(priceText).font(EntfaltaTheme.segoe(15, bold: true)).foregroundStyle(EntfaltaTheme.leaf)
                Spacer()
                availabilityBadge
            }

            if let variants = product.variants, !variants.isEmpty {
                Picker("Variante", selection: $selectedVariantName) {
                    Text("Wähle Variante").tag(String?.none)
                    ForEach(variants, id: \.name) { v in
                        Text("\(v.name) - \(String(format: "%.2f€", v.price))").tag(String?.some(v.name))
                    }
                }
                .pickerStyle(.menu)
                .font(.caption)
            }

            if product.downloadPrice <= 0 && product.stock > 0 {
                HStack {
                    Stepper("", value: $quickQuantity, in: 1...max(1, product.stock))
                        .labelsHidden()
                    Button("Hinzufügen") {
                        state.addToCart(product, format: "print", quantity: quickQuantity, variant: selectedVariantName)
                    }.font(.caption.bold())
                }
                .padding(.top, 4)
            }
        }
        .entfaltaCard()
    }

    private var priceText: String {
        var prices = [product.downloadPrice, product.printPrice].filter { $0 > 0 }
        if let variants = product.variants {
            prices.append(contentsOf: variants.map { $0.price })
        }
        let minPrice = prices.min() ?? product.price
        let maxPrice = prices.max() ?? product.price
        if minPrice == maxPrice || prices.isEmpty {
            return String(format: "%.2f €", minPrice)
        }
        return String(format: "%.2f - %.2f €", minPrice, maxPrice)
    }

    private var availabilityBadge: some View {
        let available = product.stock > 0 || product.downloadPrice > 0
        return Text(available ? "bereit" : "leer")
            .font(.system(size: 10, weight: .black))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(available ? EntfaltaTheme.leaf.opacity(0.2) : .red.opacity(0.1), in: Capsule())
            .foregroundStyle(available ? EntfaltaTheme.leaf : .red)
    }
}

struct ProductDetail: View {
    @EnvironmentObject private var state: AppState
    let product: Product
    @Environment(\.dismiss) private var dismiss
    @State private var quantity = 1
    @State private var selectedVariantName: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    ProductImage(source: product.cover)
                        .frame(maxHeight: 350)
                        .clipShape(RoundedRectangle(cornerRadius: 25, style: .continuous))
                        .shadow(color: .black.opacity(0.1), radius: 20)
                        .padding(.bottom, 10)

                    Text(product.title).font(EntfaltaTheme.segoe(32, bold: true))

                    if let isbn = product.isbn {
                        Text("ISBN: \(isbn)").font(.caption.monospaced()).foregroundStyle(.secondary)
                    }

                    Text(product.description).font(EntfaltaTheme.segoe(16))

                    VStack(spacing: 14) {
                        if product.downloadPrice > 0 {
                            HStack {
                                Text("Digitale Ausgabe (Download)").font(EntfaltaTheme.segoe(15, bold: true))
                                Spacer()
                                Button("Kaufen \(money(product.downloadPrice))") {
                                    state.addToCart(product, format: "download", quantity: 1)
                                    dismiss()
                                }.primaryButtonStyle()
                            }.padding().background(.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 15))
                        }

                        if product.printPrice > 0 && product.stock > 0 {
                            VStack(spacing: 12) {
                                HStack {
                                    Text("Gedruckte Ausgabe").font(EntfaltaTheme.segoe(15, bold: true))
                                    Spacer()
                                    Text(money(product.printPrice)).font(EntfaltaTheme.segoe(17, bold: true)).foregroundStyle(EntfaltaTheme.clay)
                                }

                                if let variants = product.variants, !variants.isEmpty {
                                    Picker("Variante", selection: $selectedVariantName) {
                                        Text("Wähle Variante").tag(String?.none)
                                        ForEach(variants, id: \.name) { v in
                                            Text("\(v.name) - \(String(format: "%.2f€", v.price))").tag(String?.some(v.name))
                                        }
                                    }
                                    .pickerStyle(.segmented)
                                }

                                HStack {
                                    Stepper("Anzahl: \(quantity)", value: $quantity, in: 1...max(1, product.stock))
                                    Spacer()
                                    Button("In den Warenkorb") {
                                        state.addToCart(product, format: "print", quantity: quantity, variant: selectedVariantName)
                                        dismiss()
                                    }.primaryButtonStyle()
                                }
                            }.padding().background(.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 15))
                        }
                    }

                    if let previews = product.previewPages, !previews.isEmpty {
                        Text("Vorschau").font(EntfaltaTheme.segoe(20, bold: true))
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 12) {
                                ForEach(previews, id: \.self) { src in
                                    ProductImage(source: src).frame(width: 150, height: 200)
                                        .clipShape(RoundedRectangle(cornerRadius: 12))
                                }
                            }
                        }
                    }
                }
                .padding(24)
            }
            .background(WatercolorBackground())
            .toolbar { ToolbarItem(placement: .navigationBarLeading) { Button("Fertig") { dismiss() }.font(EntfaltaTheme.segoe(16, bold: true)) } }
        }
    }
}

struct CartSheet: View {
    @EnvironmentObject private var state: AppState
    @Environment(\.dismiss) private var dismiss
    @State private var agreed = false

    var isDownloadOnly: Bool {
        !state.cart.isEmpty && state.cart.allSatisfy { $0.format == "download" }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                List {
                    Section {
                        ForEach(state.cart) { item in
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(item.product.title).font(EntfaltaTheme.segoe(15, bold: true))
                                    Text(item.format == "download" ? "📥 Download" : "📦 Gedruckt x\(item.quantity)").font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Text(money(Double(item.quantity) * item.unitPrice)).bold()
                            }
                        }
                    } header: { Text("Artikel") }

                    Section {
                        HStack {
                            Text("Versandkosten")
                            Spacer()
                            Text(isDownloadOnly ? "0.00 EUR" : "Wird berechnet").bold().foregroundStyle(isDownloadOnly ? EntfaltaTheme.leaf : .primary)
                        }
                        if isDownloadOnly {
                            Text("Gratis Versand für rein digitale Bestellungen!").font(.caption).foregroundStyle(EntfaltaTheme.leaf)
                        }
                        HStack {
                            Text("Gesamtsumme").font(.headline)
                            Spacer()
                            Text(money(state.cartTotal)).font(EntfaltaTheme.segoe(20, bold: true)).foregroundStyle(EntfaltaTheme.clay)
                        }
                    } header: { Text("Zusammenfassung") }

                    Section {
                        Toggle(isOn: $agreed) {
                            Text("Ich akzeptiere die AGB und Datenschutzbestimmungen.").font(.caption)
                        }
                    }
                }
                .listStyle(.insetGrouped)

                Button(action: { Task { await state.checkout() } }) {
                    HStack {
                        Image(systemName: "creditcard.fill")
                        Text("Jetzt sicher bezahlen")
                    }
                    .frame(maxWidth: .infinity)
                }
                .primaryButtonStyle()
                .disabled(!agreed || state.cart.isEmpty)
                .padding(24)
                .background(.ultraThinMaterial)
            }
            .navigationTitle("Dein Warenkorb")
            .toolbar { ToolbarItem(placement: .navigationBarLeading) { Button("Schließen") { dismiss() } } }
        }
    }
}

struct NewsletterView: View {
    @EnvironmentObject private var state: AppState
    @State private var email = ""
    @State private var pushEnabled = false

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                VStack(spacing: 16) {
                    Text("Newsletter abonnieren").font(EntfaltaTheme.segoe(24, bold: true))
                    Text("Erhalte Infos zu neuen Büchern und Aktionen bequem per Mail oder Push.")
                        .font(EntfaltaTheme.segoe(14))
                        .multilineTextAlignment(.center)

                    TextField("Deine E-Mail Adresse", text: $email)
                        .textFieldStyle(.roundedBorder)
                        .onAppear { if let m = state.profile?.email { email = m } }

                    Toggle("Push-Benachrichtigungen aktivieren", isOn: $pushEnabled)
                        .font(EntfaltaTheme.segoe(14, bold: true))

                    Button("Abonnieren") {
                        state.message = "Vielen Dank! Du bist nun registriert."
                    }.primaryButtonStyle()
                }
                .entfaltaCard()

                ForEach(state.newsletterPosts) { post in
                    VStack(alignment: .leading, spacing: 12) {
                        if !post.image.isEmpty {
                            ProductImage(source: post.image).frame(height: 200)
                                .clipShape(RoundedRectangle(cornerRadius: 15))
                        }
                        Text(post.title).font(EntfaltaTheme.segoe(22, bold: true))
                        Text(post.text).font(EntfaltaTheme.segoe(15))
                        Text(date(post.createdAtMs)).font(.caption2).foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .entfaltaCard()
                }
            }.padding()
        }
        .refreshable { await state.loadNewsletter() }
    }
}

import WebKit
struct WebView: UIViewRepresentable {
    let url: URL
    func makeUIView(context: Context) -> WKWebView { WKWebView() }
    func updateUIView(_ uiView: WKWebView, context: Context) {
        let request = URLRequest(url: url)
        uiView.load(request)
    }
}
