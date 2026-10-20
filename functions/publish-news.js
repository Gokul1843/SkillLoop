
const admin = require("firebase-admin");
const Parser = require("rss-parser");
const crypto = require("node:crypto");

async function main() {
  const credentialJson = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!credentialJson) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT secret is missing.");
  }

  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(credentialJson)),
  });

  const db = admin.firestore();
  const parser = new Parser({ timeout: 15000 });

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

  const now = Date.now();
  const expiry = admin.firestore.Timestamp.fromMillis(
    now + 24 * 60 * 60 * 1000
  );

  let published = 0;

  for (const feedConfig of feeds) {
    try {
      const feed = await parser.parseURL(feedConfig.url);

      console.log(
        `${feedConfig.language}: ${feed.items.length} RSS items found`
      );

      for (const item of feed.items) {
        const title = (item.title || "").trim();
        const articleUrl = (item.link || "").trim();

        if (!title || !articleUrl) continue;

        let url;

        try {
          url = new URL(articleUrl);
        } catch {
          continue;
        }

        if (
          url.protocol !== "https:" ||
          !(url.hostname === feedConfig.host ||
            url.hostname === `www.${feedConfig.host}`)
        ) {
          continue;
        }

        // Skip articles older than 24 hours or with no publication date.
        const publishedAt = Date.parse(item.isoDate || item.pubDate || "");

        if (!Number.isFinite(publishedAt)) continue;
        if (publishedAt < now - 24 * 60 * 60 * 1000) continue;
        if (publishedAt > now + 5 * 60 * 1000) continue;

        const articleId = crypto
          .createHash("sha256")
          .update(articleUrl)
          .digest("hex");

        const docRef = db.collection("newsFeed").doc(articleId);

        try {
          await docRef.create({
            title,
            text: title,
            language: feedConfig.language,
            newsSource: feedConfig.source,
            articleUrl,
            publishedAt: admin.firestore.Timestamp.fromMillis(publishedAt),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            expiresAt: expiry,
          });

          published++;
          console.log(
            `Published [${feedConfig.language}]: ${title}`
          );
        } catch (error) {
          if (error.code === 6 || error.code === "already-exists") {
            console.log(`Skipped duplicate: ${title}`);
            continue;
          }

          throw error;
        }
      }
    } catch (error) {
      // One unavailable feed should not prevent the other languages.
      console.error(
        `Feed failed (${feedConfig.language}): ${error.message}`
      );
    }
  }

  console.log(`Finished. New articles published: ${published}`);
}

main().catch((error) => {
  console.error("SkillLoop News failed:", error.message);
  process.exitCode = 1;
});
