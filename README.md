# 🐱 Cat Chat — Pixel Art Edition

Un site de chat 1-to-1 entre deux amis, theme pixel art 8-bit, avec messages en temps réel, GIFs et réactions emoji. Hébergé sur GitHub Pages, backend gratuit via Firebase.

![Cat Chat preview](https://img.shields.io/badge/style-pixel%20art-ff6b9d) ![Firebase](https://img.shields.io/badge/backend-Firebase-orange) ![GitHub Pages](https://img.shields.io/badge/host-GitHub%20Pages-blue)

---

## ✨ Features

- Deux profils pré-configurés avec mot de passe (toi + ton ami)
- Messages temps réel via Firebase Realtime Database
- Indicateur "en train d'écrire..." en live
- Présence "en ligne / hors ligne"
- Réactions emoji sur n'importe quel message (clic sur la bulle)
- Envoi de GIFs (recherche Tenor)
- Mini emoji picker dans le composer
- Sons rétro 8-bit à l'envoi/réception (toggle)
- Pixel cats animés qui se baladent sur l'écran de login
- 100% client-side, hébergeable sur GitHub Pages

---

## 🚀 Setup en 4 étapes

### 1. Créer un projet Firebase (gratuit, ~3 min)

1. Va sur https://console.firebase.google.com/
2. Clique "Add project" → donne-lui un nom (ex: `cat-chat-noe`)
3. Désactive Google Analytics (pas nécessaire)
4. Une fois le projet créé :
   - **Build → Authentication → Get started → Sign-in method → Anonymous → Enable**
   - **Build → Realtime Database → Create Database**
     - Région : Belgium (europe-west1) ou la plus proche
     - Mode : **Start in test mode** (on durcira après)
5. Sur la page d'accueil du projet, clique **l'icône `</>`** ("Add app — Web")
   - Donne un nom (ex: `cat-chat-web`)
   - **Copie l'objet `firebaseConfig`** affiché

### 2. Configurer le projet

Ouvre **`config.js`** et remplace :

```js
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSy...",                              // ← ta vraie clé
  authDomain: "cat-chat-noe.firebaseapp.com",
  databaseURL: "https://cat-chat-noe-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "cat-chat-noe",
  storageBucket: "cat-chat-noe.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abc123def456"
};
```

Puis modifie les **deux profils** :

```js
export const PROFILES = {
  noe: {
    id: "noe",
    name: "Noé",                  // ton prénom
    tagline: "le chat orange",    // une phrase fun
    password: "matou",            // ton mot de passe
    catColor: "#f4a261",          // couleur du chat
    catAccent: "#e76f51",
    catEyes: "#1a1a1a",
    eyeShine: "#a8e063"
  },
  ami: {
    id: "ami",
    name: "Camille",              // prénom de ton ami
    password: "minou",            // mot de passe de ton ami
    // ... idem
  }
};
```

> 💡 Choisis aussi un `ROOM_ID` unique (n'importe quelle chaîne). Si quelqu'un d'autre devine ton API key Firebase, il faudra qu'il devine aussi ce `ROOM_ID` pour accéder à vos messages.

### 3. (Optionnel) Activer les GIFs Tenor

1. Va sur https://developers.google.com/tenor/guides/quickstart
2. Crée une clé API Tenor (gratuit, instant via Google Cloud)
3. Colle-la dans `config.js` :

```js
export const TENOR_API_KEY = "AIzaSy...";
```

Sans cette clé, le bouton GIF affiche un message d'erreur élégant. Le reste fonctionne.

### 4. Déployer sur GitHub Pages

```bash
# Dans le dossier pixel-cat-chat
git init
git add .
git commit -m "Initial cat chat"

# Crée un repo sur github.com (par ex. "cat-chat") puis :
git branch -M main
git remote add origin git@github.com:TON-USERNAME/cat-chat.git
git push -u origin main
```

Puis sur GitHub :
- **Settings → Pages**
- **Source : Deploy from a branch**
- **Branch : main / (root)**
- **Save**

Attends 1-2 minutes. Ton site sera dispo à :
`https://TON-USERNAME.github.io/cat-chat/`

Donne cette URL à ton ami. Vous êtes en chat. 🎉

---

## 🔒 Sécuriser la base Firebase (recommandé)

Une fois que ça marche, change les règles de la Realtime Database pour limiter l'accès :

**Realtime Database → Rules → colle ceci → Publish :**

```json
{
  "rules": {
    "rooms": {
      "$roomId": {
        ".read": "auth != null",
        ".write": "auth != null",
        "messages": {
          "$msgId": {
            ".validate": "newData.hasChildren(['author', 'ts'])"
          }
        }
      }
    }
  }
}
```

Cela bloque l'accès à toute personne non authentifiée. L'app s'authentifie automatiquement via Anonymous Auth.

> ⚠️ Le `password` des profils est vérifié **côté client** uniquement. C'est suffisant pour empêcher ton ami de prendre ton identité par mégarde, mais ce n'est PAS une vraie sécurité. La vraie sécurité vient de la combo `apiKey + ROOM_ID` qui reste secrète entre vous deux.

---

## 🛠 Structure du projet

```
pixel-cat-chat/
├── index.html       # markup (login + chat screens)
├── styles.css       # styles pixel art 8-bit
├── app.js           # logique Firebase + chat
├── config.js        # ⚙️ TA config (Firebase + profils) — à remplir
├── README.md        # ce fichier
└── .nojekyll        # désactive Jekyll sur GitHub Pages
```

Tout le code est en module ES natif, pas de build, pas de npm.

---

## 🎨 Personnalisation

- **Couleurs des chats** : `catColor`, `catAccent`, `catEyes`, `eyeShine` dans `config.js`
- **Palette globale** : variables CSS au début de `styles.css` (`--orange`, `--mint`, etc.)
- **Emojis du picker** : modifie `.emoji-pick` dans `index.html`
- **Sons** : `playSound()` dans `app.js` (synthèse WebAudio, pas de fichier mp3)
- **Pixel cats animés** : SVG inline dans `index.html`, section `.cat-floor`

---

## ❓ FAQ

**Combien de messages je peux stocker gratuitement ?**
Le plan gratuit Firebase (Spark) offre 1 GB de stockage + 10 GB/mois de transfert. Pour un chat entre 2 personnes, ça fait littéralement des millions de messages avant de payer.

**On peut être plus de 2 ?**
Pas tel quel — le code suppose exactement deux profils. Mais il suffit d'ajouter d'autres entrées dans `PROFILES` et l'écran de login affichera plus de chats. La logique "online status" se base déjà sur `profile.id`.

**Pourquoi pas WhatsApp / iMessage / Discord ?**
Parce qu'on a fait un site qui nous ressemble. Et les chats pixelisés.

---

## 📜 Licence

MIT — fais-en ce que tu veux.

Made with 🐾 and `Press Start 2P`.
