// Habillage "terminal" : couleurs ANSI, bannière, traces façon console de hacker.
// Aucune dépendance : les couleurs sont de simples séquences d'échappement ANSI.

const tty = Boolean(process.stdout.isTTY);
const couleurs = tty && !('NO_COLOR' in process.env);

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

// Ligne de trace : │ [outil]   détail
export function trace(outil, texte) {
  console.log(`${gris('│')} ${cyan(`[${outil}]`.padEnd(10))} ${gris(texte)}`);
}

// Affiche une commande comme si on la tapait dans un shell.
export function commande(programme, args = []) {
  const citer = (a) => (/[\s"'$\\]/.test(a) ? JSON.stringify(a) : a);
  console.log(`${vertVif('$')} ${vert(programme)} ${args.map(citer).join(' ')}`);
}

export const ok = (t) => console.log(`${vertVif('[+]')} ${t}`);
export const info = (t) => console.log(`${cyan('[*]')} ${t}`);
export const alerte = (t) => console.log(`${jaune('[!]')} ${t}`);
export const erreur = (t) => console.error(`${rouge('[x]')} ${t}`);

export function titre(texte) {
  const trait = '─'.repeat(Math.max(4, 62 - texte.length));
  console.log(`\n${vertVif(`┌─[ ${texte} ]${trait}`)}`);
}

// Effet "machine à écrire" (désactivé si la sortie n'est pas un terminal).
export async function taper(texte, ms = 4) {
  if (!tty) return console.log(texte);
  for (const caractere of texte) {
    process.stdout.write(caractere);
    await pause(ms);
  }
  process.stdout.write('\n');
}

// Petite animation pendant les opérations longues (conversion Calibre).
export function spinner(libelle) {
  if (!tty) {
    console.log(`… ${libelle}`);
    return { stop() {} };
  }
  const images = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  const debut = Date.now();
  const minuteur = setInterval(() => {
    const secondes = ((Date.now() - debut) / 1000).toFixed(1);
    process.stdout.write(`\r${vertVif(images[i++ % images.length])} ${libelle} ${gris(`${secondes}s`)}`);
  }, 80);
  return {
    stop() {
      clearInterval(minuteur);
      process.stdout.write('\r\x1b[2K');
    },
  };
}

const BANNIERE = String.raw`
 _  __ ___  ___  ___        _____  _______ ___    _    ___ _____
| |/ // _ \| _ )/ _ \  ___ | __\ \/ /_   _| _ \  /_\  / __|_   _|
| ' <| (_) | _ \ (_) ||___|| _| >  <  | | |   / / _ \| (__  | |
|_|\_\\___/|___/\___/      |___/_/\_\ |_| |_|_\/_/ \_\\___| |_|
`;

export async function banniere() {
  console.log(vertVif(BANNIERE));
  await taper(gris('  > mode .............. LECTURE SEULE (rien n’est écrit sur la liseuse)'));
  await taper(gris('  > politique DRM ..... détection uniquement, aucun contournement'));
  await taper(gris('  > cadre légal ....... CPI art. L.335-3-1'));
}
