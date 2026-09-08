import SwiftUI

struct GamesHomeView: View {
    var body: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 230), spacing: 16)], spacing: 16) {
                GameCard(title: "Emotions-Memory", subtitle: "Gesichter und Situationen zusammenfinden.", icon: MemoryPreview())
                GameCard(title: "Chaos-Sortierer", subtitle: "Farben und Formen in passende Boxen ziehen.", icon: ChaosPreview())
                GameCard(title: "Ballon-Puste", subtitle: "Halten, loslassen und Ballons steigen lassen.", icon: BalloonPreview())
            }.padding()
        }
    }
}

struct GameCard<Preview: View>: View {
    let title: String
    let subtitle: String
    let icon: Preview
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            icon.frame(height: 140).frame(maxWidth: .infinity)
            Text(title).font(.custom("Segoe Print", size: 22).bold())
            Text(subtitle).font(.caption).foregroundColor(.secondary)
            Button("Spielen") { }.primaryButtonStyle()
        }.entfaltaCard()
    }
}

struct MemoryPreview: View {
    var body: some View {
        HStack {
            ForEach(0..<3) { i in
                RoundedRectangle(cornerRadius: 18)
                    .fill(i == 1 ? EntfaltaTheme.clay.opacity(0.7) : EntfaltaTheme.leaf.opacity(0.55))
                    .overlay(FaceShape(mood: i))
            }
        }
    }
}

struct FaceShape: View {
    let mood: Int
    var body: some View {
        Canvas { ctx, size in
            let rect = CGRect(x: size.width * 0.20, y: size.height * 0.18, width: size.width * 0.60, height: size.width * 0.60)
            ctx.stroke(Path(ellipseIn: rect), with: .color(.white), lineWidth: 4)
            ctx.fill(Path(ellipseIn: CGRect(x: rect.minX + rect.width * 0.25, y: rect.minY + rect.height * 0.30, width: 6, height: 6)), with: .color(.white))
            ctx.fill(Path(ellipseIn: CGRect(x: rect.minX + rect.width * 0.65, y: rect.minY + rect.height * 0.30, width: 6, height: 6)), with: .color(.white))
            var mouth = Path()
            mouth.move(to: CGPoint(x: rect.minX + rect.width * 0.25, y: rect.minY + rect.height * 0.62))
            mouth.addQuadCurve(to: CGPoint(x: rect.minX + rect.width * 0.75, y: rect.minY + rect.height * 0.62), control: CGPoint(x: rect.midX, y: rect.minY + rect.height * (mood == 0 ? 0.82 : 0.48)))
            ctx.stroke(mouth, with: .color(.white), lineWidth: 4)
        }
    }
}

struct ChaosPreview: View {
    private let colors = [EntfaltaTheme.leaf, Color.blue, EntfaltaTheme.clay, EntfaltaTheme.brown]
    var body: some View {
        HStack(spacing: 12) {
            ForEach(colors.indices, id: \.self) { index in
                RoundedRectangle(cornerRadius: 10).fill(colors[index].opacity(0.8)).frame(width: 42, height: 42)
            }
        }
    }
}

struct BalloonPreview: View {
    var body: some View {
        VStack(spacing: 0) {
            Circle().fill(LinearGradient(colors: [.pink, EntfaltaTheme.clay], startPoint: .topLeading, endPoint: .bottomTrailing)).frame(width: 86, height: 100)
            Rectangle().fill(EntfaltaTheme.brown).frame(width: 4, height: 42)
            RoundedRectangle(cornerRadius: 14).fill(EntfaltaTheme.leaf.opacity(0.7)).frame(width: 110, height: 38)
        }
    }
}
