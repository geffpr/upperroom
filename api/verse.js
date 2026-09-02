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

module.exports = async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    // Accepte soit ?ref=Jean 3:16, soit ?book=Jean&chapter=3&verse=16
    let bookName, chapterNum, verseNum;

    const ref = url.searchParams.get('ref');
    if (ref) {
      const match = ref.trim().match(/^(.+?)\s+(\d+)\s*:\s*(\d+)$/);
      if (!match) {
        sendJson(res, 400, { error: 'Format de référence invalide. Attendu : "Livre chapitre:verset", ex. "Jean 3:16".' });
        return;
      }
      bookName = match[1];
      chapterNum = parseInt(match[2], 10);
      verseNum = parseInt(match[3], 10);
    } else {
      bookName = url.searchParams.get('book');
      chapterNum = parseInt(url.searchParams.get('chapter'), 10);
      verseNum = parseInt(url.searchParams.get('verse'), 10);
    }

    if (!bookName || !chapterNum || !verseNum) {
      sendJson(res, 400, { error: 'Paramètres requis : ref="Livre chapitre:verset" OU book, chapter, verse.' });
      return;
    }

    const book = findBook(bookName);
    if (!book) {
      sendJson(res, 404, { error: `Livre "${bookName}" introuvable.` });
      return;
    }

    const text = getVerseText(book, chapterNum, verseNum);
    if (!text) {
      sendJson(res, 404, { error: `Verset ${book.canonicalName} ${chapterNum}:${verseNum} introuvable.` });
      return;
    }

    sendJson(res, 200, {
      book: book.canonicalName,
      chapter: chapterNum,
      verse: verseNum,
      reference: `${book.canonicalName} ${chapterNum}:${verseNum}`,
      text,
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
