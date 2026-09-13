import SwiftUI

struct AdminProductEditView: View {
    @EnvironmentObject private var state: AppState
    @Environment(\.dismiss) private var dismiss

    let existingProduct: Product?

    @State private var title = ""
    @State private var description = ""
    @State private var category = "Aufklärung"
    @State private var itemType = "book"

    @State private var downloadPrice = ""
    @State private var printPrice = ""
    @State private var downloadAvailable = true
    @State private var printAvailable = true

    @State private var noIsbnBook = false
    @State private var isbn = ""
    @State private var isbnEbook = ""

    @State private var releaseDate = Date()
    @State private var useReleaseDate = false

    @State private var stock = ""
    @State private var lowStockEnabled = false
    @State private var lowStockLimit = "20"

    @State private var cover = ""
    @State private var aiGeneratedCover = false
    @State private var pdfUrl = ""
    @State private var previewPagesText = ""
    @State private var productImagesText = ""

    @State private var showIsbnPickerPrint = false
    @State private var showIsbnPickerEbook = false

    let categories = ["Aufklärung", "Alltagshelfer", "Lernhelfer", "Sonstige"]
    let itemTypes = [
        ("book", "Buch"),
        ("product", "Produkt"),
        ("worksheet", "Arbeitsblätter")
    ]

