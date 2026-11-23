// Trouver la liseuse Kobo et lister ses livres.
// La base SQLite est TOUJOURS ouverte en lecture seule : on n'écrit jamais sur la liseuse.

import { existsSync, readdirSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { join, resolve, sep, basename } from 'node:path';
import { platform, userInfo, tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { trace, alerte } from './style.js';

export const PREFIXE_PERSO = 'file:///mnt/onboard/';

// Une Kobo se reconnaît à son dossier caché .kobo
export function estUneKobo(dossier) {
  return Boolean(dossier) && existsSync(join(dossier, '.kobo'));
}

// Emplacements où le système monte habituellement la liseuse.
export function emplacementsPossibles() {
  const os = platform();
  if (os === 'darwin') return ['/Volumes/KOBOeReader'];
  if (os === 'win32') return [...'DEFGHIJKLMNOPQRSTUVWXYZ'].map((lettre) => `${lettre}:\\`);
  const utilisateur = process.env.USER || userInfo().username;
  return [`/media/${utilisateur}/KOBOeReader`, `/run/media/${utilisateur}/KOBOeReader`];
}

export function trouverKobo() {
  for (const dossier of emplacementsPossibles()) {
    const trouve = estUneKobo(dossier);
    if (platform() !== 'win32' || trouve) {
      trace('scan', `${dossier} ${trouve ? '→ .kobo détecté' : '→ absent'}`);
    }
    if (trouve) return dossier;
  }
  return null;
}

// Clé de comparaison de chemins (la Kobo est en FAT32 : insensible à la casse).
const cle = (chemin) => resolve(chemin).normalize('NFC').toLowerCase();

function decoder(texte) {
  try {
    return decodeURIComponent(texte);
  } catch {
    return texte;
  }
}

// Convertit un ContentID de la base en chemin réel sur l'ordinateur.
export function cheminDepuisContentId(racine, contentId) {
  if (contentId.startsWith(PREFIXE_PERSO)) {
    const relatif = decoder(contentId.slice(PREFIXE_PERSO.length)); // %20 → espace
    return { chemin: join(racine, ...relatif.split('/')), origine: 'perso' };
  }
  return { chemin: join(racine, '.kobo', 'kepub', contentId), origine: 'boutique' };
}

function tableExiste(db, nom) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(nom));
}

// Plusieurs façons d'ouvrir la base, de la plus directe à la plus prudente.
// Aucune n'écrit sur la liseuse : la 2e travaille sur une COPIE dans un dossier temporaire.
function strategiesOuverture(cheminBase) {
  return [
    {
      nom: 'lecture seule directe (attente du verrou : 5 s)',
      ouvrir: () => ({ db: new DatabaseSync(cheminBase, { readOnly: true, timeout: 5000 }) }),
    },
    {
      // Utile si la Kobo écrit dans la base, ou si elle est en mode WAL sur un volume en lecture seule.
      nom: 'copie temporaire de la base (+ journal -wal)',
      ouvrir: () => {
        const dossier = mkdtempSync(join(tmpdir(), 'kobo-extract-'));
        const nettoyer = () => rmSync(dossier, { recursive: true, force: true });
        try {
          for (const suffixe of ['', '-wal']) {
            if (existsSync(cheminBase + suffixe)) copyFileSync(cheminBase + suffixe, join(dossier, `KoboReader.sqlite${suffixe}`));
          }
          return { db: new DatabaseSync(join(dossier, 'KoboReader.sqlite'), { timeout: 5000 }), nettoyer };
        } catch (e) {
          nettoyer();
          throw e;
        }
      },
    },
    {
      // Dernier recours (ex. disque plein) : SQLite lit le fichier tel quel, sans verrou ni journal.
      nom: 'mode immuable (file:…?immutable=1)',
      ouvrir: () => {
        const url = pathToFileURL(cheminBase);
        url.searchParams.set('immutable', '1');
        return { db: new DatabaseSync(url, { readOnly: true }) };
      },
    },
  ];
}

