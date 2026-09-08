window.BUCHMARKT_FIREBASE_PROJECTS = {
  main: {
    label: "Shop, Nutzerverwaltung, Profile, Live-Daten",
    config: {
      apiKey: "AIzaSyC2iYmnGxBZXEa1lFyWvYo5Yu8_f-N5yeE",
      authDomain: "entfalta-cd92d.firebaseapp.com",
      projectId: "entfalta-cd92d",
      databaseURL: "https://entfalta-cd92d-default-rtdb.europe-west1.firebasedatabase.app",
      messagingSenderId: "124609031267",
      appId: "1:124609031267:web:5dca07ffbdc9fd3ee6dc56"
    }
  },
  pdfAssets: {
    label: "PDFs und Lernmaterialien",
    config: {
      apiKey: "AIzaSyCpd2oLcjrXa9NdN957tPPc5RVO1huSEJY",
      authDomain: "entfalta-database-pdfs.firebaseapp.com",
      projectId: "entfalta-database-pdfs",
      databaseURL: "https://entfalta-database-pdfs-default-rtdb.europe-west1.firebasedatabase.app/",
      storageBucket: "entfalta-database-pdfs.firebasestorage.app",
      messagingSenderId: "518374849684",
      appId: "1:518374849684:web:34bcba75a582fee0690881"
    }
  },
  mediaAssets: {
    label: "Cover, Produktbilder und Vorschauseiten",
    config: {
      apiKey: "AIzaSyBYUzX0wMP3tw4r04fHgOKOqsB0w6SK2qo",
      authDomain: "entfalta-database-covers-co.firebaseapp.com",
      projectId: "entfalta-database-covers-co",
      databaseURL: "https://entfalta-database-covers-co-default-rtdb.europe-west1.firebasedatabase.app",
      storageBucket: "entfalta-database-covers-co.firebasestorage.app",
      messagingSenderId: "18754528220",
      appId: "1:18754528220:web:e848e9277e8fb0017b6519"
    }
  }
};

window.BUCHMARKT_FIREBASE_CONFIG = window.BUCHMARKT_FIREBASE_PROJECTS.main.config;

// Leer lassen = Backend liegt auf derselben Domain wie die Webseite.
// Wenn du das Backend separat deployen willst, hier z.B. eintragen:
// window.BUCHMARKT_BACKEND_BASE_URL = "https://dein-backend.netlify.app";
window.BUCHMARKT_BACKEND_BASE_URL = "https://entfalta-back.netlify.app";