    var body: some View {
        NavigationView {
            ZStack {
                WatercolorBackground()

                ScrollView {
                    VStack(spacing: 22) {
                        // Header
                        VStack(spacing: 6) {
                            Text(existingProduct == nil ? "Neuer Artikel" : "Artikel bearbeiten")
                                .font(EntfaltaTheme.segoe(26, bold: true))
                                .foregroundColor(.white)
                            Text("Bücher, Produkte & Arbeitsblätter im Shop verwalten")
                                .font(EntfaltaTheme.segoe(13))
                                .foregroundColor(EntfaltaTheme.textMuted)
                        }
                        .padding(.top, 10)

                        // 1. Allgemein
                        VStack(alignment: .leading, spacing: 14) {
                            sectionHeader(title: "Allgemein", icon: "doc.text")

                            VStack(alignment: .leading, spacing: 6) {
                                Text("Titel").font(EntfaltaTheme.segoe(13, bold: true)).foregroundColor(EntfaltaTheme.textMuted)
                                EntfaltaTextField(placeholder: "Artikel Titel eingeben", text: $title)
                            }

                            VStack(alignment: .leading, spacing: 6) {
                                Text("Beschreibung").font(EntfaltaTheme.segoe(13, bold: true)).foregroundColor(EntfaltaTheme.textMuted)
                                TextEditor(text: $description)
                                    .font(EntfaltaTheme.segoe(14))
                                    .frame(height: 100)
                                    .padding(10)
                                    .background(
                                        RoundedRectangle(cornerRadius: 16)
                                            .fill(.thinMaterial)
                                            .overlay(RoundedRectangle(cornerRadius: 16).fill(EntfaltaTheme.forestGreen.opacity(0.4)))
                                    )
                                    .clipShape(RoundedRectangle(cornerRadius: 16))
                                    .overlay(RoundedRectangle(cornerRadius: 16).stroke(EntfaltaTheme.glassBorderGradient, lineWidth: 1))
                            }

                            VStack(alignment: .leading, spacing: 6) {
                                Text("Kategorie").font(EntfaltaTheme.segoe(13, bold: true)).foregroundColor(EntfaltaTheme.textMuted)
                                Picker("Kategorie", selection: $category) {
                                    ForEach(categories, id: \.self) { cat in
                                        Text(cat).tag(cat)
                                    }
                                }
                                .pickerStyle(.segmented)
                            }

                            VStack(alignment: .leading, spacing: 6) {
                                Text("Artikel-Art").font(EntfaltaTheme.segoe(13, bold: true)).foregroundColor(EntfaltaTheme.textMuted)
                                Picker("Art", selection: $itemType) {
                                    ForEach(itemTypes, id: \.0) { type in
                                        Text(type.1).tag(type.0)
                                    }
                                }
                                .pickerStyle(.segmented)
                            }
                        }
                        .entfaltaCard()

                        // 2. Preise & Optionale Varianten
                        VStack(alignment: .leading, spacing: 14) {
                            sectionHeader(title: "Preise & Erfüllung", icon: "eurosign.circle")

                            HStack(spacing: 12) {
                                VStack(alignment: .leading, spacing: 6) {
                                    Text("Download-Preis (EUR)").font(EntfaltaTheme.segoe(12, bold: true)).foregroundColor(EntfaltaTheme.textMuted)
                                    EntfaltaTextField(placeholder: "z.B. 9.99", text: $downloadPrice, keyboardType: .decimalPad)
                                }
                                VStack(alignment: .leading, spacing: 6) {
                                    Text("Gedruckt-Preis (EUR)").font(EntfaltaTheme.segoe(12, bold: true)).foregroundColor(EntfaltaTheme.textMuted)
                                    EntfaltaTextField(placeholder: "z.B. 14.99", text: $printPrice, keyboardType: .decimalPad)
                                }
                            }

                            VStack(alignment: .leading, spacing: 8) {
                                Toggle(isOn: $downloadAvailable) {
                                    Text("Als Download anbieten")
                                        .font(EntfaltaTheme.segoe(14))
                                }
                                Toggle(isOn: $printAvailable) {
                                    Text("Gedruckt anbieten")
                                        .font(EntfaltaTheme.segoe(14))
                                }
                            }
                            .padding(.top, 4)
                        }
                        .entfaltaCard()

                        // 3. ISBN & Buchpreisbindung (Nur bei Buch)
                        if itemType == "book" {
                            VStack(alignment: .leading, spacing: 14) {
                                sectionHeader(title: "ISBN & Buchpreisbindung", icon: "barcode")

                                // Checkbox: Keine ISBN / Ohne Buchpreisbindung
                                HStack(alignment: .top, spacing: 12) {
                                    Toggle("", isOn: $noIsbnBook)
                                        .labelsHidden()
                                        .tint(EntfaltaTheme.leaf)

                                    VStack(alignment: .leading, spacing: 3) {
                                        Text("Keine ISBN / Ohne Buchpreisbindung")
                                            .font(EntfaltaTheme.segoe(14, bold: true))
                                            .foregroundColor(.white)
                                        Text("Aktivieren um Buchpreisbindung aufzuheben (Rabatte & Gutscheine sofort erlaubt). Standard: aus.")
                                            .font(EntfaltaTheme.segoe(11))
                                            .foregroundColor(EntfaltaTheme.textMuted)
                                    }
                                }
                                .padding(12)
                                .background(Color.white.opacity(0.04))
                                .clipShape(RoundedRectangle(cornerRadius: 16))
                                .overlay(RoundedRectangle(cornerRadius: 16).stroke(EntfaltaTheme.cardBorder, lineWidth: 1))

                                // Gedruckte ISBN
                                VStack(alignment: .leading, spacing: 6) {
                                    Text("ISBN (Gedrucktes Buch)").font(EntfaltaTheme.segoe(12, bold: true)).foregroundColor(EntfaltaTheme.textMuted)
                                    HStack {
                                        EntfaltaTextField(placeholder: "Keine ISBN gewählt", text: $isbn)
                                        Button("Wählen") {
                                            showIsbnPickerPrint = true
                                        }
                                        .headerButtonStyle()
                                    }
                                }

                                // E-Book ISBN
                                VStack(alignment: .leading, spacing: 6) {
                                    Text("ISBN (E-Book / PDF)").font(EntfaltaTheme.segoe(12, bold: true)).foregroundColor(EntfaltaTheme.textMuted)
                                    HStack {
                                        EntfaltaTextField(placeholder: "Keine ISBN gewählt", text: $isbnEbook)
                                        Button("Wählen") {
                                            showIsbnPickerEbook = true
                                        }
                                        .headerButtonStyle()
                                    }
                                }
                            }
                            .entfaltaCard()
                        }

                        // 4. Lager & Push-Benachrichtigung
                        VStack(alignment: .leading, spacing: 14) {
                            sectionHeader(title: "Bestand & Benachrichtigung", icon: "box.truck")

                            VStack(alignment: .leading, spacing: 6) {
                                Text("Auf Lager (Stückzahl)").font(EntfaltaTheme.segoe(13, bold: true)).foregroundColor(EntfaltaTheme.textMuted)
                                EntfaltaTextField(placeholder: "0", text: $stock, keyboardType: .numberPad)
                            }

                            HStack(alignment: .top, spacing: 12) {
                                Toggle("", isOn: $lowStockEnabled)
                                    .labelsHidden()

                                VStack(alignment: .leading, spacing: 2) {
                                    Text("Push bei niedrigem Lagerbestand")
                                        .font(EntfaltaTheme.segoe(14, bold: true))
                                    Text("E-Mail / Benachrichtigung senden, wenn der Bestand fällt.")
                                        .font(EntfaltaTheme.segoe(11))
                                        .foregroundColor(EntfaltaTheme.textMuted)
                                }
                            }

                            if lowStockEnabled {
                                VStack(alignment: .leading, spacing: 6) {
                                    Text("Warnung ab (Stückzahl)").font(EntfaltaTheme.segoe(12, bold: true)).foregroundColor(EntfaltaTheme.textMuted)
                                    EntfaltaTextField(placeholder: "z.B. 20", text: $lowStockLimit, keyboardType: .numberPad)
                                }
                            }

                            // Release Date
                            VStack(alignment: .leading, spacing: 6) {
                                Toggle(isOn: $useReleaseDate) {
                                    Text("Veröffentlichungsdatum festlegen")
                                        .font(EntfaltaTheme.segoe(14))
                                }
                                if useReleaseDate {
                                    DatePicker("Datum", selection: $releaseDate, displayedComponents: .date)
                                        .datePickerStyle(.graphical)
                                        .tint(EntfaltaTheme.leaf)
                                }
                            }
                        }
                        .entfaltaCard()

                        // 5. Medien & Vorschau Links
                        VStack(alignment: .leading, spacing: 14) {
                            sectionHeader(title: "Medien & Uploads", icon: "photo.on.rectangle")

                            VStack(alignment: .leading, spacing: 6) {
                                Text("Cover Bild URL").font(EntfaltaTheme.segoe(12, bold: true)).foregroundColor(EntfaltaTheme.textMuted)
                                EntfaltaTextField(placeholder: "https://... oder /assets/cover.png", text: $cover)
                            }

                            HStack(alignment: .top, spacing: 12) {
                                Toggle("", isOn: $aiGeneratedCover)
                                    .labelsHidden()
                                    .tint(EntfaltaTheme.leaf)

                                VStack(alignment: .leading, spacing: 2) {
                                    Text("Bild enthält KI-generierte Inhalte")
                                        .font(EntfaltaTheme.segoe(14, bold: true))
                                        .foregroundColor(.white)
                                    Text("Zeigt beim Bild 'Enthält KI-generierte Inhalte (ⓘ)' an.")
                                        .font(EntfaltaTheme.segoe(11))
                                        .foregroundColor(EntfaltaTheme.textMuted)
                                }
                            }
                            .padding(10)
                            .background(Color.white.opacity(0.04))
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                            .overlay(RoundedRectangle(cornerRadius: 14).stroke(EntfaltaTheme.cardBorder, lineWidth: 1))

                            VStack(alignment: .leading, spacing: 6) {
                                Text("PDF / EPUB Datei URL").font(EntfaltaTheme.segoe(12, bold: true)).foregroundColor(EntfaltaTheme.textMuted)
                                EntfaltaTextField(placeholder: "https://.../book.pdf", text: $pdfUrl)
                            }

                            VStack(alignment: .leading, spacing: 6) {
                                Text("Vorschauseiten (kommagetrennt)").font(EntfaltaTheme.segoe(12, bold: true)).foregroundColor(EntfaltaTheme.textMuted)
                                EntfaltaTextField(placeholder: "url1.jpg, url2.jpg", text: $previewPagesText)
                            }

                            VStack(alignment: .leading, spacing: 6) {
                                Text("Produktbilder (kommagetrennt)").font(EntfaltaTheme.segoe(12, bold: true)).foregroundColor(EntfaltaTheme.textMuted)
                                EntfaltaTextField(placeholder: "img1.png, img2.png", text: $productImagesText)
                            }
                        }
                        .entfaltaCard()

                        // Actions
                        HStack(spacing: 16) {
                            Button("Abbrechen") { dismiss() }
                                .headerButtonStyle()

                            Button(existingProduct == nil ? "Artikel Erstellen" : "Speichern") {
                                Task { await save() }
                            }
                            .primaryButtonStyle()
                            .disabled(title.trimmingCharacters(in: .whitespaces).isEmpty)
                        }
                        .padding(.vertical, 20)
                    }
                    .frame(maxWidth: 540)
                    .padding(20)
                }
            }
            .navigationBarHidden(true)
            .sheet(isPresented: $showIsbnPickerPrint) {
                isbnPickerSheet(selectedIsbn: $isbn)
            }
            .sheet(isPresented: $showIsbnPickerEbook) {
                isbnPickerSheet(selectedIsbn: $isbnEbook)
            }
            .onAppear {
                if let p = existingProduct {
                    title = p.title
                    description = p.description
                    category = p.category
                    itemType = p.itemType
                    downloadPrice = p.downloadPrice > 0 ? String(p.downloadPrice) : (p.price > 0 ? String(p.price) : "")
                    printPrice = p.printPrice > 0 ? String(p.printPrice) : (p.price > 0 ? String(p.price) : "")
                    downloadAvailable = p.downloadAvailable ?? true
                    printAvailable = p.printAvailable ?? true
                    noIsbnBook = p.noIsbnBook ?? false
                    isbn = p.isbn ?? ""
                    isbnEbook = p.isbnEbook ?? ""
                    stock = String(p.stock)
                    lowStockEnabled = p.lowStockEnabled ?? false
                    lowStockLimit = String(p.lowStockLimit ?? 20)
                    cover = p.cover
                    aiGeneratedCover = p.aiGeneratedCover ?? false
                    pdfUrl = p.pdfUrl ?? ""
                    previewPagesText = (p.previewPages ?? []).joined(separator: ", ")
                    productImagesText = (p.productImages ?? []).joined(separator: ", ")

                    if let ms = p.releaseDateMs, ms > 0 {
                        useReleaseDate = true
                        releaseDate = Date(timeIntervalSince1970: ms / 1000)
                    }
                }
            }
        }
    }

