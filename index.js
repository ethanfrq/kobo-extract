#!/usr/bin/env -S node --no-warnings
// kobo-extract : interface en ligne de commande.

import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { existsSync, readFileSync } from 'node:fs';
import { basename, resolve, extname } from 'node:path';
import { trouverKobo, estUneKobo, listerLivres } from './src/kobo.js';
import { analyser, messagePour, MESSAGE_LEGAL } from './src/drm.js';
import { extraire, trouverCalibre, AIDE_CALIBRE, DELAI_PAR_DEFAUT, Interruption } from './src/convertir.js';
import * as s from './src/style.js';

const AIDE = `
${s.gras('UTILISATION')}
  kobo-extract [options]

${s.gras('OPTIONS')}
  --kobo <dossier>     dossier de la liseuse (sinon détection automatique)
  --liste              afficher la liste des livres puis quitter
  --livre <n>          extraire le livre numéro n
  --tous               extraire tous les livres libres
  --fichier <fichier>  analyser un .epub (ou un .acsm) hors liseuse
  --sortie <dossier>   dossier de destination (défaut : ./extraits)
  --delai <secondes>   temps max d’une conversion Calibre (défaut : ${DELAI_PAR_DEFAUT})
  --sobre              sans animations (ni Matrix, ni glitch, ni démarrage)
  -h, --help          afficher cette aide

${s.gras('LÉGENDE')}
  ✅ libre    🔒 verrouillé (DRM)    ☁️  pas encore téléchargé    ❓ format inconnu

${s.gras('EXEMPLES')}
  npm start
  npm start -- --liste
  npm start -- --livre 3 --sortie ~/Documents/livres
  npm start -- --fichier ~/Downloads/mon-livre.epub
`;

const VERSION = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;

const ICONES = { libre: '✅', verrouille: '🔒', 'non-telecharge': '☁️ ', inconnu: '❓' };
const COULEURS = { libre: s.vert, verrouille: s.rouge, 'non-telecharge': s.jaune, inconnu: s.magenta };

