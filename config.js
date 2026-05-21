// ============================================================
// CONFIG — Remplis ce fichier avec tes infos avant de déployer
// ============================================================
//
// 1. Va sur https://console.firebase.google.com/
// 2. Crée un projet (gratuit, "Spark plan")
// 3. Active "Realtime Database" en mode test (ou prod avec rules ci-dessous)
// 4. Active "Authentication > Anonymous"
// 5. Copie ta config Firebase ici (Settings > Project settings > Your apps > SDK setup)
//
// Pour les GIFs : https://tenor.com/gifapi/documentation  (gratuit, 5 min)
// ============================================================

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBkkBQ3MRRhk6sxNDHq38zpVT18HD8IbvI",
  authDomain: "cat-tchat.firebaseapp.com",
  databaseURL: "https://cat-tchat-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "cat-tchat",
  storageBucket: "cat-tchat.firebasestorage.app",
  messagingSenderId: "596294876027",
  appId: "1:596294876027:web:3416ec3687d7ca59235bde"
};

// Identifiant unique de la salle de chat (n'importe quelle chaîne secrète)
// Change-la pour avoir une autre conversation séparée
export const ROOM_ID = "salon-prive-meow-001";

// Tenor API key (https://developers.google.com/tenor/guides/quickstart)
// Optionnel : si vide, le bouton GIF affichera un message d'erreur élégant
export const TENOR_API_KEY = "";

// ============================================================
// LES DEUX PROFILS
// ============================================================
// Modifie ces deux profils : noms, mots de passe, couleur du chat, tagline
// Le "password" est juste pour empêcher l'autre de prendre ton identité — pas une vraie sécurité
// ============================================================

export const PROFILES = {
  noe: {
    id: "noe",
    name: "Noé",
    tagline: "le chat orange suspect",
    password: "matou",
    catColor: "#f4a261",      // couleur principale du chat
    catAccent: "#e76f51",     // accents (oreilles intérieures, nez, rayures)
    catEyes: "#1a1a1a",
    eyeShine: "#a8e063"       // reflet dans l'œil
  },
  ami: {
    id: "ami",
    name: "Mon ami",
    tagline: "le chat noir mystérieux",
    password: "minou",
    catColor: "#2a2a2a",
    catAccent: "#ff6b9d",
    catEyes: "#e9c46a",
    eyeShine: "#fef3e2"
  }
};
