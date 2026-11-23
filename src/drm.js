// Détection des verrous numériques (DRM).
// Ce module REGARDE seulement : il ne contourne, ne supprime et ne déchiffre jamais rien.

import { openSync, readSync, closeSync, existsSync } from 'node:fs';
import { posix } from 'node:path';
import AdmZip from 'adm-zip';
import { trace } from './style.js';

// Ces deux algorithmes ne font que brouiller les polices embarquées : ce n'est pas une DRM.
export const ALGOS_POLICES = new Set([
  'http://www.idpf.org/2008/embedding',
  'http://ns.adobe.com/pdf/enc#RC',
]);

// ---------- Magic bytes ----------

export function lireMagic(fichier, taille = 5) {
  const fd = openSync(fichier, 'r');
  try {
    const tampon = Buffer.alloc(taille);
    const lus = readSync(fd, tampon, 0, taille, 0);
    return tampon.subarray(0, lus);
  } finally {
    closeSync(fd);
  }
}

export function formatDepuisMagic(octets) {
  if (octets.length >= 4 && octets[0] === 0x50 && octets[1] === 0x4b && octets[2] === 0x03 && octets[3] === 0x04) {
    return 'epub'; // PK\x03\x04 : une archive ZIP
  }
  if (octets.subarray(0, 4).toString('latin1') === '%PDF') return 'pdf';
  return null;
}

const hex = (octets) => [...octets.subarray(0, 4)].map((o) => o.toString(16).padStart(2, '0')).join(' ');

// ---------- Résultats ----------

const libre = (format, raison) => ({ statut: 'libre', format, drm: null, raison });
const verrou = (format, drm, raison) => ({ statut: 'verrouille', format, drm, raison });

// ---------- EPUB ----------

function attributs(balise) {
  const a = {};
  for (const m of balise.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) a[m[1]] = m[2] ?? m[3];
  return a;
}

function decoder(texte) {
  try {
    return decodeURIComponent(texte);
  } catch {
    return texte;
  }
}

// Premier chapitre : container.xml → OPF → premier élément du spine.
// À défaut, premier fichier .xhtml/.html de l'archive.
function premierChapitre(zip) {
  const lire = (nom) => zip.getEntry(nom)?.getData().toString('utf8') ?? null;
  try {
    const rootfile = lire('META-INF/container.xml')?.match(/<(?:[\w-]+:)?rootfile\b[^>]*>/);
    const cheminOpf = rootfile && attributs(rootfile[0])['full-path'];
    const opf = cheminOpf && lire(cheminOpf);
    if (opf) {
      const items = new Map();
      for (const m of opf.matchAll(/<(?:[\w-]+:)?item\b[^>]*>/g)) {
        const a = attributs(m[0]);
        if (a.id && a.href) items.set(a.id, a.href);
      }
      const itemref = opf.match(/<(?:[\w-]+:)?itemref\b[^>]*>/);
      const href = itemref && items.get(attributs(itemref[0]).idref);
      if (href) {
        const nom = posix.normalize(posix.join(posix.dirname(cheminOpf), decoder(href.split('#')[0])));
        const entree = zip.getEntry(nom);
        if (entree) return entree;
      }
    }
  } catch {
    // OPF illisible : on passe au plan B
  }
  return zip.getEntries().find((e) => /\.x?html?$/i.test(e.entryName)) ?? null;
}

