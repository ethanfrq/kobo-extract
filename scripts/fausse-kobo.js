// Génère une fausse liseuse Kobo (./fausse-kobo) avec 8 cas de test.
// Usage : node --no-warnings scripts/fausse-kobo.js [dossier]

import AdmZip from 'adm-zip';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const RACINE = resolve(process.argv[2] ?? 'fausse-kobo');

// ---------- Préparation du dossier ----------

if (existsSync(RACINE)) {
  // Sécurité : on ne supprime que si c'est déjà une (fausse) Kobo ou un dossier vide.
  if (!existsSync(join(RACINE, '.kobo')) && readdirSync(RACINE).length) {
    console.error(`Refus : ${RACINE} existe et n'est pas une fausse Kobo.`);
    process.exit(1);
  }
  rmSync(RACINE, { recursive: true, force: true });
}
for (const d of ['.kobo/kepub', 'Livres', 'Documents']) mkdirSync(join(RACINE, d), { recursive: true });

// ---------- Fabrique d'EPUB ----------

const xml = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function pageXhtml(titre, paragraphes) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="fr">
<head><title>${xml(titre)}</title></head>
<body>
<h1>${xml(titre)}</h1>
${paragraphes.map((p) => `<p>${xml(p)}</p>`).join('\n')}
</body>
</html>
`;
}

/**
 * chapitres : [{ titre, paragraphes } | { titre, octets }]
 * enPlus    : { "chemin/dans/le/zip": contenu }
 * manifesteEnPlus : lignes <item> supplémentaires pour l'OPF
 */
function creerEpub({ uuid, titre, auteur, chapitres, enPlus = {}, manifesteEnPlus = '', meta = '' }) {
  const zip = new AdmZip({ noSort: true }); // noSort : garder l’ordre d’ajout (mimetype en premier)

  // 1. "mimetype" doit être le PREMIER fichier, NON compressé.
  zip.addFile('mimetype', Buffer.from('application/epub+zip'));
  zip.getEntry('mimetype').header.method = 0; // 0 = STORED

  zip.addFile(
    'META-INF/container.xml',
    Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`),
  );

  const items = chapitres
    .map((_, i) => `    <item id="chap${i + 1}" href="chapitre${i + 1}.xhtml" media-type="application/xhtml+xml"/>`)
    .join('\n');
  const spine = chapitres.map((_, i) => `    <itemref idref="chap${i + 1}"/>`).join('\n');

  zip.addFile(
    'OEBPS/content.opf',
    Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>${xml(titre)}</dc:title>
    <dc:creator opf:role="aut">${xml(auteur)}</dc:creator>
    <dc:language>fr</dc:language>
    <dc:identifier id="bookid">urn:uuid:${uuid}</dc:identifier>${meta}
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
${items}${manifesteEnPlus}
  </manifest>
  <spine toc="ncx">
${spine}
  </spine>
</package>
`),
  );

  const points = chapitres
    .map(
      (c, i) => `    <navPoint id="np${i + 1}" playOrder="${i + 1}">
      <navLabel><text>${xml(c.titre)}</text></navLabel>
      <content src="chapitre${i + 1}.xhtml"/>
    </navPoint>`,
    )
    .join('\n');
  zip.addFile(
    'OEBPS/toc.ncx',
    Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="urn:uuid:${uuid}"/></head>
  <docTitle><text>${xml(titre)}</text></docTitle>
  <navMap>
${points}
  </navMap>
</ncx>
`),
  );

  chapitres.forEach((c, i) => {
    zip.addFile(`OEBPS/chapitre${i + 1}.xhtml`, c.octets ?? Buffer.from(pageXhtml(c.titre, c.paragraphes)));
  });
  for (const [nom, contenu] of Object.entries(enPlus)) zip.addFile(nom, Buffer.from(contenu));

  return zip.toBuffer();
}

// ---------- Fabrique de PDF ----------
// PDF minimal mais valide : 1 page A5, police Helvetica, table xref aux décalages exacts.

