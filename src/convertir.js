// Copie des livres libres et conversion en PDF avec Calibre (ebook-convert).

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, copyFileSync, constants } from 'node:fs';
import { join, delimiter } from 'node:path';
import { platform } from 'node:os';
import { trace, commande, spinner } from './style.js';

const execFileAsync = promisify(execFile);

export const CALIBRE_MAC = '/Applications/calibre.app/Contents/MacOS/ebook-convert';
export const OPTIONS_PDF = ['--paper-size', 'a5', '--pdf-page-numbers'];

export const AIDE_CALIBRE = [
  'Calibre est introuvable : l’EPUB a été gardé, mais pas converti en PDF.',
  'Pour installer Calibre :',
  '  • Mac   : brew install --cask calibre   (ou https://calibre-ebook.com/download)',
  '  • Linux : sudo apt install calibre',
  'Puis relancez kobo-extract.',
];

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
    .slice(0, 120)
    .trim();
  return propre || 'livre';
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

export async function extraire(livre, sortie) {
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

  const pdf = cheminLibre(sortie, base, '.pdf');
  const args = [epub, pdf, ...OPTIONS_PDF];
  commande('ebook-convert', args);
  const animation = spinner('conversion EPUB → PDF');
  try {
    await execFileAsync(calibre, args, { maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    return { fichiers: [epub], erreurConversion: (e.stderr || e.message || '').toString().trim().split('\n').pop() };
  } finally {
    animation.stop();
  }
  return { fichiers: [epub, pdf] };
}