function lireOptions() {
  try {
    return parseArgs({
      options: {
        kobo: { type: 'string' },
        liste: { type: 'boolean', default: false },
        livre: { type: 'string' },
        tous: { type: 'boolean', default: false },
        fichier: { type: 'string' },
        sortie: { type: 'string', default: './extraits' },
        delai: { type: 'string', default: String(DELAI_PAR_DEFAUT) },
        sobre: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    }).values;
  } catch (e) {
    const detail = e.code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION' ? 'option inconnue' : 'option invalide';
    s.erreur(`${detail} : ${e.message.split('\n')[0]}`);
    console.log('Tapez  npm start -- -h  pour afficher l’aide.');
    process.exitCode = 1;
    return null;
  }
}

function localiserKobo(dossierDemande) {
  s.titre('DÉTECTION DE LA LISEUSE');
  if (dossierDemande) {
    const dossier = resolve(dossierDemande);
    s.trace('scan', `${dossier} (option --kobo)`);
    if (!estUneKobo(dossier)) {
      s.erreur(`${dossier} n’est pas une Kobo (dossier .kobo introuvable).`);
      return null;
    }
    s.ok(`Liseuse trouvée : ${s.gras(dossier)}`);
    return dossier;
  }
  const dossier = trouverKobo();
  if (!dossier) {
    s.erreur('Aucune liseuse Kobo détectée.');
    console.log('  1. Branchez la Kobo en USB et touchez « Se connecter » sur son écran.');
    console.log('  2. Ou indiquez son dossier :  npm start -- --kobo /chemin/vers/la/kobo');
    return null;
  }
  s.ok(`Liseuse trouvée : ${s.gras(dossier)}`);
  return dossier;
}

function afficherListe(livres) {
  s.titre('BIBLIOTHÈQUE');
  const largeur = String(livres.length).length;
  for (const livre of livres) {
    const { statut, format, raison } = livre.analyse;
    const numero = s.gris(`[${String(livre.numero).padStart(largeur)}]`);
    const auteur = livre.auteur ? s.gris(` — ${livre.auteur}`) : '';
    const meta = s.gris(` (${format ?? '?'} · ${livre.origine}${livre.indexe ? '' : ' · non indexé'})`);
    console.log(`${numero} ${ICONES[statut]} ${s.gras(livre.titre)}${auteur}${meta}`);
    if (statut !== 'libre') console.log(`${' '.repeat(largeur + 3)}${s.gris('└─')} ${COULEURS[statut](raison)}`);
  }
  const compte = (st) => livres.filter((l) => l.analyse.statut === st).length;
  console.log(
    `\n${s.cyan('[*]')} ${livres.length} livre(s) : ` +
      `${s.vert(`${compte('libre')} libre(s)`)}, ` +
      `${s.rouge(`${compte('verrouille')} verrouillé(s)`)}, ` +
      `${s.jaune(`${compte('non-telecharge')} non téléchargé(s)`)}` +
      (compte('inconnu') ? `, ${s.magenta(`${compte('inconnu')} inconnu(s)`)}` : ''),
  );
}

// Modules affichés dans la séquence de démarrage (avec de vraies informations).
function modulesDemarrage() {
  const calibre = trouverCalibre();
  return [
    { nom: 'noyau kobo-extract', detail: `v${VERSION} · Node ${process.versions.node}` },
    { nom: 'pilote SQLite', detail: 'node:sqlite · readOnly' },
    { nom: 'décodeur EPUB/ZIP', detail: 'adm-zip' },
    { nom: 'détecteur DRM', detail: 'Adobe · LCP · Kobo · PDF — sans déchiffrement' },
    calibre
      ? { nom: 'pont Calibre', detail: 'ebook-convert trouvé' }
      : { nom: 'pont Calibre', detail: 'ebook-convert absent → EPUB seulement', ok: false },
  ];
}

// Réglages communs à toutes les extractions (remplis dans main).
const reglages = { delai: DELAI_PAR_DEFAUT };

async function extraireLivre(livre, sortie) {
  s.titre(`EXTRACTION #${livre.numero} · ${livre.titre}`);
  const { analyse } = livre;
  if (analyse.statut !== 'libre') {
    s.alerte(`${ICONES[analyse.statut]} ${analyse.raison}`);
    for (const ligne of messagePour(analyse)) console.log(`    ${ligne}`);
    process.exitCode = 2;
    return false;
  }
  try {
    const resultat = await extraire(livre, sortie, reglages);
    for (const fichier of resultat.fichiers) s.ok(`Écrit : ${s.gras(fichier)}`);
    if (resultat.calibreAbsent) for (const ligne of AIDE_CALIBRE) s.alerte(ligne);
    if (resultat.erreurConversion) {
      s.erreur(`La conversion a échoué : ${resultat.erreurConversion}`);
      process.exitCode = 1;
      s.alerte('L’EPUB a été gardé dans le dossier de sortie.');
    }
    return true;
  } catch (e) {
    if (e instanceof Interruption) throw e; // remonte jusqu'à main : on arrête tout
    s.erreur(`Échec de l’extraction : ${e.code ?? ''} ${e.message}`.replace('  ', ' '));
    process.exitCode = 1;
    return false;
  }
}

async function extraireTous(livres, sortie) {
  const libres = livres.filter((l) => l.analyse.statut === 'libre');
  if (!libres.length) {
    s.alerte('Aucun livre libre à extraire.');
    return;
  }
  let reussis = 0;
  for (const livre of libres) if (await extraireLivre(livre, sortie)) reussis++;
  s.titre('TERMINÉ');
  s.ok(`${reussis}/${libres.length} livre(s) libre(s) extrait(s) dans ${s.gras(sortie)}`);
}

function trouverNumero(livres, texte) {
  const n = Number(texte);
  if (!Number.isInteger(n) || n < 1 || n > livres.length) {
    s.erreur(`Numéro invalide : « ${texte} ». Choisissez entre 1 et ${livres.length}.`);
    return null;
  }
  return livres[n - 1];
}

// Pose une question. Renvoie null si l'entrée est fermée (Ctrl+D, tuyau vide) ou sur Ctrl+C,
// au lieu d'attendre une réponse qui n'arrivera jamais.
function demander(rl, question) {
  return new Promise((resoudre) => {
    const annulation = new AbortController();
    const surFermeture = () => {
      annulation.abort();
      resoudre(null);
    };
    rl.once('close', surFermeture);
    rl.question(question, { signal: annulation.signal }).then(
      (reponse) => {
        rl.off('close', surFermeture);
        resoudre(reponse);
      },
      () => resoudre(null),
    );
  });
}

async function modeInteractif(livres, sortie) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  rl.on('SIGINT', () => rl.close()); // Ctrl+C pendant la question → on ferme proprement
  try {
    while (true) {
      const brute = await demander(rl, `\n${s.vertVif('kobo-extract')}${s.gris('>')} numéro du livre (t = tous les libres, q = quitter) : `);
      if (brute === null) {
        console.log();
        return s.info('Aucune réponse (entrée fermée ou Ctrl+C) : rien n’a été extrait. Au revoir.');
      }
      const reponse = brute.trim().toLowerCase();
      if (reponse === 'q' || reponse === '') return s.info('Au revoir.');
      if (reponse === 't') return await extraireTous(livres, sortie);
      const livre = trouverNumero(livres, reponse);
      if (livre) return await extraireLivre(livre, sortie);
    }
  } finally {
    rl.close();
  }
}

