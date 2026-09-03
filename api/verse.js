const bible = require('./data/lsg.json');

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify(body));
}

// Table des livres : nom canonique -> {testament, index}
const BOOK_INDEX = {};
bible.Testaments.forEach((testament, tIdx) => {
  testament.Books.forEach((book, bIdx) => {
    BOOK_INDEX[normalize(book.Text)] = { tIdx, bIdx, canonicalName: book.Text };
  });
});

// Alias courants (façons de dire un livre à l'oral, abréviations usuelles)
const ALIASES = {
  'ge': 'genese', 'gn': 'genese',
  'ex': 'exode',
  'lev': 'levitique', 'lv': 'levitique',
  'nb': 'nombres', 'nom': 'nombres',
  'dt': 'deuteronome', 'deut': 'deuteronome',
  'jos': 'josue',
  'jg': 'juges', 'jug': 'juges',
  '1s': '1samuel', '1sam': '1samuel',
  '2s': '2samuel', '2sam': '2samuel',
  '1r': '1rois',
  '2r': '2rois',
  'ps': 'psaumes', 'psaume': 'psaumes',
  'prov': 'proverbes',
  'eccl': 'ecclesiaste',
  'esa': 'esaie', 'isaie': 'esaie', 'ésaïe': 'esaie',
  'jer': 'jeremie',
  'ez': 'ezechiel', 'ezek': 'ezechiel',
  'dan': 'daniel',
  'mt': 'matthieu', 'matt': 'matthieu',
  'mc': 'marc',
  'lc': 'luc',
  'jn': 'jean',
  'act': 'actesdesapotres', 'actes': 'actesdesapotres',
  'rom': 'romains',
  '1co': '1corinthiens', '1cor': '1corinthiens',
  '2co': '2corinthiens', '2cor': '2corinthiens',
  'gal': 'galates',
  'eph': 'ephesiens',
  'phil': 'philippiens', 'php': 'philippiens',
  'col': 'colossiens',
  '1th': '1thessaloniciens', '1tim': '1timothee',
  '2tim': '2timothee',
  'heb': 'hebreux', 'hébr': 'hebreux',
  'jc': 'jacques', 'jacq': 'jacques',
  '1p': '1pierre', '1pi': '1pierre',
  '2p': '2pierre',
  'apoc': 'apocalypse', 'ap': 'apocalypse'
};

function normalize(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function findBook(rawName) {
  const key = normalize(rawName);
  if (BOOK_INDEX[key]) return BOOK_INDEX[key];
  const aliasKey = ALIASES[key];
  if (aliasKey && BOOK_INDEX[aliasKey]) return BOOK_INDEX[aliasKey];
  // Recherche partielle (ex. "corinthien" doit matcher "1corinthiens")
  const partial = Object.keys(BOOK_INDEX).find(k => k.includes(key) || key.includes(k));
  return partial ? BOOK_INDEX[partial] : null;
}

function getVerseText(book, chapterNum, verseNum) {
  const testament = bible.Testaments[book.tIdx];
  const bookData = testament.Books[book.bIdx];
  const chapter = bookData.Chapters[chapterNum - 1];
  if (!chapter) return null;
  const verse = chapter.Verses[verseNum - 1];
  return verse ? verse.Text : null;
}

function getVerseRangeText(book, chapterNum, verseStart, verseEnd) {
  const parts = [];
  for (let v = verseStart; v <= verseEnd; v++) {
    const text = getVerseText(book, chapterNum, v);
    if (text) parts.push({ verse: v, text });
  }
  return parts;
}

module.exports = async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let bookName, chapterNum, verseStart, verseEnd;

    const ref = url.searchParams.get('ref');
    if (ref) {
      // Accepte "Livre chapitre:verset" OU "Livre chapitre:verset-verset" (plage)
      const match = ref.trim().match(/^(.+?)\s+(\d+)\s*:\s*(\d+)(?:\s*-\s*(\d+))?$/);
      if (!match) {
        sendJson(res, 400, { error: 'Format de référence invalide. Attendu : "Livre chapitre:verset" ou "Livre chapitre:verset-verset", ex. "Psaumes 23:1-8".' });
        return;
      }
      bookName = match[1];
      chapterNum = parseInt(match[2], 10);
      verseStart = parseInt(match[3], 10);
      verseEnd = match[4] ? parseInt(match[4], 10) : verseStart;
    } else {
      bookName = url.searchParams.get('book');
      chapterNum = parseInt(url.searchParams.get('chapter'), 10);
      verseStart = parseInt(url.searchParams.get('verse'), 10);
      verseEnd = url.searchParams.get('verseEnd') ? parseInt(url.searchParams.get('verseEnd'), 10) : verseStart;
    }

    if (!bookName || !chapterNum || !verseStart) {
      sendJson(res, 400, { error: 'Paramètres requis : ref="Livre chapitre:verset[-verset]" OU book, chapter, verse.' });
      return;
    }
    if (verseEnd < verseStart) {
      sendJson(res, 400, { error: 'Le verset de fin doit être supérieur ou égal au verset de départ.' });
      return;
    }
    if (verseEnd - verseStart > 40) {
      sendJson(res, 400, { error: 'Plage trop large (40 versets maximum à la fois).' });
      return;
    }

    const book = findBook(bookName);
    if (!book) {
      sendJson(res, 404, { error: `Livre "${bookName}" introuvable.` });
      return;
    }

    const isRange = verseEnd > verseStart;

    if (!isRange) {
      const text = getVerseText(book, chapterNum, verseStart);
      if (!text) {
        sendJson(res, 404, { error: `Verset ${book.canonicalName} ${chapterNum}:${verseStart} introuvable.` });
        return;
      }
      sendJson(res, 200, {
        book: book.canonicalName,
        chapter: chapterNum,
        verse: verseStart,
        reference: `${book.canonicalName} ${chapterNum}:${verseStart}`,
        text,
        version: 'LSG'
      });
      return;
    }

    // Plage de versets
    const verses = getVerseRangeText(book, chapterNum, verseStart, verseEnd);
    if (verses.length === 0) {
      sendJson(res, 404, { error: `Aucun verset trouvé pour ${book.canonicalName} ${chapterNum}:${verseStart}-${verseEnd}.` });
      return;
    }
    const combinedText = verses.map(v => `[${v.verse}] ${v.text}`).join(' ');

    sendJson(res, 200, {
      book: book.canonicalName,
      chapter: chapterNum,
      verseStart,
      verseEnd: verses[verses.length - 1].verse,
      reference: `${book.canonicalName} ${chapterNum}:${verseStart}-${verses[verses.length - 1].verse}`,
      text: combinedText,
      verses,
      version: 'LSG'
    });

  } catch (err) {
    console.error('Erreur recherche verset:', err && err.stack ? err.stack : err);
    try {
      sendJson(res, 500, { error: 'Erreur serveur: ' + (err && err.message ? err.message : String(err)) });
    } catch (sendErr) {
      console.error('Impossible même d\'envoyer la réponse d\'erreur:', sendErr);
    }
  }
};