function creerPdf(lignes, { chiffre = false } = {}) {
  const echapper = (t) => t.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const flux = ['BT', '/F1 14 Tf', '50 540 Td', '18 TL', ...lignes.map((l) => `(${echapper(l)}) '`), 'ET'].join('\n');

  const objets = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 595] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(flux, 'latin1')} >>\nstream\n${flux}\nendstream`,
  ];
  if (chiffre) {
    // Dictionnaire de chiffrement FACTICE au format Adobe ADEPT (aucune vraie clé).
    objets.push('<< /Filter /EBX_HANDLER /V 2 /R 3 /Length 128 /P -4 /EBX_BOOKID (faux-livre-de-test) >>');
  }

  let pdf = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const decalages = [];
  objets.forEach((o, i) => {
    decalages.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const debutXref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n`;
  pdf += decalages.map((d) => `${String(d).padStart(10, '0')} 00000 n \n`).join('');
  const id = '<6b6f626f2d657874726163742d74657374>';
  const encrypt = chiffre ? ` /Encrypt ${objets.length} 0 R /ID [${id} ${id}]` : '';
  pdf += `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R${encrypt} >>\nstartxref\n${debutXref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

// ---------- Les 8 cas ----------

const texte = (titre) => [
  `Ceci est un livre de test généré pour « ${titre} ».`,
  'Il sert à vérifier que kobo-extract reconnaît correctement chaque cas.',
];

const ecrire = (relatif, octets) => writeFileSync(join(RACINE, ...relatif.split('/')), octets);
const perso = (relatif) => 'file:///mnt/onboard/' + relatif.split('/').map(encodeURIComponent).join('/');

const UUID = (n) => `a1b2c3d4-000${n}-4000-8000-00000000000${n}`;
const lignesBase = []; // [ContentID, ContentType, MimeType, Title, Attribution]

// 1. EPUB perso libre (avec une police "brouillée" : ce n'est PAS une DRM)
ecrire(
  'Livres/Le Petit Guide libre.epub',
  creerEpub({
    uuid: UUID(1),
    titre: 'Le Petit Guide libre',
    auteur: 'Camille Martin',
    chapitres: [
      { titre: 'Chapitre 1', paragraphes: texte('Le Petit Guide libre') },
      { titre: 'Chapitre 2', paragraphes: ['Deuxième chapitre, toujours lisible.'] },
    ],
    manifesteEnPlus: '\n    <item id="police" href="polices/police.otf" media-type="application/vnd.ms-opentype"/>',
    enPlus: {
      'OEBPS/polices/police.otf': randomBytes(256),
      'META-INF/encryption.xml': `<?xml version="1.0" encoding="UTF-8"?>
<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#">
  <enc:EncryptedData>
    <enc:EncryptionMethod Algorithm="http://www.idpf.org/2008/embedding"/>
    <enc:CipherData><enc:CipherReference URI="OEBPS/polices/police.otf"/></enc:CipherData>
  </enc:EncryptedData>
</encryption>
`,
    },
  }),
);
lignesBase.push([perso('Livres/Le Petit Guide libre.epub'), '6', 'application/epub+zip', 'Le Petit Guide libre', 'Camille Martin']);

// 2. PDF perso libre
ecrire('Documents/Notes de cours.pdf', creerPdf(['Notes de cours', 'PDF libre de test.']));
lignesBase.push([perso('Documents/Notes de cours.pdf'), '6', 'application/pdf', 'Notes de cours', 'Alex Durand']);

// 3. EPUB avec rights.xml (DRM Adobe)
ecrire(
  'Livres/Roman Adobe.epub',
  creerEpub({
    uuid: UUID(3),
    titre: 'Roman Adobe',
    auteur: 'Dominique Petit',
    chapitres: [{ titre: 'Chapitre 1', paragraphes: texte('Roman Adobe') }],
    enPlus: {
      'META-INF/rights.xml': `<?xml version="1.0"?>
<adept:rights xmlns:adept="http://ns.adobe.com/adept">
  <!-- Fichier FACTICE de test : aucune vraie licence. -->
  <adept:licenseToken><adept:resource>urn:uuid:${UUID(3)}</adept:resource></adept:licenseToken>