function lireBase(racine) {
  const cheminBase = join(racine, '.kobo', 'KoboReader.sqlite');
  if (!existsSync(cheminBase)) {
    alerte('Base KoboReader.sqlite introuvable : seuls les fichiers du disque seront listés.');
    return [];
  }

  for (const strategie of strategiesOuverture(cheminBase)) {
    trace('sqlite', `open ${cheminBase} — ${strategie.nom}`);
    let ouverte;
    try {
      ouverte = strategie.ouvrir();
      return lireLivres(ouverte.db, racine);
    } catch (e) {
      trace('sqlite', `échec : ${e.message} → solution suivante`);
    } finally {
      try {
        ouverte?.db.close();
      } catch {
        // déjà fermée
      }
      ouverte?.nettoyer?.();
    }
  }
  alerte('Impossible de lire la base de la Kobo : seuls les fichiers du disque seront listés.');
  alerte('Astuce : éjectez puis rebranchez la liseuse, et attendez la fin de son indexation.');
  return [];
}

function lireLivres(db, racine) {
  const sql = 'SELECT ContentID, Title, Attribution, MimeType FROM content WHERE ContentType = 6';
  const lignes = db.prepare(sql).all();
  trace('sqlite', `${sql} → ${lignes.length} livre(s)`);

  // On vérifie seulement la PRÉSENCE du livre dans content_keys.
  // La colonne des clés n'est jamais sélectionnée ni lue.
  let estChiffre = () => false;
  if (tableExiste(db, 'content_keys')) {
    const requete = db.prepare('SELECT 1 FROM content_keys WHERE volumeId = ? LIMIT 1');
    estChiffre = (id) => Boolean(requete.get(id));
    const { n } = db.prepare('SELECT COUNT(DISTINCT volumeId) AS n FROM content_keys').get();
    trace('keys', `content_keys : ${n} volume(s) référencé(s) — clés jamais lues`);
  }

  const racineAbsolue = resolve(racine) + sep;
  const livres = [];
  for (const ligne of lignes) {
    const id = String(ligne.ContentID);
    const { chemin, origine } = cheminDepuisContentId(racine, id);
    // Sécurité : on refuse tout chemin qui sortirait de la liseuse (ex. "../../").
    if (!resolve(chemin).startsWith(racineAbsolue)) {
      alerte(`Chemin suspect ignoré : ${id}`);
      continue;
    }
    livres.push({
      id,
      titre: ligne.Title || basename(chemin),
      auteur: ligne.Attribution || '',
      mime: ligne.MimeType || '',
      chemin,
      origine,
      indexe: true,
      dansContentKeys: estChiffre(id),
    });
  }
  return livres;
}

// Parcourt la racine pour trouver les .epub / .pdf, en ignorant les dossiers cachés.
// Les liens symboliques ne sont pas suivis (isDirectory() est faux pour eux) : pas de boucle infinie.
const PROFONDEUR_MAX = 12;

function parcourir(dossier, trouves = [], profondeur = 0) {
  if (profondeur > PROFONDEUR_MAX) return trouves;
  let entrees;
  try {
    entrees = readdirSync(dossier, { withFileTypes: true });
  } catch {
    return trouves; // dossier illisible : on passe
  }
  for (const entree of entrees) {
    if (entree.name.startsWith('.')) continue;
    const chemin = join(dossier, entree.name);
    if (entree.isDirectory()) parcourir(chemin, trouves, profondeur + 1);
    else if (entree.isFile() && /\.(epub|pdf)$/i.test(entree.name)) trouves.push(chemin);
  }
  return trouves;
}

function titreDepuisFichier(chemin) {
  return basename(chemin).replace(/(\.kepub)?\.(epub|pdf)$/i, '');
}

export function listerLivres(racine) {
  const livres = lireBase(racine);

  const connus = new Set(livres.map((l) => cle(l.chemin)));
  const fichiers = parcourir(racine);
  let ajoutes = 0;
  for (const chemin of fichiers) {
    if (connus.has(cle(chemin))) continue;
    livres.push({
      id: null,
      titre: titreDepuisFichier(chemin),
      auteur: '',
      mime: '',
      chemin,
      origine: 'perso',
      indexe: false,
      dansContentKeys: false,
    });
    ajoutes++;
  }
  trace('fs', `find ${racine} -name "*.epub" -o -name "*.pdf" → ${fichiers.length} fichier(s), ${ajoutes} non indexé(s)`);

  livres.sort((a, b) => a.titre.localeCompare(b.titre, 'fr', { sensitivity: 'base' }));
  livres.forEach((livre, i) => (livre.numero = i + 1));
  return livres;
}
