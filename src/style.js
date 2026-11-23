// Habillage "terminal de hacker" : couleurs ANSI, pluie Matrix, bannière glitch en dégradé,
// séquence de démarrage, traces façon console. Aucune dépendance : tout passe par des
// séquences d'échappement ANSI (\x1b[...).
//
// Les animations ne tournent que dans un vrai terminal, et jamais avec --sobre ou NO_COLOR.

const tty = Boolean(process.stdout.isTTY);
const couleurs = tty && !('NO_COLOR' in process.env);
const reglages = { sobre: false };

export function configurer({ sobre = false } = {}) {
  reglages.sobre = sobre;
}

// Les effets animés sont-ils permis ?
const effets = () => couleurs && !reglages.sobre;

const peindre = (code) => (texte) => (couleurs ? `\x1b[${code}m${texte}\x1b[0m` : String(texte));

export const vert = peindre('32');
export const vertVif = peindre('1;92');
export const gris = peindre('90');
export const rouge = peindre('1;91');
export const jaune = peindre('93');
export const cyan = peindre('96');
export const magenta = peindre('95');
export const gras = peindre('1');

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const hasard = (n) => Math.floor(Math.random() * n);
const ecrire = (texte) => process.stdout.write(texte);

// ---------- Curseur ----------
// On le cache pendant les animations (sinon il clignote partout).
// Il est TOUJOURS réaffiché à la sortie, même après un Ctrl+C.

const cacherCurseur = () => tty && ecrire('\x1b[?25l');
const montrerCurseur = () => tty && ecrire('\x1b[0m\x1b[?25h');
process.on('exit', montrerCurseur);

async function animation(fonction) {
  const surCtrlC = () => {
    montrerCurseur();
    ecrire('\n');
    process.exit(130);
  };
  process.once('SIGINT', surCtrlC);
  cacherCurseur();
  try {
    await fonction();
  } finally {
    montrerCurseur();
    process.off('SIGINT', surCtrlC);
  }
}

// ---------- Traces et messages ----------

// Ligne de trace : │ [outil]   détail
// Les textes affichés peuvent venir de la liseuse (noms de fichiers) : on retire les caractères
// de contrôle pour qu'aucun ne soit interprété comme un ordre par le terminal.
const propre = (texte) => String(texte).replace(/[\u0000-\u001f\u007f-\u009f]/g, '');

export function trace(outil, texte) {
  console.log(`${gris('│')} ${cyan(`[${outil}]`.padEnd(10))} ${gris(propre(texte))}`);
}

