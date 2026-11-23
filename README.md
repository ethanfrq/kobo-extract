# kobo-extract

[![Node.js ≥ 22.13](https://img.shields.io/badge/node-%E2%89%A5%2022.13-3c873a?logo=node.js&logoColor=white)](https://nodejs.org)
[![Licence MIT](https://img.shields.io/badge/licence-MIT-blue)](LICENSE)
[![Dépendances : 1](https://img.shields.io/badge/d%C3%A9pendances-1-informational)](package.json)
![Langue : français](https://img.shields.io/badge/langue-fran%C3%A7ais-0055a4)

**Récupérez en PDF les livres libres de votre liseuse Kobo, sans jamais toucher aux livres protégés.**

kobo-extract est un petit outil en ligne de commande. Vous branchez votre Kobo en USB, il liste vos livres, vous dit lesquels sont libres, puis transforme les livres libres en PDF.

```
 _  __ ___  ___  ___        _____  _______ ___    _    ___ _____
| |/ // _ \| _ )/ _ \  ___ | __\ \/ /_   _| _ \  /_\  / __|_   _|
| ' <| (_) | _ \ (_) ||___|| _| >  <  | | |   / / _ \| (__  | |
|_|\_\\___/|___/\___/      |___/_/\_\ |_| |_|_\/_/ \_\\___| |_|

  [  OK  ] noyau kobo-extract     v1.0.0 · Node 24.11.1
  [  OK  ] pilote SQLite          node:sqlite · readOnly
  [  OK  ] décodeur EPUB/ZIP      adm-zip
  [  OK  ] détecteur DRM          Adobe · LCP · Kobo · PDF — sans déchiffrement
  [  OK  ] pont Calibre           ebook-convert trouvé

┌─[ BIBLIOTHÈQUE ]──────────────────────────────────────────────────
[1] 🔒 Achat chiffré — Noa Girard (epub · boutique)
    └─ chiffré par Kobo (référencé dans content_keys)
[2] ☁️  Achat dans le nuage — Charlie Roux (? · boutique)
    └─ pas encore téléchargé sur la liseuse
[3] ✅ Achat tatoué — Maxime Laurent (epub · boutique)
[4] ✅ Le Petit Guide libre — Camille Martin (epub · perso)
[5] ✅ Notes de cours — Alex Durand (pdf · perso)

[*] 5 livre(s) : 3 libre(s), 1 verrouillé(s), 1 non téléchargé(s)
```

> 📘 **Première utilisation ?** Le [guide utilisateur](GUIDE.md) contient deux tutoriels pas à pas, une recette pour chaque tâche, une FAQ et un glossaire.

## Fonctionnalités

- 🔍 **Détection automatique** de la liseuse sur Mac, Linux et Windows.
- 📚 **Liste complète** : les livres de la bibliothèque Kobo et les fichiers `.epub` / `.pdf` que la liseuse n’a pas encore indexés.
- 🔒 **Détection des DRM** : Adobe, LCP, chiffrement Kobo et PDF protégés par mot de passe.
- 📄 **Conversion en PDF** A5 avec numéros de page, grâce à Calibre.
- 🛡️ **Liseuse en lecture seule** : rien n’est jamais écrit sur la Kobo.
- 🧯 **Ne reste jamais bloqué** : délai maximum pour Calibre, Ctrl+C propre, solutions de secours si la base de la Kobo est verrouillée.
- 🧪 **Fausse liseuse de démonstration** avec 8 cas de test.
- 🟢 **Interface en français** au style terminal (pluie Matrix, bannière glitch, démarrage animé), désactivable avec `--sobre`.

## ⚖️ Ce que kobo-extract ne fera jamais

kobo-extract **ne contourne, ne supprime et ne déchiffre aucune DRM**. C’est interdit en France (article L.335-3-1 du Code de la propriété intellectuelle). Il détecte les verrous pour vous prévenir, sans jamais les ouvrir.

Pour un livre verrouillé acheté à la Fnac, la voie légale est la suivante : **compte Fnac → Mes ebooks → Télécharger**.

- Si vous recevez un **.epub**, le livre est libre : `npm start -- --fichier livre.epub`.
- Si vous recevez un **.acsm**, c’est une DRM Adobe : lisez le livre avec **Kobo Desktop** ou **Adobe Digital Editions**.

## Installation

**Prérequis :**

- [Node.js](https://nodejs.org) 22.13 ou plus récent ;
- [Calibre](https://calibre-ebook.com/download), recommandé pour obtenir des PDF. Sans lui, les livres sont récupérés au format EPUB.

```sh
git clone https://github.com/ethanfrq/kobo-extract.git
cd kobo-extract
npm install

# Facultatif, sur Mac :
brew install --cask calibre
```

## Démarrage rapide

```sh
npm run demo               # essai sans liseuse, sur une fausse Kobo
```

Avec votre liseuse : branchez la Kobo, touchez **« Se connecter »** sur son écran, puis :

```sh
npm start                  # liste + choix d’un livre
npm start -- --tous        # extrait tous les livres libres dans ./extraits
```

## Options

| Option | Effet |
|---|---|
| `--liste` | Affiche la liste, puis s’arrête |
| `--livre <n>` | Extrait le livre numéro *n* |
| `--tous` | Extrait tous les livres libres |
| `--fichier <fichier>` | Analyse un `.epub` ou un `.acsm` hors liseuse |
| `--sortie <dossier>` | Dossier de destination (défaut : `./extraits`) |
| `--kobo <dossier>` | Emplacement de la liseuse (sinon détection automatique) |
| `--delai <secondes>` | Temps maximum par conversion Calibre (défaut : 300) |
| `--sobre` | Sans animations |
| `-h`, `--help` | Aide |

Le `--` après `npm start` est obligatoire : il transmet les options à kobo-extract.

Légende : ✅ libre · 🔒 verrouillé · ☁️ pas encore téléchargé · ❓ illisible ou format inconnu.

Un fichier existant n’est jamais écrasé : la copie suivante s’appelle `Titre (2).pdf`.

## Comment ça marche

### Lecture de la Kobo

- La liseuse est reconnue à son dossier caché `.kobo`.
- Son catalogue est la base SQLite `.kobo/KoboReader.sqlite`, ouverte en `readOnly: true`. Les livres sont les lignes de la table `content` où `ContentType = 6`.
- Si cette base est verrouillée ou inaccessible, kobo-extract essaie trois solutions dans l’ordre : attendre le verrou, lire une copie temporaire, puis ouvrir en mode `immutable=1`.

### Détection des DRM

Le format est identifié par les **premiers octets** du fichier : `PK\x03\x04` pour un EPUB (archive ZIP), `%PDF` pour un PDF.

| Contrôle | Résultat |
|---|---|
| `META-INF/rights.xml` présent | 🔒 DRM Adobe |
| `META-INF/license.lcpl` présent | 🔒 DRM LCP |
| Livre référencé dans la table `content_keys` (les clés ne sont jamais lues) | 🔒 Chiffré par Kobo |
| `encryption.xml` avec un algorithme autre que le brouillage de polices | 🔒 Chiffré |
| Premier chapitre qui n’est pas du HTML UTF-8 lisible | 🔒 Chiffré |
| PDF avec `/Encrypt` et `EBX_HANDLER` / `ADEPT` | 🔒 DRM Adobe |
| PDF avec `/Encrypt` seul | 🔒 Mot de passe |
| Aucun de ces signes | ✅ Libre |

### Conversion

```sh
ebook-convert livre.epub livre.pdf --paper-size a5 --pdf-page-numbers
```

Calibre est cherché dans le `PATH`, puis dans `/Applications/calibre.app`. En cas d’échec, kobo-extract réessaie sans `--pdf-page-numbers`. Si ça échoue encore, il garde l’EPUB.

## Structure du projet

```
kobo-extract/
├── index.js               interface en ligne de commande
├── src/
│   ├── kobo.js            trouver la liseuse, lire la base, parcourir le disque
│   ├── drm.js             détecter les verrous (sans jamais les ouvrir)
│   ├── convertir.js       copier et convertir avec Calibre
│   └── style.js           habillage du terminal (couleurs, animations)
├── scripts/
│   └── fausse-kobo.js     générer la fausse liseuse de test (8 cas)
├── GUIDE.md               guide utilisateur
└── README.md
```

Une seule dépendance ([adm-zip](https://www.npmjs.com/package/adm-zip)). Tout le reste vient de Node : `node:sqlite`, `node:util` (`parseArgs`), `node:readline/promises` et `node:child_process`.

## Fausse liseuse de test

`npm run demo` crée `./fausse-kobo` avec ces 8 cas :

| # | Cas | Attendu |
|---|---|---|
| 1 | EPUB perso (police brouillée) | ✅ libre |
| 2 | PDF perso | ✅ libre |
| 3 | EPUB avec `rights.xml` | 🔒 Adobe |
| 4 | PDF avec `/Encrypt` `EBX_HANDLER` | 🔒 Adobe |
| 5 | `.kepub.epub` non indexé | ✅ libre |
| 6 | Achat tatoué sans DRM (`.kobo/kepub`) | ✅ libre |
| 7 | Achat chiffré (`content_keys`) | 🔒 Kobo |
| 8 | Achat dans la base, absent du disque | ☁️ non téléchargé |

## Licence

[MIT](LICENSE). Usage personnel : respectez les droits des auteurs et des éditeurs.
