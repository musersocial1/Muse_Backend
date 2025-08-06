const fs = require("fs");
const path = require("path");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
require("dotenv").config();

const s3 = new S3Client({
  region: "us-east-1",
  credentials: {
    accessKeyId: "AKIA5O42SJOJJYFGFOWF",
    secretAccessKey: "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",
  },
});

async function uploadDefaultPicture() {
  const filePath = path.join(__dirname, "default_profile_picture.jpg"); // or .png
  const fileContent = fs.readFileSync(filePath);

  const key = "muse-profile-pictures/default/default_profile_picture.jpg";

  const command = new PutObjectCommand({
    Bucket: "muse-user-uploads",
    Key: key,
    Body: fileContent,
    ContentType: "image/jpeg",
  });

  try {
    await s3.send(command);
    console.log("✅ Uploaded default profile picture to S3.");

    const url = `https://muse-user-uploads.s3.us-east-1.amazonaws.com/${key}`;
    console.log("🌐 URL:", url);
  } catch (err) {
    console.error("❌ Upload failed:", err);
  }
}

uploadDefaultPicture();
