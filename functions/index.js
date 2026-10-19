
const { setGlobalOptions } = require("firebase-functions");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const Parser = require("rss-parser");
const crypto = require("node:crypto");

setGlobalOptions({ maxInstances: 10 });

if (!admin.apps.length) {
  admin.initializeApp();
}

const parser = new Parser();

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

    const feed = await parser.parseURL(feedUrl);
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

      if (
        parsedUrl.protocol !== "https:" ||
        !["pib.gov.in", "www.pib.gov.in"].includes(
          parsedUrl.hostname
        )
      ) {
        continue;
      }

      const articleId = crypto
        .createHash("sha256")
        .update(articleUrl)
        .digest("hex");

      const postRef = db.collection("posts").doc(`news_${articleId}`);

      try {
        await postRef.create({
          text: `${title}\n\nSource: Press Information Bureau (PIB)`,
          authorId: null,
          authorEmail: "SkillLoop News",
          isNews: true,
          newsSource: "Press Information Bureau (PIB)",
          articleUrl,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        published++;
      } catch (error) {
        if (error.code === 6 || error.code === "already-exists") {
          continue;
        }
        throw error;
      }
    }

    console.log(`SkillLoop News: published ${published} new articles.`);
  }
);