async function traiterFichier(cheminDonne, sortie) {
  const chemin = resolve(cheminDonne);
  s.titre('ANALYSE D’UN FICHIER');
  s.trace('fs', chemin);
  if (extname(chemin).toLowerCase() === '.acsm') {
    s.alerte('🔒 Fichier .acsm : ce n’est pas le livre, mais un ticket de DRM Adobe.');
    for (const ligne of MESSAGE_LEGAL) console.log(`    ${ligne}`);
    process.exitCode = 2;
    return;
  }
  if (!existsSync(chemin)) {
    s.erreur(`Fichier introuvable : ${chemin}`);
    process.exitCode = 1;
    return;
  }
  const livre = {
    numero: 1,
    titre: basename(chemin).replace(/(\.kepub)?\.(epub|pdf)$/i, ''),
    auteur: '',
    chemin,
    origine: 'fichier',
    indexe: true,
    dansContentKeys: false,
  };
  livre.analyse = analyser(livre);
  afficherListe([livre]);
  await extraireLivre(livre, sortie);
}

async function main() {
  const options = lireOptions();
  if (!options) return;
  s.configurer({ sobre: options.sobre });
  if (options.help) {
    s.entete();
    return console.log(AIDE);
  }
  await s.intro(modulesDemarrage());

  const delai = Number(options.delai);
  if (!Number.isFinite(delai) || delai <= 0) {
    s.erreur(`--delai doit être un nombre de secondes positif (reçu : « ${options.delai} »).`);
    process.exitCode = 1;
    return;
  }
  reglages.delai = delai;

  const sortie = resolve(options.sortie);
  if (options.fichier) return traiterFichier(options.fichier, sortie);

  const racine = localiserKobo(options.kobo);
  if (!racine) {
    process.exitCode = 1;
    return;
  }

  s.titre('LECTURE DU CATALOGUE');
  const livres = listerLivres(racine);

  s.titre('ANALYSE DRM (lecture seule)');
  for (const livre of livres) livre.analyse = analyser(livre);

  if (!livres.length) return s.alerte('Aucun livre trouvé sur la liseuse.');
  afficherListe(livres);

  if (options.liste) return;
  if (options.tous) return extraireTous(livres, sortie);
  if (options.livre) {
    const livre = trouverNumero(livres, options.livre);
    if (!livre) return void (process.exitCode = 1);
    return extraireLivre(livre, sortie);
  }
  await modeInteractif(livres, sortie);
}

main().catch((e) => {
  if (e instanceof Interruption) {
    console.log();
    s.alerte('Interrompu (Ctrl+C) : conversion arrêtée, aucun fichier partiel laissé.');
    process.exitCode = 130; // code standard d'une interruption par Ctrl+C
    return;
  }
  s.erreur(`Erreur inattendue : ${e.message}`);
  process.exitCode = 1;
});
