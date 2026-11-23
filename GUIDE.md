# kobo-extract — Guide utilisateur

> **En une phrase** : kobo-extract regarde les livres de votre liseuse Kobo, vous dit lesquels sont libres, et transforme les livres libres en PDF sur votre ordinateur.

**Sommaire**

- [Qu’est-ce que kobo-extract ?](#quest-ce-que-kobo-extract-)
- [Tutoriel 1 — Essayer sans liseuse (5 minutes)](#tutoriel-1--essayer-sans-liseuse-5-minutes)
- [Tutoriel 2 — Récupérer les livres de votre Kobo](#tutoriel-2--récupérer-les-livres-de-votre-kobo)
- [Guides pratiques](#guides-pratiques)
- [Référence](#référence)
- [Questions fréquentes](#questions-fréquentes)
- [Glossaire](#glossaire)
- [Pourquoi kobo-extract fonctionne ainsi](#pourquoi-kobo-extract-fonctionne-ainsi)

---

## Qu’est-ce que kobo-extract ?

Vous branchez votre liseuse Kobo sur votre Mac. kobo-extract :

1. **trouve** la liseuse tout seul ;
2. **liste** vos livres avec un symbole pour chacun :
   - ✅ **libre** : vous pouvez le récupérer ;
   - 🔒 **verrouillé** : il est protégé, kobo-extract n’y touche pas ;
   - ☁️ **pas encore téléchargé** : il est dans votre bibliothèque, mais pas encore sur la liseuse ;
3. **copie** les livres libres sur votre ordinateur et les **transforme en PDF** (format A5, pages numérotées).

Deux garanties :

- **Votre liseuse n’est jamais modifiée.** kobo-extract ne fait que lire.
- **Aucun verrou n’est contourné.** C’est interdit par la loi française. Pour un livre verrouillé, kobo-extract vous indique la marche légale à suivre.

---

## Tutoriel 1 — Essayer sans liseuse (5 minutes)

Ce tutoriel vous fait découvrir kobo-extract avec une **fausse liseuse** créée sur votre ordinateur. Vous ne risquez rien et vous n’avez pas besoin de votre Kobo.

**À la fin**, vous aurez vu la liste des livres, extrait un livre libre et vu ce qui se passe avec un livre verrouillé.

### Étape 1 — Ouvrir le Terminal dans le bon dossier

1. Ouvrez l’application **Terminal**. Pour la trouver : `Cmd` + `Espace`, tapez « Terminal », puis `Entrée`.
2. Récupérez le programme (une seule fois), puis entrez dans son dossier :

   ```sh
   git clone https://github.com/ethanfrq/kobo-extract.git
   cd kobo-extract
   ```

   Si vous l’avez déjà, allez simplement dans son dossier avec `cd`.

### Étape 2 — Installer (une seule fois)

```sh
npm install
```

Le message se termine par `found 0 vulnerabilities` : c’est prêt.

> Si vous voyez `command not found: npm`, installez d’abord Node.js : voir [Installer Node.js](#installer-nodejs).

### Étape 3 — Lancer la démo

```sh
npm run demo
```

Regardez le spectacle :

- une **pluie de caractères verts** tombe ;
- le titre **KOBO-EXTRACT** apparaît en se brouillant, puis devient net ;
- les modules se chargent, chacun avec sa barre de progression ;
- enfin, la liste des livres s’affiche :

```
[1] 🔒 Achat chiffré — Noa Girard (epub · boutique)
    └─ chiffré par Kobo (référencé dans content_keys)
[2] ☁️  Achat dans le nuage — Charlie Roux (? · boutique)
    └─ pas encore téléchargé sur la liseuse
[3] ✅ Achat tatoué — Maxime Laurent (epub · boutique)
[4] ✅ Le Petit Guide libre — Camille Martin (epub · perso)
[5] ✅ Notes de cours — Alex Durand (pdf · perso)
[6] ✅ Nouveau livre (epub · perso · non indexé)
[7] 🔒 Rapport Adobe — Sacha Bernard (pdf · perso)
    └─ DRM Adobe (EBX_HANDLER)
[8] 🔒 Roman Adobe — Dominique Petit (epub · perso)
    └─ DRM Adobe (META-INF/rights.xml)

[*] 8 livre(s) : 4 libre(s), 3 verrouillé(s), 1 non téléchargé(s)
```

### Étape 4 — Extraire un livre libre

Le programme vous pose une question :

```
kobo-extract> numéro du livre (t = tous les libres, q = quitter) :
```

Tapez **`5`** puis `Entrée`. Vous voyez :

```
[+] Écrit : …/kobo-extract/extraits/Alex Durand - Notes de cours.pdf
```

Ouvrez le dossier pour voir votre PDF :

```sh
open extraits
```

🎉 Vous avez extrait votre premier livre.

### Étape 5 — Voir ce qui se passe avec un livre verrouillé

Relancez la démo, et cette fois tapez **`8`** (Roman Adobe) :

```sh
npm run demo
```

kobo-extract refuse poliment et vous explique la marche légale :

```
[!] 🔒 DRM Adobe (META-INF/rights.xml)
    Contourner une DRM est interdit en France (art. L.335-3-1 …).
    kobo-extract ne le fera pas.
    Voie légale : compte Fnac → Mes ebooks → Télécharger.
```

Rien n’a été copié : c’est voulu.

**Bravo, vous connaissez l’essentiel.** Passez au tutoriel 2 pour utiliser votre vraie liseuse.

---

## Tutoriel 2 — Récupérer les livres de votre Kobo

**À la fin**, tous vos livres libres seront en PDF dans le dossier `extraits`.

### Étape 1 — Installer Calibre (une seule fois, recommandé)

Calibre est le logiciel gratuit qui transforme les livres en PDF. Sans lui, vous récupérez quand même vos livres, mais au format EPUB.

```sh
brew install --cask calibre
```

> Pas de `brew` ? Téléchargez Calibre sur <https://calibre-ebook.com/download> et glissez-le dans **Applications**.

### Étape 2 — Brancher la liseuse

1. Branchez la Kobo sur le Mac avec son câble USB.
2. Sur l’écran de la Kobo, touchez **« Se connecter »**.
3. Sur le Mac, une icône **KOBOeReader** apparaît dans le Finder.

### Étape 3 — Voir vos livres

```sh
cd kobo-extract
npm start -- --liste
```

La liste de vos livres s’affiche, avec ✅, 🔒 ou ☁️ devant chacun.

> ⚠️ Le `--` entre `npm start` et `--liste` est obligatoire : il indique que la suite est destinée à kobo-extract.

### Étape 4 — Tout extraire d’un coup

```sh
npm start -- --tous
```

Pour chaque livre libre, vous voyez la copie puis la conversion (une petite roue tourne avec un chronomètre). À la fin :

```
[+] 12/12 livre(s) libre(s) extrait(s) dans …/kobo-extract/extraits
```

### Étape 5 — Débrancher

Dans le Finder, cliquez sur ⏏ à côté de **KOBOeReader**, puis débranchez le câble.

✅ Vos PDF sont dans le dossier `extraits`.

---

## Guides pratiques

Des recettes courtes pour une tâche précise. Chaque commande se tape dans le Terminal, depuis le dossier `kobo-extract`.

### Extraire un seul livre

1. Affichez la liste : `npm start -- --liste`
2. Repérez le numéro du livre, par exemple `[3]`.
3. Lancez :

   ```sh
   npm start -- --livre 3
   ```

### Extraire tous les livres libres

```sh
npm start -- --tous
```

Les livres verrouillés et non téléchargés sont ignorés automatiquement.

### Garder seulement l’EPUB (sans PDF)

```sh
npm start -- --tous --format epub
```

Les livres EPUB sont copiés en `.epub`, sans conversion, donc sans Calibre et très vite. Un livre qui est déjà un PDF est copié tel quel, car un PDF ne se transforme pas en EPUB.

### Choisir où ranger les livres

Par défaut, les livres vont dans le dossier `extraits`. Pour les mettre ailleurs :

```sh
npm start -- --tous --sortie ~/Documents/MesLivres
```

Le dossier est créé s’il n’existe pas.

### Récupérer un livre verrouillé (la voie légale)

1. Allez sur **fnac.com** et connectez-vous.
2. Ouvrez **Mon compte → Mes ebooks**.
3. Cliquez sur **Télécharger** à côté du livre.
4. Regardez le fichier reçu dans votre dossier **Téléchargements** :
   - **fichier `.epub`** : le livre est libre. Faites-le analyser :

     ```sh
     npm start -- --fichier ~/Downloads/mon-livre.epub
     ```

   - **fichier `.acsm`** : ce n’est pas le livre, c’est un ticket de protection Adobe. Ouvrez-le avec **Adobe Digital Editions** ou **Kobo Desktop** pour lire le livre. kobo-extract ne pourra pas le convertir.

### Récupérer un livre pas encore téléchargé

1. Débranchez la Kobo.
2. Activez le Wi-Fi de la liseuse.
3. Ouvrez le livre une fois : il se télécharge.
4. Rebranchez la Kobo et relancez kobo-extract.

### Analyser un livre qui n’est pas sur la liseuse

```sh
npm start -- --fichier ~/Downloads/livre.epub
```

kobo-extract dit s’il est libre et, si oui, l’extrait.

### Indiquer la liseuse à la main

Si la liseuse n’est pas trouvée automatiquement :

```sh
npm start -- --kobo /Volumes/KOBOeReader
```

### Laisser plus de temps à la conversion

Un très gros livre peut dépasser le temps maximum (5 minutes par livre). Pour attendre 15 minutes :

```sh
npm start -- --tous --delai 900
```

### Lancer sans les animations

```sh
npm start -- --sobre
```

Le programme démarre tout de suite, avec une simple ligne de titre.

### Arrêter en cours de route

Appuyez sur `Ctrl` + `C`. kobo-extract s’arrête proprement. Il ne laisse aucun PDF à moitié écrit, et les livres déjà extraits sont gardés.

### Installer Node.js

kobo-extract a besoin de Node.js version 22.13 ou plus récente.

```sh
brew install node
node --version     # doit afficher v22.13 ou plus
```

Sans `brew` : téléchargez la version « LTS » sur <https://nodejs.org>.

---

## Référence

### Toutes les options

| Option | Ce qu’elle fait | Exemple |
|---|---|---|
| *(aucune)* | Affiche la liste, puis demande un numéro | `npm start` |
| `--liste` | Affiche la liste, puis s’arrête | `npm start -- --liste` |
| `--livre <n>` | Extrait le livre numéro *n* | `npm start -- --livre 3` |
| `--tous` | Extrait tous les livres libres | `npm start -- --tous` |
| `--fichier <fichier>` | Analyse un `.epub` ou un `.acsm` hors liseuse | `npm start -- --fichier livre.epub` |
| `--sortie <dossier>` | Change le dossier de destination (défaut : `extraits`) | `npm start -- --tous --sortie ~/Livres` |
| `--format <pdf\|epub>` | `pdf` : EPUB + PDF (défaut) · `epub` : EPUB seulement | `npm start -- --tous --format epub` |
| `--kobo <dossier>` | Indique où est la liseuse | `npm start -- --kobo /Volumes/KOBOeReader` |
| `--delai <secondes>` | Temps maximum par conversion (défaut : 300) | `npm start -- --tous --delai 900` |
| `--sobre` | Sans animations | `npm start -- --sobre` |
| `-h` | Affiche l’aide | `npm start -- -h` |

### Réponses possibles à la question

Quand kobo-extract demande `numéro du livre (t = tous les libres, q = quitter)` :

| Vous tapez | Résultat |
|---|---|
| un numéro (`3`) | extrait ce livre |
| `t` | extrait tous les livres libres |
| `q` ou `Entrée` seule | quitte sans rien extraire |

### Les symboles de la liste

| Symbole | Signification | Que faire ? |
|---|---|---|
| ✅ | Livre libre | L’extraire |
| 🔒 | Livre verrouillé (DRM) | [Voie légale Fnac](#récupérer-un-livre-verrouillé-la-voie-légale) |
| ☁️ | Pas encore sur la liseuse | [Le télécharger sur la Kobo](#récupérer-un-livre-pas-encore-téléchargé) |
| ❓ | Fichier illisible, format inconnu, ou livre rangé sur la carte microSD | Voir la [FAQ](#un-livre-est-marqué-fichier-illisible) |

Entre parenthèses, à côté du titre :

| Mention | Signification |
|---|---|
| `epub` / `pdf` | Format du livre |
| `perso` | Livre que vous avez copié vous-même sur la Kobo |
| `boutique` | Livre acheté sur la boutique Kobo / Fnac |
| `non indexé` | Livre présent sur la Kobo, que la liseuse n’a pas encore rangé dans sa bibliothèque |

### Les messages à l’écran

| Début du message | Signification |
|---|---|
| `[+]` vert | Réussi |
| `[*]` cyan | Information |
| `[!]` jaune | Attention : à lire |
| `[x]` rouge | Erreur |
| `$ …` | Commande que kobo-extract exécute (pour info) |
| `│ […]` gris | Détail de ce que fait kobo-extract (pour info) |

### Ce que vous trouvez dans le dossier `extraits`

| Livre d’origine | Fichiers obtenus |
|---|---|
| PDF libre | `Auteur - Titre.pdf` |
| EPUB libre, avec Calibre | `Auteur - Titre.epub` + `Auteur - Titre.pdf` |
| EPUB libre, sans Calibre | `Auteur - Titre.epub` seulement |
| EPUB libre, avec `--format epub` | `Auteur - Titre.epub` seulement |
| PDF libre, avec `--format epub` | `Auteur - Titre.pdf` (copié tel quel) |

Un fichier existant n’est **jamais remplacé** : la nouvelle copie s’appelle `Titre (2).pdf`, `Titre (3).pdf`…

---

## Questions fréquentes

### « Aucune liseuse Kobo détectée »

- Avez-vous touché **« Se connecter »** sur l’écran de la Kobo ?
- L’icône **KOBOeReader** est-elle visible dans le Finder ? Si non, essayez un autre câble ou un autre port USB.
- Vous pouvez aussi indiquer la liseuse à la main : `npm start -- --kobo /Volumes/KOBOeReader`.

### « Calibre est introuvable »

Vos livres EPUB ont bien été copiés, mais pas transformés en PDF. Installez Calibre (`brew install --cask calibre`), puis relancez.

### « Calibre n’a pas fini en 300s »

Le livre est très gros, ou Calibre s’est bloqué. kobo-extract l’a arrêté et a gardé l’EPUB. Relancez avec plus de temps : `--delai 900`.

### « La conversion a échoué »

kobo-extract a déjà fait un deuxième essai avec des réglages plus simples. L’EPUB est gardé dans `extraits` : vous pouvez le lire tel quel, ou l’ouvrir dans Calibre pour le convertir à la main.

### Un livre est marqué fichier illisible

Le fichier n’a pas pu être lu. Le plus souvent, la liseuse a été débranchée trop tôt ou le fichier est abîmé. Éjectez proprement la Kobo, rebranchez-la, puis relancez. Les autres livres ne sont pas concernés.

### Un livre est marqué « sur la carte microSD »

Certaines Kobo ont une carte microSD. Les livres rangés dessus ne sont pas dans le dossier de la liseuse que voit l’ordinateur. Retirez la carte, insérez-la dans le Mac (avec un adaptateur si besoin), puis analysez le livre :

```sh
npm start -- --fichier "/Volumes/NO NAME/Livres/mon-livre.epub"
```

### « Impossible de lire la base de la Kobo »

La liseuse était peut-être occupée à ranger ses livres. kobo-extract continue quand même avec les fichiers qu’il trouve. Pour avoir la liste complète, attendez que la Kobo ait fini, puis éjectez-la, rebranchez-la et relancez.

### « Numéro invalide »

Le numéro tapé n’est pas dans la liste. Tapez un numéro affiché entre crochets, par exemple `3` pour `[3]`.

### `option inconnue`

Vérifiez l’orthographe de l’option et la présence du `--` après `npm start`. Bonne forme : `npm start -- --liste`.

### Est-ce que kobo-extract peut abîmer ma liseuse ?

Non. Il ne fait que lire : il n’écrit, ne déplace et ne supprime rien sur la Kobo.

### Est-ce que kobo-extract peut débloquer mes livres 🔒 ?

Non, et il ne le fera jamais : c’est interdit en France. Suivez la [voie légale Fnac](#récupérer-un-livre-verrouillé-la-voie-légale).

### Pourquoi un livre acheté est-il ✅ libre ?

Certains éditeurs vendent leurs livres sans verrou. Ils sont parfois « tatoués » : votre nom ou un numéro est inscrit dans le livre. Ce n’est pas un verrou, vous pouvez l’extraire. Gardez-le pour votre usage personnel.

### Les animations me ralentissent

Ajoutez `--sobre` : `npm start -- --tous --sobre`.

---

## Glossaire

| Terme | Définition simple |
|---|---|
| **DRM** | Verrou numérique posé sur un livre acheté. Il empêche de le copier ou de le lire ailleurs. |
| **DRM Adobe** | Le verrou le plus courant dans les livres vendus par la Fnac. |
| **EPUB** | Format de livre numérique le plus courant (fichier `.epub`). |
| **kepub** | Variante d’EPUB utilisée par Kobo pour les livres achetés. |
| **ACSM** | Petit fichier « ticket » qui permet de télécharger un livre protégé par Adobe. Ce n’est pas le livre lui-même. |
| **PDF** | Format de document qui garde la même mise en page partout. |
| **A5** | Format de page de 14,8 × 21 cm, proche de celui d’un livre de poche. |
| **Calibre** | Logiciel gratuit de gestion de livres numériques. kobo-extract s’en sert pour créer les PDF. |
| **Tatouage** | Marque (nom, numéro) inscrite dans un livre acheté. Ce n’est pas un verrou. |
| **Terminal** | Application du Mac où l’on tape des commandes. |
| **Non indexé** | Livre présent sur la Kobo, que la liseuse n’a pas encore ajouté à sa bibliothèque. |

---

## Pourquoi kobo-extract fonctionne ainsi

### Pourquoi refuser les livres verrouillés ?

En France, l’article L.335-3-1 du Code de la propriété intellectuelle interdit de contourner une DRM, même pour un livre que vous avez payé. kobo-extract respecte la loi. Il **détecte** les verrous pour vous prévenir, mais ne les **ouvre** jamais. La Fnac propose une voie légale, et c’est celle que kobo-extract vous indique.

### Pourquoi ne rien écrire sur la liseuse ?

La liseuse range vos livres et votre progression de lecture dans un fichier interne. Le moindre changement pourrait lui faire perdre votre bibliothèque. kobo-extract se contente donc de lire, et il travaille sur une copie temporaire quand la liseuse est occupée.

### Comment sait-il si un livre est verrouillé ?

Il observe le livre sans l’ouvrir, un peu comme on regarde si une enveloppe est scellée :

- il cherche les « étiquettes » que laissent les verrous Adobe ou LCP ;
- il vérifie si Kobo a enregistré une clé pour ce livre ;
- il jette un œil au premier chapitre : du texte lisible veut dire libre, du charabia veut dire verrouillé.

### Pourquoi une fausse liseuse ?

Pour s’entraîner et tester sans risque. Elle contient exactement un exemple de chaque situation (libre, verrouillé, pas téléchargé…). Vous pouvez la recréer à tout moment avec `npm run demo`.
