// Copie des livres libres et conversion en PDF avec Calibre (ebook-convert).

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, constants, rmSync, openSync, readSync, closeSync } from 'node:fs';
import { join, delimiter } from 'node:path';
import { platform } from 'node:os';
import { trace, commande, spinner, alerte } from './style.js';

export const CALIBRE_MAC = '/Applications/calibre.app/Contents/MacOS/ebook-convert';
export const DELAI_PAR_DEFAUT = 300; // secondes

// Essais successifs : si le premier échoue, on retente sans la numérotation des pages,
// une option qui fait parfois échouer Calibre sur des livres mal formés.
export const ESSAIS_PDF = [
  ['--paper-size', 'a5', '--pdf-page-numbers'],
  ['--paper-size', 'a5'],
];

export const AIDE_CALIBRE = [
  'Calibre est introuvable : l’EPUB a été gardé, mais pas converti en PDF.',
  'Pour installer Calibre :',
  '  • Mac   : brew install --cask calibre   (ou https://calibre-ebook.com/download)',
  '  • Linux : sudo apt install calibre',
  'Puis relancez kobo-extract.',
];

// Erreur spéciale : l'utilisateur a fait Ctrl+C pendant une conversion.
// Signaux qui demandent l'arrêt : Ctrl+C (SIGINT), fermeture du terminal (SIGHUP), kill (SIGTERM).
export const SIGNAUX_ARRET = ['SIGINT', 'SIGHUP', 'SIGTERM'];

export class Interruption extends Error {
  constructor(signal = 'SIGINT') {
    super(`interrompu (${signal})`);
    this.name = 'Interruption';
    this.signal = signal;
  }
}

// Cherche ebook-convert dans le PATH, puis dans l'application Calibre du Mac.
export function trouverCalibre() {
  const nom = platform() === 'win32' ? 'ebook-convert.exe' : 'ebook-convert';
  for (const dossier of (process.env.PATH ?? '').split(delimiter)) {
    if (dossier && existsSync(join(dossier, nom))) return join(dossier, nom);
  }
  return existsSync(CALIBRE_MAC) ? CALIBRE_MAC : null;
}

// Nettoie un titre pour en faire un nom de fichier sûr.
export function nomPropre(texte) {
  const propre = String(texte)
    .normalize('NFC')
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '')
    .trim();
  // Coupe à 120 caractères "visibles" (graphèmes) : jamais au milieu d'un emoji ou d'un accent.
  const morceaux = [...new Intl.Segmenter('fr', { granularity: 'grapheme' }).segment(propre)].map((m) => m.segment);
  return morceaux.slice(0, 120).join('').trim() || 'livre';
}

// Renvoie un chemin qui n'existe pas encore : "Titre.pdf", "Titre (2).pdf", ...
export function cheminLibre(dossier, base, extension) {
  let chemin = join(dossier, base + extension);
  for (let n = 2; existsSync(chemin); n++) chemin = join(dossier, `${base} (${n})${extension}`);
  return chemin;
}

// COPYFILE_EXCL : la copie échoue plutôt que d'écraser un fichier existant.
function copier(source, destination) {
  commande('cp', [source, destination]);
  copyFileSync(source, destination, constants.COPYFILE_EXCL);
}

// Un PDF réussi existe, n'est pas vide et commence par %PDF.
function estUnPdf(chemin) {
  if (!existsSync(chemin)) return false;
  const fd = openSync(chemin, 'r');
  try {
    const debut = Buffer.alloc(4);
    return readSync(fd, debut, 0, 4, 0) === 4 && debut.toString('latin1') === '%PDF';
  } finally {
    closeSync(fd);
  }
}

// Tue le programme ET tous ses sous-processus (même "groupe de processus").
function tuerGroupe(enfant, signal) {
  try {
    if (platform() === 'win32') enfant.kill(signal);
    else process.kill(-enfant.pid, signal); // pid négatif = tout le groupe
  } catch {
    // déjà terminé
  }
}

/**
 * Lance un programme avec un délai maximum.
 * Renvoie toujours un résultat (jamais de blocage) :
 * { code, erreur, stderr, raison: null | 'delai' | 'interruption' }
 */
