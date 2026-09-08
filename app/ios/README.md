# Entfalta iOS App

Native SwiftUI-App für iPhone und iPad.

## Öffnen

1. Auf einem Mac `app/ios/EntfaltaApp.xcodeproj` öffnen.
2. In Xcode bei **Signing & Capabilities** dein Team auswählen.
3. Bundle Identifier bei Bedarf ändern, z.B. `com.entfalta.app`.
4. Falls du die offiziellen Firebase SDKs nutzen willst: **File > Add Package Dependencies** öffnen und `https://github.com/firebase/firebase-ios-sdk` hinzufügen. Mindestens `FirebaseCore` auswählen.
5. Auf iPad/iPhone Simulator oder echtem Gerät starten.

## Enthalten

- Login und Registrierung per Firebase Auth REST.
- Kunden-Shop mit Produkten aus Firestore.
- Warenkorb mit Stripe-Checkout über `https://backend.entfalta.com`.
- Konto-Einstellungen mit Adresse: Straße, PLZ und Stadt getrennt.
- Admin-Modus, wenn im Firestore-Profil `admin: true` gesetzt ist.
- Adminbereiche für Statistiken, Gutscheine, ISBNs, Produkte, Bestellungen, Newsletter und Lieferung als native Views.
- Spiele-Startseite im Entfalta-Stil.
- Entfalta-Logo und `segoepr.ttf` aus der Webseite als Ressourcen.
- `GoogleService-Info.plist` ist im Projekt eingebunden und `FirebaseApp.configure()` wird beim App-Start aufgerufen, sobald `FirebaseCore` installiert ist.

## Wichtig

Die App nutzt aktuell bewusst keine CocoaPods/SPM-Abhängigkeiten. Google Login, Push Notifications, echte Firestore-Realtime-Listener und verschlüsselte Offline-E-Books brauchen später die offiziellen Firebase/Google SDKs in Xcode. Die REST-Basis ist aber schon nativ und greift auf dieselben Daten wie Webseite/Android zu.
