// Fetches regional RSS feeds, filters for UFO/paranormal-related keywords,
// and writes the result to js/news-data.js. Run via .github/workflows/update-news.yml.
import Parser from "rss-parser";
import { writeFile } from "node:fs/promises";

const parser = new Parser({
  customFields: {
    item: [
      ["media:thumbnail", "mediaThumbnail"],
      ["media:content", "mediaContent"],
      ["source", "gnSource"],
    ],
  },
});

// Google News search RSS aggregates across many publishers for a region
// (not just one outlet) — the query itself does the keyword narrowing,
// and KEYWORD_PATTERN below still re-checks every item as a safety net.
const GOOGLE_NEWS_QUERY_TERMS = [
  "UFO", "UAP", "alien", "aliens", "paranormal", "ghost", "ghosts",
  "cryptid", "cryptids", "bigfoot",
  '"unidentified anomalous phenomena"', '"unidentified aerial phenomena"',
];

function googleNewsUrl({ hl, gl, ceid }) {
  const params = new URLSearchParams({
    q: GOOGLE_NEWS_QUERY_TERMS.join(" OR "),
    hl,
    gl,
    ceid,
  });
  return `https://news.google.com/rss/search?${params.toString()}`;
}

// Google News titles arrive as "Headline - Publisher" with the real
// publisher in a <source> tag — pull both apart so cards show the
// original outlet instead of "Google News" for every story.
function parseGoogleNewsItem(item, fallbackName) {
  const source =
    (typeof item.gnSource === "string" && item.gnSource) ||
    item.gnSource?._ ||
    fallbackName;

  let title = (item.title || "").trim();
  const suffix = ` - ${source}`;
  if (title.endsWith(suffix)) {
    title = title.slice(0, -suffix.length).trim();
  }

  return { sourceName: source, title };
}

const FEEDS = {
  uk: [
    { url: "https://feeds.bbci.co.uk/news/uk/rss.xml", name: "BBC News" },
    { url: "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml", name: "BBC Science & Environment" },
    {
      url: googleNewsUrl({ hl: "en-GB", gl: "GB", ceid: "GB:en" }),
      name: "Google News (UK)",
      parseItem: (item) => parseGoogleNewsItem(item, "Google News (UK)"),
    },
  ],
  europe: [
    { url: "https://www.euronews.com/rss", name: "Euronews" },
    { url: "https://www.esa.int/rssfeed/TopNews", name: "European Space Agency" },
    {
      // Google News has no "Europe" continent edition, only country ones —
      // the Ireland edition is used as an English-language stand-in.
      url: googleNewsUrl({ hl: "en-IE", gl: "IE", ceid: "IE:en" }),
      name: "Google News (Europe)",
      parseItem: (item) => parseGoogleNewsItem(item, "Google News (Europe)"),
    },
  ],
  us: [
    { url: "https://feeds.npr.org/1001/rss.xml", name: "NPR News" },
    { url: "https://www.nasa.gov/rss/dyn/breaking_news.rss", name: "NASA" },
    {
      url: googleNewsUrl({ hl: "en-US", gl: "US", ceid: "US:en" }),
      name: "Google News (US)",
      parseItem: (item) => parseGoogleNewsItem(item, "Google News (US)"),
    },
  ],
};

const KEYWORD_PATTERN = new RegExp(
  "\\b(ufos?|uaps?|aliens?|extraterrestrial|paranormal|ghosts?|haunt(ed|ing)?|cryptids?|bigfoot|" +
  "unidentified (anomalous|aerial|flying) (phenomena|object)s?)\\b",
  "i"
);

// Common "ghost"/"haunt"/"bigfoot"/"alien" hits are entertainment coverage
// (a TV show literally called Ghosts, "Ghost Recon" the video game, a band's
// album, etc.) rather than real paranormal/UFO news — drop matches that also
// look like entertainment coverage. Imperfect (a headline alone doesn't
// always give this away), but removes most of the noise.
const NOISE_PATTERN = new RegExp(
  "\\b(movie|film|box office|tv series|television series|sitcom|season \\d+|episode|trailer|" +
  "album|\\bep\\b|single|tour dates?|concert|setlist|band|musician|rapper|singer|songwriter|" +
  "theatre|theater|broadway|west end|musical|" +
  "video ?game|xbox|playstation|nintendo|ubisoft|\\bdlc\\b|" +
  "netflix|hbo|disney\\+|hulu|amazon prime video|" +
  "actor|actress|casting|starring|sequel|franchise|spin-?off|reboot)\\b",
  "i"
);

// A handful of outlets in these feeds are entertainment/gaming publications
// specifically — any of their stories that slip past NOISE_PATTERN (e.g. a
// headline with no obvious entertainment keyword) are still filtered here.
const NOISE_SOURCE_PATTERN = /\b(NME|Gizmodo|Collider|BroadwayWorld|Niche Gamer|OpenCritic|Babystep Magazine|Live4ever Media|The Bold Italic)\b/i;

// "Ghost"/"alien" are also everyday idioms unrelated to the paranormal —
// fraud/logistics jargon ("ghost gun", "ghost employees") and immigration
// terminology ("illegal/overstaying alien"). Catch the specific phrasings
// observed in practice; this list will need to grow as new idioms surface.
const IDIOM_NOISE_PATTERN = new RegExp(
  "\\b(ghost gun|ghost employee|ghost worker|ghost payroll|ghost car|ghost fleet|" +
  "(illegal|overstaying|undocumented|resident) alien|alien (smuggling|registration|deportation))\\b",
  "i"
);

