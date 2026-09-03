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

// Alias et déformations courantes (abréviations, fautes de frappe, orthographe phonétique/anglaise)
const ALIASES = {
  'ge': 'genese', 'gn': 'genese', 'genese': 'genese',
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
  'ps': 'psaumes', 'psaume': 'psaumes', 'paume': 'psaumes', 'paumes': 'psaumes',
  'psalm': 'psaumes', 'psalms': 'psaumes', 'psaum': 'psaumes', 'psom': 'psaumes',
  'some': 'psaumes', 'somme': 'psaumes', 'sommes': 'psaumes',
  'prov': 'proverbes',
  'eccl': 'ecclesiaste',
  'esa': 'esaie', 'isaie': 'esaie', 'ésaïe': 'esaie',
  'jer': 'jeremie',
  'ez': 'ezechiel', 'ezek': 'ezechiel', 'ezekel': 'ezechiel',
  'dan': 'daniel',
  'mt': 'matthieu', 'matt': 'matthieu', 'mathieu': 'matthieu', 'mathieux': 'matthieu', 'matthieux': 'matthieu',
  'mc': 'marc',
  'lc': 'luc',
  'jn': 'jean', 'jean': 'jean',
  'act': 'actesdesapotres', 'actes': 'actesdesapotres',
  'rom': 'romains', 'romain': 'romains',
  '1co': '1corinthiens', '1cor': '1corinthiens', 'corinthien': '1corinthiens', 'corinthiens': '1corinthiens',
  '2co': '2corinthiens', '2cor': '2corinthiens',
  'gal': 'galates', 'galate': 'galates',
  'eph': 'ephesiens', 'ephesien': 'ephesiens',
  'phil': 'philippiens', 'php': 'philippiens', 'philippien': 'philippiens',
  'col': 'colossiens', 'colossien': 'colossiens',
  '1th': '1thessaloniciens', 'thessalonicien': '1thessaloniciens',
  '1tim': '1timothee',
  '2tim': '2timothee',
  'heb': 'hebreux', 'hébr': 'hebreux', 'hebreu': 'hebreux',
  'jc': 'jacques', 'jacq': 'jacques',
  '1p': '1pierre', '1pi': '1pierre',
  '2p': '2pierre',
  'apoc': 'apocalypse', 'ap': 'apocalypse', 'apocalypses': 'apocalypse'
};

function normalize(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

// Coquilles/déformation légères : compare deux chaînes normalisées avec une petite tolérance
// (distance de Levenshtein simplifiée, seulement pour départager les cas ambigus)
function levenshtein(a, b){
  const dp = Array.from({length: a.length+1}, (_, i) => [i, ...Array(b.length).fill(0)]);
  for(let j=0; j<=b.length; j++) dp[0][j] = j;
  for(let i=1; i<=a.length; i++){
    for(let j=1; j<=b.length; j++){
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j-1], dp[i-1][j], dp[i][j-1]);
    }
  }
  return dp[a.length][b.length];
}

// Liste de toutes les formes reconnues (noms canoniques + alias), triée des plus longues aux plus courtes
// pour toujours faire correspondre la forme la plus complète en premier (ex. "1corinthiens" avant "corinthiens")
const ALL_BOOK_FORMS = [
  ...Object.keys(BOOK_INDEX),
  ...Object.keys(ALIASES)
].sort((a, b) => b.length - a.length);

function resolveBookKey(key){
  if (BOOK_INDEX[key]) return BOOK_INDEX[key];
  if (ALIASES[key] && BOOK_INDEX[ALIASES[key]]) return BOOK_INDEX[ALIASES[key]];
  return null;
}

/* Analyse une référence écrite librement : "Psaumes 23:1-8", "psaumes23", "Jean 3 16",
   "Jean3v16", "paumes 23", "psalm 23"... peu importe la ponctuation ou les espaces. */
