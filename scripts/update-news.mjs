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

const MAX_ITEMS_PER_REGION = 15;
const REQUEST_HEADERS = { "User-Agent": "Mozilla/5.0 ParalnoiaNewsBot/1.0 (+https://github.com/jimrbrodie/Building_Paralnoia)" };

function stripHtml(html) {
  return (html || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function truncate(text, max) {
  if (text.length <= max) return text;
  return text.slice(0, max).replace(/\s+\S*$/, "") + "…";
}

function buildExcerpt(rawSnippet, title, source) {
  const cleaned = stripHtml(rawSnippet);
  if (!cleaned || cleaned.length < 15 || cleaned === title) {
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

async function buildRegion(region, feeds) {
  const results = await Promise.all(feeds.map(fetchFeed));
  const allItems = results.flat();

  const seen = new Set();
  const matched = [];

  for (const item of allItems) {
    const title = item.title || "";
    const snippet = item.contentSnippet || stripHtml(item.content || item["content:encoded"] || "");
    const haystack = `${title} ${snippet}`;

    if (!KEYWORD_PATTERN.test(haystack)) continue;
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
  return matched.slice(0, MAX_ITEMS_PER_REGION).map(({ _sortDate, ...rest }) => rest);
}

async function main() {
  const [uk, europe, us] = await Promise.all([
    buildRegion("uk", FEEDS.uk),
    buildRegion("europe", FEEDS.europe),
    buildRegion("us", FEEDS.us),
  ]);

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
