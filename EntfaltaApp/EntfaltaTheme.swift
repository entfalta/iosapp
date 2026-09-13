import SwiftUI
import UIKit
import CoreText

enum EntfaltaTheme {
    static let forestGreen = Color(red: 0.09, green: 0.11, blue: 0.08) // #171b14
    static let leaf = Color(red: 0.25, green: 0.44, blue: 0.27)      // #3f6f45
    static let clay = Color(red: 0.54, green: 0.34, blue: 0.22)      // #8a5637
    static let brown = Color(red: 0.35, green: 0.22, blue: 0.15)     // #593826
    static let cardBg = Color.white.opacity(0.06)
    static let cardBorder = Color.white.opacity(0.18)
    static let textMuted = Color.white.opacity(0.65)

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
        LinearGradient(colors: [leaf.opacity(0.95), clay.opacity(0.90)], startPoint: .leading, endPoint: .trailing)
    }

    static var glassBorderGradient: LinearGradient {
        LinearGradient(
            colors: [Color.white.opacity(0.35), Color.white.opacity(0.08)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
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
            .background(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .fill(.ultraThinMaterial)
                    .overlay(
                        RoundedRectangle(cornerRadius: 24, style: .continuous)
                            .fill(EntfaltaTheme.cardBg)
                    )
            )
            .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .stroke(EntfaltaTheme.glassBorderGradient, lineWidth: 1.2)
            )
            .shadow(color: Color.black.opacity(0.25), radius: 12, x: 0, y: 6)
    }

    func entfaltaCenteredCard(maxWidth: CGFloat = 520, padding: CGFloat = 20) -> some View {
        self
            .entfaltaCard(padding: padding)
            .frame(maxWidth: maxWidth)
            .frame(maxWidth: .infinity, alignment: .center)
    }

    func primaryButtonStyle() -> some View {
        self
            .font(EntfaltaTheme.segoe(16, bold: true))
            .foregroundColor(.white)
            .padding(.horizontal, 24)
            .padding(.vertical, 14)
            .background(EntfaltaTheme.buttonGradient, in: Capsule())
            .overlay(Capsule().stroke(EntfaltaTheme.glassBorderGradient, lineWidth: 1))
            .shadow(color: EntfaltaTheme.leaf.opacity(0.3), radius: 8, x: 0, y: 4)
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
                SecureField("", text: $text, prompt: Text(placeholder).foregroundColor(EntfaltaTheme.textMuted))
            } else {
                TextField("", text: $text, prompt: Text(placeholder).foregroundColor(EntfaltaTheme.textMuted))
                    .keyboardType(keyboardType)
                    .autocapitalization(.none)
            }
        }
        .font(EntfaltaTheme.segoe(15))
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
        .background(
            Capsule()
                .fill(.thinMaterial)
                .overlay(Capsule().fill(EntfaltaTheme.forestGreen.opacity(0.4)))
        )
        .clipShape(Capsule())
        .overlay(Capsule().stroke(EntfaltaTheme.glassBorderGradient, lineWidth: 1))
    }
}
