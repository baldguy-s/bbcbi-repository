// Client-side mirror of lib/scriptureParser.js, used only to linkify scripture
// references inline in rendered entry/doc text. The authoritative index is
// built server-side on save (see routes/entries.js); this copy exists
// because the frontend has no build step to share a module between
// server (CommonJS) and browser (ES module) code.

const BOOKS = [
  { canonical: 'Genesis', aliases: ['genesis', 'gen', 'ge', 'gn'] },
  { canonical: 'Exodus', aliases: ['exodus', 'exod', 'exo', 'ex'] },
  { canonical: 'Leviticus', aliases: ['leviticus', 'lev', 'le', 'lv'] },
  { canonical: 'Numbers', aliases: ['numbers', 'num', 'nu', 'nm', 'nb'] },
  { canonical: 'Deuteronomy', aliases: ['deuteronomy', 'deut', 'de', 'dt'] },
  { canonical: 'Joshua', aliases: ['joshua', 'josh', 'jos', 'jsh'] },
  { canonical: 'Judges', aliases: ['judges', 'judg', 'jdg', 'jg', 'jdgs'] },
  { canonical: 'Ruth', aliases: ['ruth', 'rth', 'ru'] },
  { canonical: '1 Samuel', aliases: ['1 samuel', '1samuel', '1 sam', '1sam', '1 sa', 'i samuel', '1st samuel', 'first samuel'] },
  { canonical: '2 Samuel', aliases: ['2 samuel', '2samuel', '2 sam', '2sam', '2 sa', 'ii samuel', '2nd samuel', 'second samuel'] },
  { canonical: '1 Kings', aliases: ['1 kings', '1kings', '1 kgs', '1kgs', '1 ki', 'i kings', '1st kings', 'first kings'] },
  { canonical: '2 Kings', aliases: ['2 kings', '2kings', '2 kgs', '2kgs', '2 ki', 'ii kings', '2nd kings', 'second kings'] },
  { canonical: '1 Chronicles', aliases: ['1 chronicles', '1chronicles', '1 chron', '1chron', '1 chr', 'i chronicles', '1st chronicles', 'first chronicles'] },
  { canonical: '2 Chronicles', aliases: ['2 chronicles', '2chronicles', '2 chron', '2chron', '2 chr', 'ii chronicles', '2nd chronicles', 'second chronicles'] },
  { canonical: 'Ezra', aliases: ['ezra', 'ezr'] },
  { canonical: 'Nehemiah', aliases: ['nehemiah', 'neh', 'ne'] },
  { canonical: 'Esther', aliases: ['esther', 'esth', 'est'] },
  { canonical: 'Job', aliases: ['job', 'jb'] },
  { canonical: 'Psalms', aliases: ['psalms', 'psalm', 'pslm', 'ps', 'psa', 'psm'] },
  { canonical: 'Proverbs', aliases: ['proverbs', 'prov', 'pro', 'prv'] },
  { canonical: 'Ecclesiastes', aliases: ['ecclesiastes', 'eccles', 'eccle', 'ecc', 'qoh'] },
  { canonical: 'Song of Solomon', aliases: ['song of solomon', 'song of songs', 'song', 'sos', 'canticles'] },
  { canonical: 'Isaiah', aliases: ['isaiah', 'isa', 'is'] },
  { canonical: 'Jeremiah', aliases: ['jeremiah', 'jer', 'je'] },
  { canonical: 'Lamentations', aliases: ['lamentations', 'lam'] },
  { canonical: 'Ezekiel', aliases: ['ezekiel', 'ezek', 'eze'] },
  { canonical: 'Daniel', aliases: ['daniel', 'dan', 'da'] },
  { canonical: 'Hosea', aliases: ['hosea', 'hos'] },
  { canonical: 'Joel', aliases: ['joel', 'jl'] },
  { canonical: 'Amos', aliases: ['amos', 'am'] },
  { canonical: 'Obadiah', aliases: ['obadiah', 'obad', 'ob'] },
  { canonical: 'Jonah', aliases: ['jonah', 'jnh'] },
  { canonical: 'Micah', aliases: ['micah', 'mic'] },
  { canonical: 'Nahum', aliases: ['nahum', 'nah'] },
  { canonical: 'Habakkuk', aliases: ['habakkuk', 'hab'] },
  { canonical: 'Zephaniah', aliases: ['zephaniah', 'zeph', 'zep'] },
  { canonical: 'Haggai', aliases: ['haggai', 'hag'] },
  { canonical: 'Zechariah', aliases: ['zechariah', 'zech', 'zec'] },
  { canonical: 'Malachi', aliases: ['malachi', 'mal'] },
  { canonical: 'Matthew', aliases: ['matthew', 'matt', 'mt'] },
  { canonical: 'Mark', aliases: ['mark', 'mrk', 'mk', 'mr'] },
  { canonical: 'Luke', aliases: ['luke', 'luk', 'lk'] },
  { canonical: 'John', aliases: ['john', 'jn', 'jhn'] },
  { canonical: 'Acts', aliases: ['acts', 'act'] },
  { canonical: 'Romans', aliases: ['romans', 'rom', 'ro'] },
  { canonical: '1 Corinthians', aliases: ['1 corinthians', '1corinthians', '1 cor', '1cor', '1 co', 'i corinthians', '1st corinthians', 'first corinthians'] },
  { canonical: '2 Corinthians', aliases: ['2 corinthians', '2corinthians', '2 cor', '2cor', '2 co', 'ii corinthians', '2nd corinthians', 'second corinthians'] },
  { canonical: 'Galatians', aliases: ['galatians', 'gal'] },
  { canonical: 'Ephesians', aliases: ['ephesians', 'eph'] },
  { canonical: 'Philippians', aliases: ['philippians', 'phil', 'php'] },
  { canonical: 'Colossians', aliases: ['colossians', 'col'] },
  { canonical: '1 Thessalonians', aliases: ['1 thessalonians', '1thessalonians', '1 thess', '1thess', '1 th', 'i thessalonians', '1st thessalonians', 'first thessalonians'] },
  { canonical: '2 Thessalonians', aliases: ['2 thessalonians', '2thessalonians', '2 thess', '2thess', '2 th', 'ii thessalonians', '2nd thessalonians', 'second thessalonians'] },
  { canonical: '1 Timothy', aliases: ['1 timothy', '1timothy', '1 tim', '1tim', '1 ti', 'i timothy', '1st timothy', 'first timothy'] },
  { canonical: '2 Timothy', aliases: ['2 timothy', '2timothy', '2 tim', '2tim', '2 ti', 'ii timothy', '2nd timothy', 'second timothy'] },
  { canonical: 'Titus', aliases: ['titus', 'tit'] },
  { canonical: 'Philemon', aliases: ['philemon', 'philem', 'phm'] },
  { canonical: 'Hebrews', aliases: ['hebrews', 'heb'] },
  { canonical: 'James', aliases: ['james', 'jas', 'jam'] },
  { canonical: '1 Peter', aliases: ['1 peter', '1peter', '1 pet', '1pet', '1 pe', 'i peter', '1st peter', 'first peter'] },
  { canonical: '2 Peter', aliases: ['2 peter', '2peter', '2 pet', '2pet', '2 pe', 'ii peter', '2nd peter', 'second peter'] },
  { canonical: '1 John', aliases: ['1 john', '1john', '1 jn', '1jn', 'i john', '1st john', 'first john'] },
  { canonical: '2 John', aliases: ['2 john', '2john', '2 jn', '2jn', 'ii john', '2nd john', 'second john'] },
  { canonical: '3 John', aliases: ['3 john', '3john', '3 jn', '3jn', 'iii john', '3rd john', 'third john'] },
  { canonical: 'Jude', aliases: ['jude', 'jud'] },
  { canonical: 'Revelation', aliases: ['revelation', 'revelations', 'rev'] },
];

