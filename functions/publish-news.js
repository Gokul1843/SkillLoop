
const admin = require("firebase-admin");
const Parser = require("rss-parser");
const crypto = require("node:crypto");

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const feeds = [
  {
    language: "en",
    source: "The Indian Express",
    url: "https://indianexpress.com/section/north-east-india/assam/feed/",
    host: "indianexpress.com",
  },
  {
    language: "hi",
    source: "Amar Ujala",
    url: "https://www.amarujala.com/rss/assam.xml",
    host: "amarujala.com",
  },
  {
    language: "as",
    source: "Asomiya Pratidin",
    url: "https://asomiyapratidin.in/feed/rss/",
    host: "asomiyapratidin.in",
  },
];

function cleanText(value) {
  if (typeof value !== "string") return "";

  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1000);
}

function isAllowedArticleUrl(articleUrl, expectedHost) {
  try {
    const url = new URL(articleUrl);

    return (
      url.protocol === "https:" &&
      (url.hostname === expectedHost ||
        url.hostname === `www.${expectedHost}`) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

async function main() {
  const credentialJson = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!credentialJson) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT secret is missing.");
  }

  let credentials;

  try {
    credentials = JSON.parse(credentialJson);
  } catch {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT is not valid JSON."
    );
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(credentials),
    });
  }

  const db = admin.firestore();

  const parser = new Parser({
    timeout: 20000,
    headers: {
      "User-Agent": "SkillLoop-News/1.0",
    },
  });

  const now = Date.now();
  let published = 0;
  let duplicates = 0;
  let failedFeeds = 0;

  for (const feedConfig of feeds) {
    try {
      console.log(`Checking ${feedConfig.source}...`);

      const feed = await parser.parseURL(feedConfig.url);

      console.log(
        `${feedConfig.source}: ${feed.items.length} items found`
      );

      for (const item of feed.items) {
        const title = cleanText(item.title);
        const articleUrl = (item.link || "").trim();

        if (!title || !articleUrl) continue;

        if (!isAllowedArticleUrl(articleUrl, feedConfig.host)) {
          console.log(`Skipped invalid article URL: ${articleUrl}`);
          continue;
        }

        const publishedMillis = Date.parse(
          item.isoDate || item.pubDate || ""
        );

        if (!Number.isFinite(publishedMillis)) {
          console.log(`Skipped article without valid date: ${title}`);
          continue;
        }

        // Only articles published within the last 24 hours.
        if (publishedMillis < now - ONE_DAY_MS) continue;

        // Ignore dates too far in the future.
        if (publishedMillis > now + 5 * 60 * 1000) continue;

        const summary = cleanText(
          item.contentSnippet ||
          item.summary ||
          item.content ||
          ""
        );

        const articleId = crypto
          .createHash("sha256")
          .update(articleUrl)
          .digest("hex");

        const postRef = db
          .collection("posts")
          .doc(`news_${articleId}`);

        const expiresAt = publishedMillis + ONE_DAY_MS;

        try {
          await postRef.create({
            text: summary
              ? `${title}\n\n${summary}\n\nRead full news: ${articleUrl}`
              : `${title}\n\nRead full news: ${articleUrl}`,

            authorId: "skillloop-news",
            authorEmail: "SkillLoop News",
            isNews: true,
            language: feedConfig.language,
            newsSource: feedConfig.source,
            articleUrl,

            publishedAt: admin.firestore.Timestamp.fromMillis(
              publishedMillis
            ),

            createdAt:
              admin.firestore.FieldValue.serverTimestamp(),

            expiresAt:
              admin.firestore.Timestamp.fromMillis(expiresAt),
          });

          published++;
          console.log(
            `Published [${feedConfig.language}]: ${title}`
          );
        } catch (error) {
          if (
            error.code === 6 ||
            error.code === "already-exists"
          ) {
            duplicates++;
            console.log(`Skipped duplicate: ${title}`);
            continue;
          }

          throw error;
        }
      }
    } catch (error) {
      failedFeeds++;

      console.error(
        `Feed failed (${feedConfig.source}): ${error.message}`
      );
    }
  }

  console.log("----- SkillLoop News Report -----");
  console.log(`New posts: ${published}`);
  console.log(`Duplicates skipped: ${duplicates}`);
  console.log(`Failed feeds: ${failedFeeds}`);

  if (failedFeeds === feeds.length) {
    throw new Error(
      "All news feeds failed. Check RSS URLs and network access."
    );
  }
}

main().catch((error) => {
  console.error("SkillLoop News failed:", error.message);
  process.exitCode = 1;
});
