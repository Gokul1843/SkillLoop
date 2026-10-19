
const admin = require("firebase-admin");
const Parser = require("rss-parser");
const crypto = require("node:crypto");

async function main() {
  const credentialJson = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!credentialJson) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT secret is missing.");
  }

  const serviceAccount = JSON.parse(credentialJson);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  const db = admin.firestore();
  const parser = new Parser();

  const feed = await parser.parseURL(
    "https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3"
  );

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
      !["pib.gov.in", "www.pib.gov.in"].includes(parsedUrl.hostname)
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
      console.log(`Published: ${title}`);
    } catch (error) {
      if (error.code === 6 || error.code === "already-exists") {
        console.log(`Skipped duplicate: ${title}`);
        continue;
      }

      throw error;
    }
  }

  console.log(`Finished. New articles published: ${published}`);
}

main().catch((error) => {
  console.error("SkillLoop News failed:", error.message);
  process.exitCode = 1;
});