const BOOK_ORDER = new Map(BOOKS.map((b, i) => [b.canonical, i]));

const ALIAS_TO_CANONICAL = new Map();
for (const book of BOOKS) {
  for (const alias of book.aliases) {
    ALIAS_TO_CANONICAL.set(alias, book.canonical);
  }
}
const SORTED_ALIASES = [...ALIAS_TO_CANONICAL.keys()].sort((a, b) => b.length - a.length);

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const bookAlternation = SORTED_ALIASES
  .map((alias) => escapeRegex(alias).replace(/\\ /g, '\\s+'))
  .join('|');

function buildRegex() {
  return new RegExp(
    `\\b(${bookAlternation})\\b\\.?\\s+(\\d{1,3})(?::(\\d{1,3})(?:[-–](\\d{1,3})(?::(\\d{1,3}))?)?)?`,
    'gi'
  );
}

export function bookSortIndex(book) {
  return BOOK_ORDER.has(book) ? BOOK_ORDER.get(book) : BOOKS.length;
}

// Structured extraction (mirrors lib/scriptureParser.js in the server
// version) — used here by api.js to compute the Scripture Index on the fly,
// since there's no server to persist a scripture_refs table client-side.
export function extractRefs(bodyMarkdown) {
  if (!bodyMarkdown) return [];

  const refs = [];
  const regex = buildRegex();
  let match;

  while ((match = regex.exec(bodyMarkdown)) !== null) {
    const [raw, aliasMatched, chapterStr, verseStartStr, rangeEndStr, verseEndAfterColonStr] = match;
    const canonical = ALIAS_TO_CANONICAL.get(aliasMatched.toLowerCase());
    if (!canonical) continue;

    const chapter = parseInt(chapterStr, 10);
    const verseStart = verseStartStr ? parseInt(verseStartStr, 10) : null;

    let chapterEnd = null;
    let verseEnd = null;

    if (verseStartStr && rangeEndStr) {
      if (verseEndAfterColonStr) {
        chapterEnd = parseInt(rangeEndStr, 10);
        verseEnd = parseInt(verseEndAfterColonStr, 10);
      } else {
        verseEnd = parseInt(rangeEndStr, 10);
      }
    }

    refs.push({ book: canonical, chapter, chapterEnd, verseStart, verseEnd, raw: raw.trim() });
  }

  return refs;
}

// Wraps each detected reference in the raw markdown with a markdown link
// pointing into the Scripture Index route, before the body is handed to
// marked.parse(). Cheap and good-enough: doesn't try to avoid relinking text
// already inside a markdown link/code span.
export function linkify(bodyMarkdown) {
  if (!bodyMarkdown) return '';
  const regex = buildRegex();
  return bodyMarkdown.replace(regex, (raw, aliasMatched, chapterStr) => {
    const canonical = ALIAS_TO_CANONICAL.get(aliasMatched.toLowerCase());
    if (!canonical) return raw;
    const href = `#/scripture/${encodeURIComponent(canonical)}/${chapterStr}`;
    return `[${raw}](${href})`;
  });
}