    private func sectionHeader(title: String, icon: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .foregroundColor(EntfaltaTheme.leaf)
                .font(.system(size: 18, weight: .bold))
            Text(title)
                .font(EntfaltaTheme.segoe(18, bold: true))
                .foregroundColor(.white)
        }
    }

    private func isbnPickerSheet(selectedIsbn: Binding<String>) -> some View {
        NavigationView {
            ZStack {
                WatercolorBackground()

                VStack(spacing: 16) {
                    Text("ISBN Wählen").font(EntfaltaTheme.segoe(22, bold: true))

                    if state.isbns.isEmpty {
                        Text("Keine ISBNs vorhanden. Füge ISBNs unter Admin -> ISBNs hinzu.")
                            .font(EntfaltaTheme.segoe(14))
                            .foregroundColor(EntfaltaTheme.textMuted)
                            .multilineTextAlignment(.center)
                            .padding()
                    } else {
                        List(state.isbns) { item in
                            Button {
                                selectedIsbn.wrappedValue = item.isbn
                                showIsbnPickerPrint = false
                                showIsbnPickerEbook = false
                            } label: {
                                HStack {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(item.isbn).bold().foregroundColor(.white)
                                        if !item.title.isEmpty {
                                            Text(item.title).font(.caption).foregroundColor(EntfaltaTheme.textMuted)
                                        }
                                    }
                                    Spacer()
                                    Text(item.used ? "Genutzt" : "Frei")
                                        .font(.caption)
                                        .foregroundColor(item.used ? .orange : .green)
                                }
                            }
                            .listRowBackground(EntfaltaTheme.cardBg)
                        }
                        .listStyle(.plain)
                    }
                }
                .padding()
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Schließen") {
                        showIsbnPickerPrint = false
                        showIsbnPickerEbook = false
                    }
                }
            }
        }
    }

    private func save() async {
        let dlP = Double(downloadPrice.replacingOccurrences(of: ",", with: ".")) ?? 0.0
        let prP = Double(printPrice.replacingOccurrences(of: ",", with: ".")) ?? 0.0
        let mainP = prP > 0 ? prP : dlP

        let previewList = previewPagesText
            .components(separatedBy: ",")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }

        let imagesList = productImagesText
            .components(separatedBy: ",")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }

        var values: [String: Any] = [
            "title": title.trimmingCharacters(in: .whitespaces),
            "description": description.trimmingCharacters(in: .whitespaces),
            "category": category,
            "itemType": itemType,
            "price": mainP,
            "downloadPrice": dlP,
            "printPrice": prP,
            "downloadAvailable": downloadAvailable,
            "printAvailable": printAvailable,
            "noIsbnBook": noIsbnBook,
            "stock": Int(stock) ?? 0,
            "lowStockEnabled": lowStockEnabled,
            "lowStockLimit": Int(lowStockLimit) ?? 20,
            "cover": cover.trimmingCharacters(in: .whitespaces),
            "aiGeneratedCover": aiGeneratedCover,
            "pdf": pdfUrl.trimmingCharacters(in: .whitespaces),
            "updatedAt": [".sv": "timestamp"]
        ]

        if itemType == "book" {
            values["isbn"] = isbn.trimmingCharacters(in: .whitespaces)
            values["isbnPrint"] = isbn.trimmingCharacters(in: .whitespaces)
            values["isbnEbook"] = isbnEbook.trimmingCharacters(in: .whitespaces)
        }

        if useReleaseDate {
            values["releaseDateMs"] = releaseDate.timeIntervalSince1970 * 1000
            let formatter = DateFormatter()
            formatter.dateFormat = "yyyy-MM-dd"
            values["releaseDate"] = formatter.string(from: releaseDate)
        }

        if !previewList.isEmpty { values["previewPages"] = previewList }
        if !imagesList.isEmpty { values["productImages"] = imagesList }

        do {
            let id = existingProduct?.id ?? UUID().uuidString
            values["id"] = id
            try await FirebaseRest.shared.set(collection: "books", id: id, values: values, token: state.session?.idToken ?? "")
            await state.loadProducts()
            dismiss()
        } catch {
            state.message = "Fehler beim Speichern: \(error.localizedDescription)"
        }
    }
}