// Affiche une commande comme si on la tapait dans un shell.
export function commande(programme, args = []) {
  const citer = (a) => (/[\s"'$\\]/.test(a) ? JSON.stringify(a) : a);
  console.log(`${vertVif('$')} ${vert(programme)} ${args.map((a) => citer(propre(a))).join(' ')}`);
}

export const ok = (t) => console.log(`${vertVif('[+]')} ${t}`);
export const info = (t) => console.log(`${cyan('[*]')} ${t}`);
export const alerte = (t) => console.log(`${jaune('[!]')} ${t}`);
export const erreur = (t) => console.error(`${rouge('[x]')} ${t}`);

export function titre(texte) {
  const trait = '─'.repeat(Math.max(4, 62 - texte.length));
  console.log(`\n${vertVif(`┌─[ ${texte} ]${trait}`)}`);
}

// Effet "machine à écrire".
export async function taper(texte, ms = 4) {
  if (!effets()) return console.log(texte);
  for (const caractere of texte) {
    ecrire(caractere);
    await pause(ms);
  }
  ecrire('\n');
}

// Petite animation pendant les opérations longues (conversion Calibre).
export function spinner(libelle) {
  if (!effets()) {
    console.log(`… ${libelle}`);
    return { stop() {} };
  }
  const images = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  const debut = Date.now();
  cacherCurseur();
  const minuteur = setInterval(() => {
    const secondes = ((Date.now() - debut) / 1000).toFixed(1);
    ecrire(`\r${vertVif(images[i++ % images.length])} ${libelle} ${gris(`${secondes}s`)}`);
  }, 80);
  return {
    stop() {
      clearInterval(minuteur);
      ecrire('\r\x1b[2K');
      montrerCurseur();
    },
  };
}

// ---------- Bannière ----------

const BANNIERE = String.raw`
 _  __ ___  ___  ___        _____  _______ ___    _    ___ _____
| |/ // _ \| _ )/ _ \  ___ | __\ \/ /_   _| _ \  /_\  / __|_   _|
| ' <| (_) | _ \ (_) ||___|| _| >  <  | | |   / / _ \| (__  | |
|_|\_\\___/|___/\___/      |___/_/\_\ |_| |_|_\/_/ \_\\___| |_|
`
  .split('\n')
  .filter(Boolean);

const LARGEUR_BANNIERE = Math.max(...BANNIERE.map((l) => l.length));

// Effet 4 : dégradé vert → cyan, en diagonale.
// Palette 256 couleurs (46 = vert vif … 51 = cyan) : compatible avec le Terminal de macOS.
const DEGRADE = [46, 47, 48, 49, 50, 51];

function enDegrade(ligne, y) {
  if (!couleurs) return ligne;
  const total = LARGEUR_BANNIERE + BANNIERE.length * 6;
  let sortie = '';
  for (const [x, c] of [...ligne].entries()) {
    const teinte = DEGRADE[Math.min(DEGRADE.length - 1, Math.floor(((x + y * 6) / total) * DEGRADE.length))];
    sortie += c === ' ' ? ' ' : `\x1b[1;38;5;${teinte}m${c}`;
  }
  return `${sortie}\x1b[0m`;
}

// ---------- Effet 1 : pluie Matrix ----------

const GLYPHES = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789ABCDEF';
const glyphe = () => GLYPHES[hasard(GLYPHES.length)];

async function pluieMatrix(duree = 1300) {
  const largeur = Math.min(process.stdout.columns || 80, LARGEUR_BANNIERE + 4);
  const hauteur = 10;
  // Pour chaque colonne : position de la "tête" de la goutte et longueur de sa traîne.
  const tetes = Array.from({ length: largeur }, () => -hasard(hauteur * 2));
  const traines = Array.from({ length: largeur }, () => 3 + hasard(7));

  ecrire('\n'.repeat(hauteur)); // on réserve la place
  const fin = Date.now() + duree;
  while (Date.now() < fin) {
    let image = `\x1b[${hauteur}A\r`; // remonte en haut de la zone
    for (let y = 0; y < hauteur; y++) {
      let ligne = '';
      for (let x = 0; x < largeur; x++) {
        const distance = tetes[x] - y;
        if (distance === 0) ligne += `\x1b[1;97m${glyphe()}`; // tête : blanc
        else if (distance > 0 && distance < traines[x]) {
          const estompe = distance > traines[x] * 0.6;
          ligne += `\x1b[${estompe ? '2;32' : '0;92'}m${glyphe()}`; // traîne : vert qui s'éteint
        } else ligne += ' ';
      }
      image += `${ligne}\x1b[0m\x1b[K\n`;
    }
    ecrire(image);
    for (let x = 0; x < largeur; x++) {
      tetes[x]++;
      if (tetes[x] - traines[x] > hauteur) tetes[x] = -hasard(hauteur);
    }
    await pause(45);
  }
  ecrire(`\x1b[${hauteur}A\r\x1b[J`); // efface la pluie
}

// ---------- Effet 3 : bannière glitch ----------

const BRUIT = '█▓▒░#@%&$!?/\\<>*=';
const COULEURS_GLITCH = ['91', '95', '92', '96', '97'];

async function banniereGlitch() {
  const hauteur = BANNIERE.length;
  ecrire('\n'.repeat(hauteur));
  const etapes = 16;
  for (let e = 0; e <= etapes; e++) {
    const brouillage = e === etapes ? 0 : 0.55 * (1 - e / etapes); // de plus en plus net
    let image = `\x1b[${hauteur}A\r`;
    BANNIERE.forEach((ligne, y) => {
      if (brouillage === 0) {
        image += `${enDegrade(ligne, y)}\x1b[K\n`;
        return;
      }
      const brouillee = [...ligne].map((c) => (c !== ' ' && Math.random() < brouillage ? BRUIT[hasard(BRUIT.length)] : c)).join('');
      const decalage = Math.random() < brouillage * 0.7 ? ' '.repeat(1 + hasard(3)) : ''; // ligne qui "saute"
      const teinte = COULEURS_GLITCH[hasard(COULEURS_GLITCH.length)];
      image += `\x1b[1;${teinte}m${decalage}${brouillee}\x1b[0m\x1b[K\n`;
    });
    ecrire(image);
    await pause(e < etapes - 3 ? 50 : 90);
  }
}

// ---------- Effet 2 : séquence de démarrage ----------

/** modules : [{ nom, detail, ok = true }] */
async function demarrage(modules) {
  const largeurBarre = 18;
  for (const { nom, detail, ok: reussi = true } of modules) {
    for (let p = 0; p <= largeurBarre; p++) {
      const barre = '█'.repeat(p) + '░'.repeat(largeurBarre - p);
      const pourcent = String(Math.round((p / largeurBarre) * 100)).padStart(3);
      ecrire(`\r  ${gris('load')} ${nom.padEnd(22)} ${vert(`[${barre}]`)} ${gris(`${pourcent}%`)}`);
      await pause(6 + hasard(18));
    }
    const etat = reussi ? vertVif('[  OK  ]') : jaune('[ WARN ]');
    ecrire(`\r\x1b[2K  ${etat} ${nom.padEnd(22)} ${gris(detail)}\n`);
  }
}

// ---------- Points d'entrée ----------

const LIGNES_INTRO = [
  '  > mode .............. LECTURE SEULE (rien n’est écrit sur la liseuse)',
  '  > politique DRM ..... détection uniquement, aucun contournement',
  '  > cadre légal ....... CPI art. L.335-3-1',
];

// Bannière fixe (aide, sortie non interactive).
export function entete() {
  if (reglages.sobre) return console.log(`${vertVif('kobo-extract')} ${gris('· lecture seule · aucune DRM contournée')}`);
  console.log();
  BANNIERE.forEach((ligne, y) => console.log(enDegrade(ligne, y)));
}

// Intro complète : Matrix → bannière glitch en dégradé → démarrage des modules → lignes tapées.
export async function intro(modules = []) {
  if (!effets()) {
    entete();
    if (!reglages.sobre) {
      console.log();
      for (const ligne of LIGNES_INTRO) console.log(gris(ligne));
    }
    return;
  }
  await animation(async () => {
    if ((process.stdout.columns || 80) >= LARGEUR_BANNIERE) await pluieMatrix();
    console.log();
    await banniereGlitch();
    console.log();
    await demarrage(modules);
    console.log();
    for (const ligne of LIGNES_INTRO) await taper(gris(ligne), 3);
  });
}
