# kobo-extract

Petit outil en ligne de commande qui :

1. trouve une liseuse **Kobo** branchée en USB ;
2. liste ses livres et détecte lesquels sont protégés par une **DRM** ;
3. extrait en **PDF** uniquement les livres **libres**.

```
 _  __ ___  ___  ___        _____  _______ ___    _    ___ _____
| |/ // _ \| _ )/ _ \  ___ | __\ \/ /_   _| _ \  /_\  / __|_   _|
| ' <| (_) | _ \ (_) ||___|| _| >  <  | | |   / / _ \| (__  | |
|_|\_\\___/|___/\___/      |___/_/\_\ |_| |_|_\/_/ \_\\___| |_|
```

## ⚖️ Ce que le programme ne fera jamais

- Il **ne contourne, ne supprime et ne déchiffre jamais** une DRM. Contourner une DRM est interdit en France (art. L.335-3-1 du Code de la propriété intellectuelle).
- Il **n’écrit jamais sur la liseuse** : la base SQLite est ouverte en `readOnly: true` et les fichiers sont seulement lus.

Pour un livre verrouillé, la voie légale est la suivante : **compte Fnac → Mes ebooks → Télécharger**.

- Si vous recevez un **.epub**, le livre est libre : relancez avec `--fichier <livre.epub>`.
- Si vous recevez un **.acsm**, c’est une DRM Adobe : lisez le livre avec **Kobo Desktop** ou **Adobe Digital Editions**.

## Installation

Prérequis :

- **Node.js 22.13 ou plus récent** ;
- **Calibre** (facultatif), pour convertir les EPUB en PDF :

  ```sh
  brew install --cask calibre     # Mac
  sudo apt install calibre        # Linux
  ```

Ensuite :

```sh
npm install
```

Sans Calibre, les livres EPUB sont quand même copiés au format `.epub`.

## Utilisation

1. Branchez la Kobo et touchez **« Se connecter »** sur son écran.
2. Lancez l’outil :

```sh
npm start                                  # liste + choix interactif
npm start -- --liste                       # liste seulement
npm start -- --livre 3                     # extrait le livre n°3
npm start -- --tous                        # extrait tous les livres libres
npm start -- --fichier ~/Downloads/x.epub  # analyse un fichier hors liseuse
npm start -- --sortie ~/Documents/livres   # change le dossier de sortie
npm start -- --kobo /chemin/vers/kobo      # indique la liseuse à la main
npm start -- --tous --delai 900            # laisse 15 min max à Calibre par livre
npm start -- -h                            # aide
```

Légende : ✅ libre · 🔒 verrouillé · ☁️ pas encore téléchargé · ❓ format inconnu.

Les fichiers extraits vont dans `./extraits`. Un fichier existant n’est jamais écrasé : la copie s’appelle alors `Titre (2).pdf`.

## Démo sans liseuse

```sh
npm run demo
```

Cette commande crée une fausse Kobo dans `./fausse-kobo`, avec 8 cas de test, puis lance l’outil dessus :

| # | Cas | Résultat attendu |
|---|-----|------------------|
| 1 | EPUB perso (police brouillée) | ✅ libre |
| 2 | PDF perso | ✅ libre |
| 3 | EPUB avec `META-INF/rights.xml` | 🔒 DRM Adobe |
| 4 | PDF avec `/Encrypt` `EBX_HANDLER` | 🔒 DRM Adobe |
| 5 | `.kepub.epub` pas encore indexé | ✅ libre |
| 6 | Achat tatoué sans DRM (`.kobo/kepub`) | ✅ libre |
| 7 | Achat chiffré (`content_keys`) | 🔒 chiffré par Kobo |
| 8 | Achat dans la base, absent du disque | ☁️ pas téléchargé |

## Comment ça marche

| Fichier | Rôle |
|---------|------|
| `index.js` | Interface en ligne de commande (options, liste, questions) |
| `src/kobo.js` | Trouve la liseuse, lit la base SQLite, parcourt le disque |
| `src/drm.js` | Détecte les verrous sans jamais les ouvrir |
| `src/convertir.js` | Copie les livres libres et appelle Calibre |
| `src/style.js` | Habillage du terminal (couleurs, bannière, traces) |
| `scripts/fausse-kobo.js` | Génère la fausse liseuse de test |

### Détection des DRM

Le format est identifié par les **premiers octets** du fichier : `PK\x03\x04` pour un EPUB (archive ZIP), `%PDF` pour un PDF.

**EPUB** (contrôles effectués dans cet ordre) :

1. `META-INF/rights.xml` présent → DRM Adobe.
2. `META-INF/license.lcpl` présent → DRM LCP.
3. Livre présent dans la table `content_keys` → chiffré par Kobo. Seule la présence est vérifiée : les clés ne sont jamais lues.
4. `META-INF/encryption.xml` contient un algorithme autre que le simple brouillage de polices → chiffré.
5. Le premier chapitre n’est pas du HTML lisible en UTF-8 → chiffré.

**PDF** :

- pas de `/Encrypt` → libre ;
- `EBX_HANDLER` ou `ADEPT` → DRM Adobe ;
- sinon → protégé par mot de passe.

Pour couper les couleurs : `NO_COLOR=1 npm start`.

## En cas de problème

Le programme ne doit jamais rester bloqué. Voici ce qu’il fait dans chaque situation.

| Situation | Ce que fait kobo-extract |
|-----------|--------------------------|
| La Kobo écrit dans sa base au même moment (base verrouillée) | Il attend 5 s. Si c’est toujours verrouillé, il lit une **copie temporaire** de la base, puis l’efface. |
| La liseuse est montée en lecture seule | Même solution : il lit une copie temporaire. En dernier recours, il ouvre la base en mode `immutable=1`. |
| La base est illisible | Il continue avec les seuls fichiers trouvés sur le disque. |
| Un fichier est illisible (droits, secteur abîmé…) | Le livre est marqué ❓ et les autres livres sont quand même analysés. |
| Calibre ne répond plus | Il l’arrête au bout de `--delai` secondes (300 par défaut), sous-processus compris, et garde l’EPUB. |
| Calibre échoue | Il réessaie sans `--pdf-page-numbers`. Si ça échoue encore, il garde l’EPUB. |
| Ctrl+C pendant une conversion | Il arrête Calibre, supprime le PDF à moitié écrit et se termine avec le code 130. |
| Ctrl+C ou entrée fermée pendant la question | Il quitte proprement, sans rien extraire. |
| Très gros PDF | Il le lit par blocs de 1 Mo : la mémoire n’est jamais saturée. |
