// ============================================================
// CONFIG
// ============================================================
// Firebase config (déjà rempli, ne pas modifier sauf nouveau projet)
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

// Identifiant unique de la salle de chat
export const ROOM_ID = "room-prive-001";

// ============================================================
// PROFILS — deux personnes qui partagent ce chat
// ============================================================
// Chaque appareil mémorise son identité après une première visite
// via ?me=noe ou ?me=ami dans l'URL. Aucun login visible ensuite.
// ============================================================

export const PROFILES = {
  noe: {
    id: "noe",
    name: "Noé",                  // ton prénom affiché en bas de la sidebar
    accountColor: "#b76e00",      // couleur du cercle avatar
    showTypingLabel: true         // "X is typing" visible ou pas
  },
  ami: {
    id: "ami",
    name: "Camille",              // remplace par le prénom de ton ami
    accountColor: "#5b6cf5",
    showTypingLabel: true
  }
};

// Identité par défaut (si pas de ?me= et pas de localStorage)
// Mets l'id de la personne qui utilise le plus souvent ce site sur cet appareil.
export const DEFAULT_IDENTITY = "noe";
