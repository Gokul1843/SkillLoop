
const admin = require("firebase-admin");
const Parser = require("rss-parser");
const crypto = require("node:crypto");
const { onSchedule } = require("firebase-functions/v2/scheduler");

if (!admin.apps.length) {
  admin.initializeApp();
}

const newsParser = new Parser();

exports.publishSkillLoopNews = onSchedule(
  {
    schedule: "every 3 hours",
    timeZone: "Asia/Kolkata",
    region: "asia-south1",
    maxInstances: 1,
  },
  async () => {
    const feedUrl =
      "https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3";

    const feed = await newsParser.parseURL(feedUrl);
    const db = admin.firestore();

    let published = 0;

    for (const item of feed.items) {
      if (published >= 3) break;

      const title = (item.title || "").trim();
      const articleUrl = (item.link || "").trim();

      if (!title || !articleUrl) continue;

      let parsedUrl;
      try {
        parsedUrl = new URL(articleUrl);
      } catch {
        continue;
      }

      // Only accept original articles on the official PIB domain.
      if (
        parsedUrl.protocol !== "https:" ||
        !["pib.gov.in", "www.pib.gov.in"].includes(parsedUrl.hostname)
      ) {
        continue;
      }

      const articleId = crypto
        .createHash("sha256")
        .update(articleUrl)
        .digest("hex");

      const postRef = db.collection("posts").doc(`news_${articleId}`);

      const postText =
        `${title}\n\nSource: Press Information Bureau (PIB)`;

      try {
        await postRef.create({
          text: postText,
          authorId: null,
          authorEmail: "SkillLoop News",
          isNews: true,
          newsSource: "Press Information Bureau (PIB)",
          articleUrl,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        published++;
      } catch (error) {
        // A document with the same URL already exists: skip it.
        if (error.code === 6 || error.code === "already-exists") {
          continue;
        }
        throw error;
      }
    }

    console.log(`SkillLoop News: published ${published} new articles.`);
  }
);
