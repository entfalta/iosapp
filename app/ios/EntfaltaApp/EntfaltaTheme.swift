import SwiftUI
import UIKit
import CoreText

enum EntfaltaTheme {
    // Exact colors from Android screenshots
    static let forestGreen = Color(red: 0.09, green: 0.11, blue: 0.08) // #171b14
    static let leaf = Color(red: 0.25, green: 0.44, blue: 0.27)      // #3f6f45
    static let clay = Color(red: 0.54, green: 0.34, blue: 0.22)      // #8a5637
    static let brown = Color(red: 0.35, green: 0.22, blue: 0.15)     // #593826
    static let cardBg = Color.white.opacity(0.04)
    static let cardBorder = Color.white.opacity(0.12)
    static let textMuted = Color.white.opacity(0.6)

    static func registerFonts() {
        guard let url = Bundle.main.url(forResource: "segoepr", withExtension: "ttf"),
              let rawData = try? Data(contentsOf: url) else { return }
        let data = rawData as CFData
        guard let provider = CGDataProvider(data: data),
              let font = CGFont(provider) else { return }
        CTFontManagerRegisterGraphicsFont(font, nil)
    }

    static func segoe(_ size: CGFloat, bold: Bool = false) -> Font {
        .custom("Segoe Print", size: size).weight(bold ? .bold : .regular)
    }

    static var buttonGradient: LinearGradient {
        LinearGradient(colors: [leaf.opacity(0.9), clay.opacity(0.9)], startPoint: .leading, endPoint: .trailing)
    }
}

func money(_ amount: Double) -> String {
    String(format: "%.2f €", amount).replacingOccurrences(of: ".", with: ",")
}

func dateString(_ ms: Double) -> String {
    guard ms > 0 else { return "---" }
    let date = Date(timeIntervalSince1970: ms / 1000)
    let formatter = DateFormatter()
    formatter.dateFormat = "dd.MM.yyyy HH:mm"
    return formatter.string(from: date)
}

extension View {
    func entfaltaCard(padding: CGFloat = 20) -> some View {
        self
            .padding(padding)
            .background(EntfaltaTheme.cardBg)
            .clipShape(RoundedRectangle(cornerRadius: 25, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 25, style: .continuous).stroke(EntfaltaTheme.cardBorder, lineWidth: 1))
    }

    func primaryButtonStyle() -> some View {
        self
            .font(EntfaltaTheme.segoe(16, bold: true))
            .foregroundStyle(.white)
            .padding(.horizontal, 22)
            .padding(.vertical, 12)
            .background(EntfaltaTheme.buttonGradient, in: Capsule())
    }
}

struct EntfaltaTextField: View {
    let placeholder: String
    @Binding var text: String
    var keyboardType: UIKeyboardType = .default
    var isSecure: Bool = false

    var body: some View {
        Group {
            if isSecure {
                SecureField("", text: $text, prompt: Text(placeholder).foregroundStyle(EntfaltaTheme.textMuted))
            } else {
                TextField("", text: $text, prompt: Text(placeholder).foregroundStyle(EntfaltaTheme.textMuted))
                    .keyboardType(keyboardType)
                    .autocapitalization(.none)
            }
        }
        .font(EntfaltaTheme.segoe(15))
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
        .background(EntfaltaTheme.forestGreen.opacity(0.5))
        .clipShape(Capsule())
        .overlay(Capsule().stroke(EntfaltaTheme.cardBorder, lineWidth: 1))
    }
}