</adept:rights>
`,
    },
  }),
);
lignesBase.push([perso('Livres/Roman Adobe.epub'), '6', 'application/epub+zip', 'Roman Adobe', 'Dominique Petit']);

// 4. PDF avec /Encrypt EBX_HANDLER (DRM Adobe)
ecrire('Documents/Rapport Adobe.pdf', creerPdf(['Rapport Adobe', 'PDF verrouillé de test.'], { chiffre: true }));
lignesBase.push([perso('Documents/Rapport Adobe.pdf'), '6', 'application/pdf', 'Rapport Adobe', 'Sacha Bernard']);

// 5. .kepub.epub pas encore indexé (aucune ligne dans la base)
ecrire(
  'Livres/Nouveau livre.kepub.epub',
  creerEpub({
    uuid: UUID(5),
    titre: 'Nouveau livre',
    auteur: 'Lou Moreau',
    chapitres: [{ titre: 'Chapitre 1', paragraphes: texte('Nouveau livre') }],
  }),
);

// 6. Achat boutique tatoué, sans DRM, dans .kobo/kepub (fichier sans extension)
ecrire(
  `.kobo/kepub/${UUID(6)}`,
  creerEpub({
    uuid: UUID(6),
    titre: 'Achat tatoué',
    auteur: 'Maxime Laurent',
    meta: '\n    <meta name="tatouage" content="Exemplaire acheté par le client n°12345"/>',
    chapitres: [
      {
        titre: 'Chapitre 1',
        paragraphes: [...texte('Achat tatoué'), 'Tatouage numérique : exemplaire acheté par le client n°12345.'],
      },
    ],
  }),
);
lignesBase.push([UUID(6), '6', 'application/x-kobo-epub+zip', 'Achat tatoué', 'Maxime Laurent']);

// 7. Achat chiffré par Kobo : chapitre = octets aléatoires + ligne dans content_keys
const brouille = randomBytes(2048);
brouille[0] = 0xff; // garantit que ce n'est ni "<" ni de l'UTF-8 valide
ecrire(
  `.kobo/kepub/${UUID(7)}`,
  creerEpub({
    uuid: UUID(7),
    titre: 'Achat chiffré',
    auteur: 'Noa Girard',
    chapitres: [{ titre: 'Chapitre 1', octets: brouille }],
  }),
);
lignesBase.push([UUID(7), '6', 'application/x-kobo-epub+zip', 'Achat chiffré', 'Noa Girard']);

// 8. Achat présent dans la base, absent du disque
lignesBase.push([UUID(8), '6', 'application/x-kobo-epub+zip', 'Achat dans le nuage', 'Charlie Roux']);

// ---------- Base SQLite ----------

const db = new DatabaseSync(join(RACINE, '.kobo', 'KoboReader.sqlite'));
db.exec(`
  CREATE TABLE content (
    ContentID   TEXT NOT NULL PRIMARY KEY,
    ContentType TEXT NOT NULL,
    MimeType    TEXT NOT NULL,
    BookID      TEXT,
    Title       TEXT,
    Attribution TEXT,
    ___UserID   TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE content_keys (
    ___UserID  TEXT NOT NULL,
    volumeId   TEXT NOT NULL,
    elementId  TEXT NOT NULL,
    elementKey TEXT,
    PRIMARY KEY (volumeId, elementId)
  );
`);
const inserer = db.prepare('INSERT INTO content (ContentID, ContentType, MimeType, BookID, Title, Attribution) VALUES (?, ?, ?, ?, ?, ?)');
for (const [id, type, mime, titre, auteur] of lignesBase) inserer.run(id, type, mime, null, titre, auteur);

// Lignes "chapitre" (ContentType 9) : elles doivent être ignorées par kobo-extract.
for (const n of [6, 7]) {
  inserer.run(`${UUID(n)}!OEBPS!chapitre1.xhtml`, '9', 'application/xhtml+xml', UUID(n), 'Chapitre 1', '');
}

db.prepare('INSERT INTO content_keys VALUES (?, ?, ?, ?)').run(
  'utilisateur-test',
  UUID(7),
  'OEBPS/chapitre1.xhtml',
  'FAUSSE-VALEUR-DE-TEST', // pas une vraie clé
);
db.close();

writeFileSync(join(RACINE, '.kobo', 'version'), 'N000000000000,4.38.0,4.38.0,4.38.0,4.38.0,00000000-0000-0000-0000-000000000000\n');

console.log(`Fausse Kobo créée : ${RACINE}`);
console.log(`
Résultats attendus :
  1. Le Petit Guide libre   ✅ libre (police brouillée ≠ DRM)
  2. Notes de cours         ✅ libre (PDF)
  3. Roman Adobe            🔒 DRM Adobe (rights.xml)
  4. Rapport Adobe          🔒 DRM Adobe (EBX_HANDLER)
  5. Nouveau livre          ✅ libre (non indexé)
  6. Achat tatoué           ✅ libre (kepub sans extension)
  7. Achat chiffré          🔒 chiffré par Kobo (content_keys)
  8. Achat dans le nuage    ☁️  pas encore téléchargé
`);