export function lancer(programme, args, delaiMs) {
  return new Promise((resoudre) => {
    const enfant = spawn(programme, args, {
      stdio: ['ignore', 'ignore', 'pipe'], // pas d'entrée : Calibre ne peut pas attendre une réponse
      detached: platform() !== 'win32', // son propre groupe, pour pouvoir le tuer en entier
    });
    let stderr = '';
    let raison = null;
    let fini = false;

    enfant.stderr.on('data', (d) => (stderr = (stderr + d).slice(-4000)));

    const arreter = (pourquoi) => {
      if (fini) return;
      raison = pourquoi;
      tuerGroupe(enfant, 'SIGTERM'); // poliment…
      setTimeout(() => tuerGroupe(enfant, 'SIGKILL'), 3000).unref(); // …puis de force
    };
    const minuteur = setTimeout(() => arreter('delai'), delaiMs);
    let signalRecu = null;
    const surSignal = (signal) => {
      signalRecu = signal;
      arreter('interruption');
    };
    for (const s of SIGNAUX_ARRET) process.on(s, surSignal);

    const terminer = (resultat) => {
      if (fini) return;
      fini = true;
      clearTimeout(minuteur);
      for (const s of SIGNAUX_ARRET) process.off(s, surSignal);
      if (raison) tuerGroupe(enfant, 'SIGKILL'); // achève les sous-processus restants
      enfant.stderr.destroy();
      resoudre({ ...resultat, raison, signal: signalRecu, stderr: stderr.trim() });
    };
    enfant.once('error', (e) => terminer({ code: null, erreur: e.message }));
    // "exit" et non "close" : "close" attend que TOUS les processus aient lâché le tuyau stderr,
    // ce qui peut ne jamais arriver si un sous-processus reste coincé.
    enfant.once('exit', (code, signal) => terminer({ code, erreur: signal ? `arrêté par ${signal}` : null }));
  });
}

function supprimer(chemin) {
  if (existsSync(chemin)) rmSync(chemin, { force: true });
}

async function convertirEnPdf(calibre, epub, dossier, base, delaiSecondes) {
  let dernierEchec = 'raison inconnue';
  for (const [i, options] of ESSAIS_PDF.entries()) {
    if (i > 0) alerte(`Nouvel essai (${i + 1}/${ESSAIS_PDF.length}) avec des options simplifiées…`);
    const pdf = cheminLibre(dossier, base, '.pdf');
    const args = [epub, pdf, ...options];
    commande('ebook-convert', args);

    const animation = spinner(`conversion EPUB → PDF (délai max ${delaiSecondes}s)`);
    const resultat = await lancer(calibre, args, delaiSecondes * 1000);
    animation.stop();

    if (resultat.raison === 'interruption') {
      supprimer(pdf); // pas de PDF à moitié écrit
      throw new Interruption(resultat.signal ?? 'SIGINT');
    }
    if (resultat.raison === 'delai') {
      supprimer(pdf);
      // Inutile de réessayer : Calibre bloquerait sans doute de nouveau.
      return { erreur: `Calibre n’a pas fini en ${delaiSecondes}s : conversion arrêtée (relancez avec --delai <secondes> pour attendre plus).` };
    }
    if (resultat.code === 0 && estUnPdf(pdf)) {
      trace('calibre', `terminé (essai ${i + 1})`);
      return { pdf };
    }
    supprimer(pdf);
    dernierEchec =
      resultat.erreur ||
      resultat.stderr.split('\n').pop() ||
      (resultat.code === 0 ? 'Calibre s’est terminé sans produire de PDF valide' : `code de sortie ${resultat.code}`);
    trace('calibre', `échec : ${dernierEchec}`);
  }
  return { erreur: dernierEchec };
}

export async function extraire(livre, sortie, { delai = DELAI_PAR_DEFAUT } = {}) {
  // Double sécurité : on n'extrait jamais un livre qui n'a pas été déclaré libre.
  if (livre.analyse?.statut !== 'libre') {
    throw new Error('refus : ce livre n’est pas libre, il ne sera pas extrait');
  }
  mkdirSync(sortie, { recursive: true });
  const base = nomPropre(livre.auteur ? `${livre.auteur} - ${livre.titre}` : livre.titre);

  if (livre.analyse.format === 'pdf') {
    const pdf = cheminLibre(sortie, base, '.pdf');
    copier(livre.chemin, pdf);
    return { fichiers: [pdf] };
  }

  // EPUB ou kepub sans extension → copie en .epub
  const epub = cheminLibre(sortie, base, '.epub');
  copier(livre.chemin, epub);

  const calibre = trouverCalibre();
  trace('calibre', calibre ?? 'ebook-convert introuvable');
  if (!calibre) return { fichiers: [epub], calibreAbsent: true };

  const { pdf, erreur } = await convertirEnPdf(calibre, epub, sortie, base, delai);
  return pdf ? { fichiers: [epub, pdf] } : { fichiers: [epub], erreurConversion: erreur };
}