function parseFreeformReference(raw){
  const norm = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

  // Cherche la forme de livre la plus longue qui correspond au tout début de la chaîne
  let matchedForm = null;
  for (const form of ALL_BOOK_FORMS) {
    const candidate = norm.replace(/\s+/g, '').slice(0, form.length);
    if (candidate === form) {
      // Vérifie que ça correspond bien en tenant compte des espaces d'origine
      const withSpacesPattern = form.split('').join('\\s*');
      const re = new RegExp('^\\s*' + withSpacesPattern);
      const m = norm.match(re);
      if (m) { matchedForm = { form, matchedText: m[0] }; break; }
    }
  }

  if (!matchedForm) {
    // Tolérance aux petites fautes de frappe : compare le premier "mot" à chaque forme connue
    const firstWord = (norm.match(/^[a-z]+\d*/) || [''])[0].replace(/\d+$/, '');
    if (firstWord.length >= 3) {
      let best = null, bestDist = 3;
      for (const form of ALL_BOOK_FORMS) {
        const d = levenshtein(firstWord, form.replace(/\d+/g, ''));
        if (d < bestDist) { bestDist = d; best = form; }
      }
      if (best) matchedForm = { form: best, matchedText: firstWord };
    }
  }

  if (!matchedForm) return null;

  const book = resolveBookKey(matchedForm.form);
  if (!book) return null;

  const remainder = norm.slice(norm.indexOf(matchedForm.matchedText) + matchedForm.matchedText.length);
  const numbers = (remainder.replace(/[^0-9]/g, ' ').trim().match(/\d{1,3}/g) || []).map(n => parseInt(n, 10));

  if (numbers.length === 0) return null; // un livre sans aucun chapitre n'est pas exploitable

  return {
    book,
    chapter: numbers[0],
    verseStart: numbers[1] || null,
    verseEnd: numbers[2] || (numbers[1] || null)
  };
}

function getVerseText(book, chapterNum, verseNum) {
  const testament = bible.Testaments[book.tIdx];
  const bookData = testament.Books[book.bIdx];
  const chapter = bookData.Chapters[chapterNum - 1];
  if (!chapter) return null;
  const verse = chapter.Verses[verseNum - 1];
  return verse ? verse.Text : null;
}

function getChapterVerseCount(book, chapterNum){
  const testament = bible.Testaments[book.tIdx];
  const bookData = testament.Books[book.bIdx];
  const chapter = bookData.Chapters[chapterNum - 1];
  return chapter ? chapter.Verses.length : 0;
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
    let bookName, chapterNum, verseStart, verseEnd, book;

    const ref = url.searchParams.get('ref');
    if (ref) {
      const parsed = parseFreeformReference(ref);
      if (!parsed) {
        sendJson(res, 400, { error: `Référence "${ref}" non reconnue. Exemples valides : "Jean 3:16", "Psaumes 23", "Matthieu 5 v 3-12".` });
        return;
      }
      book = parsed.book;
      chapterNum = parsed.chapter;
      verseStart = parsed.verseStart;
      verseEnd = parsed.verseEnd;

      // Livre + chapitre sans verset précis : on renvoie le chapitre entier
      if (!verseStart) {
        const count = getChapterVerseCount(book, chapterNum);
        if (count === 0) {
          sendJson(res, 404, { error: `Chapitre ${book.canonicalName} ${chapterNum} introuvable.` });
          return;
        }
        verseStart = 1;
        verseEnd = count;
      }
    } else {
      bookName = url.searchParams.get('book');
      chapterNum = parseInt(url.searchParams.get('chapter'), 10);
      verseStart = parseInt(url.searchParams.get('verse'), 10);
      verseEnd = url.searchParams.get('verseEnd') ? parseInt(url.searchParams.get('verseEnd'), 10) : verseStart;
      book = findBookLegacy(bookName);
      if (!bookName || !chapterNum || !verseStart) {
        sendJson(res, 400, { error: 'Paramètres requis : ref="Livre chapitre[:verset[-verset]]" OU book, chapter, verse.' });
        return;
      }
      if (!book) {
        sendJson(res, 404, { error: `Livre "${bookName}" introuvable.` });
        return;
      }
    }

    if (verseEnd < verseStart) {
      sendJson(res, 400, { error: 'Le verset de fin doit être supérieur ou égal au verset de départ.' });
      return;
    }
    if (verseEnd - verseStart > 176) {
      sendJson(res, 400, { error: 'Plage trop large (176 versets maximum à la fois — la longueur du plus long chapitre de la Bible).' });
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

    // Plage de versets (ou chapitre entier)
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

function findBookLegacy(rawName){
  if(!rawName) return null;
  const key = normalize(rawName);
  return resolveBookKey(key) || (() => {
    const partial = Object.keys(BOOK_INDEX).find(k => k.includes(key) || key.includes(k));
    return partial ? BOOK_INDEX[partial] : null;
  })();
}