// Un chapitre lisible est du HTML : il commence par "<" (après un éventuel BOM ou des espaces).
// Encodages acceptés :
//  - UTF-8 valide (le cas normal) ;
//  - UTF-16, reconnu à sa signature (BOM FF FE ou FE FF) ;
//  - un autre encodage déclaré par le chapitre lui-même (<?xml … encoding="ISO-8859-1"?>),
//    fréquent dans les vieux EPUB. Des octets chiffrés ne forment jamais une telle déclaration.
export function estLisible(octets) {
  const decoder = (encodage, donnees) => {
    try {
      return new TextDecoder(encodage, { fatal: true }).decode(donnees);
    } catch {
      return null;
    }
  };
  const commenceParChevron = (texte) => texte !== null && texte.replace(/^[\uFEFF\s]+/, '').startsWith('<');

  if (octets[0] === 0xff && octets[1] === 0xfe) return commenceParChevron(decoder('utf-16le', octets.subarray(2)));
  if (octets[0] === 0xfe && octets[1] === 0xff) return commenceParChevron(decoder('utf-16be', octets.subarray(2)));

  let i = 0;
  if (octets[0] === 0xef && octets[1] === 0xbb && octets[2] === 0xbf) i = 3; // BOM UTF-8
  while (i < octets.length && [0x20, 0x09, 0x0a, 0x0d].includes(octets[i])) i++;
  if (octets[i] !== 0x3c) return false; // "<"

  if (decoder('utf-8', octets) !== null) return true;

  // Pas de l'UTF-8 : accepté seulement si le chapitre déclare un autre encodage.
  const entete = octets.subarray(i, i + 200).toString('latin1');
  const declaration = entete.match(/^<\?xml[^>]*encoding\s*=\s*["']([\w.:-]+)["']/i);
  return Boolean(declaration) && !/^utf-?8$/i.test(declaration[1]);
}

function analyserEpub(chemin, dansContentKeys) {
  let zip;
  try {
    zip = new AdmZip(chemin);
  } catch {
    return { statut: 'inconnu', format: 'epub', drm: null, raison: 'archive EPUB corrompue' };
  }
  const noms = new Set(zip.getEntries().map((e) => e.entryName));
  const present = (nom) => {
    const oui = noms.has(nom);
    trace('zip', `${nom.padEnd(26)} ${oui ? 'PRÉSENT' : 'absent'}`);
    return oui;
  };

  if (present('META-INF/rights.xml')) return verrou('epub', 'adobe', 'DRM Adobe (META-INF/rights.xml)');
  if (present('META-INF/license.lcpl')) return verrou('epub', 'lcp', 'DRM LCP (META-INF/license.lcpl)');
  if (dansContentKeys) {
    trace('keys', 'livre référencé dans content_keys');
    return verrou('epub', 'kobo', 'chiffré par Kobo (référencé dans content_keys)');
  }

  if (present('META-INF/encryption.xml')) {
    const xml = zip.getEntry('META-INF/encryption.xml').getData().toString('utf8');
    const algos = [...xml.matchAll(/<(?:[\w-]+:)?EncryptionMethod\b[^>]*?\bAlgorithm\s*=\s*["']([^"']+)["']/g)].map((m) => m[1]);
    const suspects = algos.filter((a) => !ALGOS_POLICES.has(a));
    trace('enc', `${algos.length} algo(s) : ${suspects.length ? 'chiffrement détecté' : 'brouillage de polices seulement'}`);
    if (suspects.length) return verrou('epub', 'inconnue', `contenu chiffré (${suspects[0]})`);
  }

  const chapitre = premierChapitre(zip);
  if (chapitre) {
    let lisible = false;
    try {
      lisible = estLisible(chapitre.getData());
    } catch {
      lisible = false;
    }
    trace('xhtml', `${chapitre.entryName} → ${lisible ? 'HTML lisible' : 'octets illisibles'}`);
    if (!lisible) return verrou('epub', 'inconnue', `chapitre illisible (${chapitre.entryName}) : contenu chiffré`);
  }

  return libre('epub', 'aucun verrou détecté');
}

// ---------- PDF ----------

// Cherche des motifs dans un fichier, bloc de 1 Mo par bloc de 1 Mo :
// un PDF de 2 Go ne sature pas la mémoire.
// Les blocs se chevauchent pour ne pas rater un motif coupé en deux.
export function chercherDansFichier(chemin, motifs, tailleBloc = 1 << 20) {
  const trouves = new Set();
  const tester = (texte) => {
    for (const [nom, motif] of Object.entries(motifs)) if (motif.test(texte)) trouves.add(nom);
  };
  const fd = openSync(chemin, 'r');
  try {
    const bloc = Buffer.alloc(tailleBloc);
    let reste = '';
    for (let position = 0; ; ) {
      const lus = readSync(fd, bloc, 0, tailleBloc, position);
      if (lus === 0) break;
      position += lus;
      const texte = reste + bloc.toString('latin1', 0, lus);
      tester(texte.slice(0, -32)); // la fin sera testée avec le bloc suivant
      reste = texte.slice(-64);
    }
    tester(reste);
  } finally {
    closeSync(fd);
  }
  return trouves;
}

const MOTIFS_PDF = {
  encrypt: /\/Encrypt(?![A-Za-z])/, // et pas /EncryptMetadata
  adobe: /EBX_HANDLER|ADEPT/,
};

function analyserPdf(chemin) {
  const trouves = chercherDansFichier(chemin, MOTIFS_PDF);
  if (!trouves.has('encrypt')) {
    trace('pdf', '/Encrypt absent');
    return libre('pdf', 'aucun verrou détecté');
  }
  if (trouves.has('adobe')) {
    trace('pdf', '/Encrypt + EBX_HANDLER/ADEPT');
    return verrou('pdf', 'adobe', 'DRM Adobe (EBX_HANDLER)');
  }
  trace('pdf', '/Encrypt présent');
  return verrou('pdf', 'mot-de-passe', 'PDF protégé par mot de passe');
}

// ---------- Point d'entrée ----------

// Un fichier illisible (permission, liseuse débranchée, secteur abîmé…) ne doit pas
// faire planter l'analyse de toute la bibliothèque : il est simplement marqué "inconnu".
export function analyser(livre) {
  if (!livre.chemin) {
    return { statut: 'inconnu', format: null, drm: null, raison: livre.raisonSansChemin ?? 'emplacement inconnu' };
  }
  try {
    return analyserFichier(livre);
  } catch (e) {
    trace('erreur', `${livre.titre} → ${e.code ?? e.message}`);
    return { statut: 'inconnu', format: null, drm: null, raison: `fichier illisible (${e.code ?? e.message})` };
  }
}

function analyserFichier(livre) {
  if (!existsSync(livre.chemin)) {
    trace('fs', `${livre.titre} → fichier absent`);
    return { statut: 'non-telecharge', format: null, drm: null, raison: 'pas encore téléchargé sur la liseuse' };
  }
  const octets = lireMagic(livre.chemin);
  const format = formatDepuisMagic(octets);
  trace('magic', `${hex(octets).padEnd(11)} → ${(format ?? '???').toUpperCase().padEnd(4)} ${livre.titre}`);

  if (format === 'epub') return analyserEpub(livre.chemin, livre.dansContentKeys);
  if (format === 'pdf') return analyserPdf(livre.chemin);
  return { statut: 'inconnu', format: null, drm: null, raison: 'format non reconnu (ni EPUB ni PDF)' };
}

// ---------- Message légal ----------

export const MESSAGE_LEGAL = [
  'Contourner une DRM est interdit en France (art. L.335-3-1 du Code de la propriété intellectuelle).',
  'kobo-extract ne le fera pas.',
  'Voie légale : compte Fnac → Mes ebooks → Télécharger.',
  '  • Vous recevez un .epub → le livre est libre : relancez avec  --fichier <livre.epub>',
  '  • Vous recevez un .acsm → c’est une DRM Adobe : lisez le livre avec Kobo Desktop ou Adobe Digital Editions.',
];

export function messagePour(analyse) {
  if (analyse.statut === 'verrouille') return MESSAGE_LEGAL;
  if (analyse.statut === 'non-telecharge') {
    return [
      'Ce livre est dans votre bibliothèque mais pas encore sur la liseuse.',
      'Ouvrez-le une fois sur la Kobo (en Wi-Fi) pour le télécharger, puis relancez kobo-extract.',
    ];
  }
  if (analyse.statut === 'inconnu') return [`Rien à extraire : ${analyse.raison}.`];
  return [];
}