const MAX_ITEMS_PER_REGION = 24;
const REQUEST_HEADERS = { "User-Agent": "Mozilla/5.0 ParalnoiaNewsBot/1.0 (+https://github.com/jimrbrodie/Building_Paralnoia)" };

function stripHtml(html) {
  return (html || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function truncate(text, max) {
  if (text.length <= max) return text;
  return text.slice(0, max).replace(/\s+\S*$/, "") + "…";
}

// Google News descriptions are "{title} {source}" — if a source's own
// name happens to contain a trigger word (e.g. a real US radio station
// called "Bigfoot 99 Radio"), that word must not count as a content match.
function stripSourceSuffix(text, source) {
  if (!source) return text;
  const suffix = ` ${source}`;
  return text.endsWith(suffix) ? text.slice(0, -suffix.length).trim() : text;
}

function buildExcerpt(rawSnippet, title, source) {
  const cleaned = stripHtml(rawSnippet);

  // Google News descriptions are just "{title} {source}" restated, not a
  // real summary — detect that pattern (rather than requiring an exact
  // match, since the source name is appended) and fall back to a generic line.
  const looksLikeTitleRepeat =
    cleaned.toLowerCase().startsWith(title.toLowerCase()) &&
    cleaned.length - title.length < 60;

  if (!cleaned || cleaned.length < 15 || looksLikeTitleRepeat) {
    return `Read the full story from ${source}.`;
  }
  return truncate(cleaned, 160);
}

function extractImage(item) {
  if (item.mediaThumbnail?.$?.url) return item.mediaThumbnail.$.url;
  if (item.mediaContent?.$?.url) return item.mediaContent.$.url;
  if (item.enclosure?.url) return item.enclosure.url;
  const match = /<img[^>]+src="([^"]+)"/i.exec(item.content || item["content:encoded"] || "");
  return match ? match[1] : null;
}

async function fetchFeed(feed) {
  try {
    const res = await fetch(feed.url, { headers: REQUEST_HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const parsed = await parser.parseString(xml);
    return (parsed.items || []).map((item) => {
      const overrides = feed.parseItem ? feed.parseItem(item) : { sourceName: feed.name };
      return { ...item, ...overrides };
    });
  } catch (err) {
    console.error(`Failed to fetch ${feed.name} (${feed.url}): ${err.message}`);
    return [];
  }
}

// Returns every matching item, sorted newest-first, deliberately NOT sliced
// to a max count or deduped against other regions yet — main() handles
// cross-region deduplication before each region's final cut is taken.
async function buildRegion(feeds) {
  const results = await Promise.all(feeds.map(fetchFeed));
  const allItems = results.flat();

  const seen = new Set();
  const matched = [];

  for (const item of allItems) {
    const title = item.title || "";
    const rawSnippet = item.contentSnippet || stripHtml(item.content || item["content:encoded"] || "");
    const snippet = stripSourceSuffix(rawSnippet, item.sourceName);
    const haystack = `${title} ${snippet}`;

    if (!KEYWORD_PATTERN.test(haystack)) continue;
    if (
      NOISE_PATTERN.test(haystack) ||
      IDIOM_NOISE_PATTERN.test(haystack) ||
      NOISE_SOURCE_PATTERN.test(item.sourceName || "")
    ) continue;
    if (!item.link || seen.has(item.link)) continue;
    seen.add(item.link);

    const cleanTitle = title.trim();
    matched.push({
      title: cleanTitle,
      source: item.sourceName,
      date: item.isoDate ? item.isoDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
      excerpt: buildExcerpt(snippet, cleanTitle, item.sourceName),
      image: extractImage(item),
      url: item.link,
      _sortDate: item.isoDate ? new Date(item.isoDate).getTime() : 0,
    });
  }

  matched.sort((a, b) => b._sortDate - a._sortDate);
  return matched;
}

// A story covered by more than one region's feeds (common with the Google
// News layer, since its English-language editions overlap heavily) is kept
// only in the first region that claims it, checked in this priority order.
function dedupeAcrossRegions(regionLists) {
  const globalSeen = new Set();
  return regionLists.map((list) => {
    const kept = [];
    for (const item of list) {
      if (globalSeen.has(item.url)) continue;
      globalSeen.add(item.url);
      kept.push(item);
      if (kept.length >= MAX_ITEMS_PER_REGION) break;
    }
    return kept.map(({ _sortDate, ...rest }) => rest);
  });
}

async function main() {
  const [ukAll, europeAll, usAll] = await Promise.all([
    buildRegion(FEEDS.uk),
    buildRegion(FEEDS.europe),
    buildRegion(FEEDS.us),
  ]);

  const [uk, europe, us] = dedupeAcrossRegions([ukAll, europeAll, usAll]);

  const newsData = {
    updatedAt: new Date().toISOString(),
    uk,
    europe,
    us,
  };

  const fileContents = `// AUTO-GENERATED by scripts/update-news.mjs via .github/workflows/update-news.yml
// Do not edit by hand — changes will be overwritten on the next scheduled run.
const newsData = ${JSON.stringify(newsData, null, 2)};
`;

  await writeFile(new URL("../js/news-data.js", import.meta.url), fileContents, "utf-8");
  console.log(`Wrote ${uk.length} UK, ${europe.length} European, ${us.length} US items.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
