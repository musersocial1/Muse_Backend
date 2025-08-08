const axios = require("axios");
const FormData = require("form-data");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { Readable } = require("stream");
const path = require("path");

const s3 = new S3Client({ region: process.env.AWS_REGION });

exports.WhisperTranscription = async (audioUrl) => {
  // Download audio from S3
  // const audioResponse = await axios.get(audioUrl, { responseType: "stream" });
    
  // Parse bucket, key from audioUrl
  const url = new URL(audioUrl);
  const bucket = process.env.AWS_BUCKET_NAME; // url.host.split(".")[0]; // e.g. "muse-user-uploads"
  const key = decodeURIComponent(url.pathname.slice(1)); // drop the leading "/"

  // Download audio from S3 using AWS SDK (not HTTP)
  const { Body } = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));

  const mimeTypes = {
    mp3: "audio/mpeg",
    mpga: "audio/mpeg",
    m4a: "audio/mp4",
    mp4: "audio/mp4",
    wav: "audio/wav",
    flac: "audio/flac",
    oga: "audio/ogg",
    ogg: "audio/ogg",
    webm: "audio/webm",
    mpeg: "audio/mpeg",
  };

  // Prepare form-data for OpenAI Whisper API
  const ext = path.extname(key).substring(1) || "mp3";
  const contentType = mimeTypes[ext.toLowerCase()] || "audio/mpeg";
  const form = new FormData();
      form.append("file", /*audioResponse.data*/Body, {
        filename: `audio.${ext}`,
        contentType,
      });
    /*form.append("file", Body, {
    filename: `audio.mp3`,
    contentType: "audio/mpeg",
    });*/
  form.append("model", "whisper-1");
  // Optionally: form.append("language", "en");

  try {
    // Call OpenAI Whisper API
    const openaiRes = await axios.post(
        "https://api.openai.com/v1/audio/transcriptions",
        form,
        {
        headers: {
            ...form.getHeaders(),
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        maxBodyLength: Infinity, // Allow large files
        }
    );

    // Return transcript text
    return openaiRes.data.text;
  } catch (err) {
    console.log("Whisper API error:", err?.response?.data);
    throw err;
  }
};
