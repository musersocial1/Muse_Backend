const {
  S3Client,
  PutObjectCommand,
  //DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { v4: uuidv4 } = require("uuid");
const Conversation = require("../model/ai");
const { WhisperTranscription } = require("../utils/whisper");
const { OpenAIResponse, OpenAIStream } = require("../utils/openai");

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// helper to get folder by type
const getFolderByType = (type) => {
  switch (type) {
    case "image": return "ai/images";
    case "audio": return "ai/audio";
    case "video": return "ai/video";
    case "file":  return "ai/files";
    default:      return "ai/files";
  }
};

// helper to get content-type by type/ext
const getContentType = (type, ext) => {
  if (type === "image") return `image/${ext}`;
  if (type === "audio") return `audio/${ext}`;
  if (type === "video") return `video/${ext}`;
  if (type === "file")  return "application/octet-stream";
  return "application/octet-stream";
};

exports.getAiUploadUrl = async (req, res) => {
  try {
    const { fileType = "jpg", mediaType = "image"/*, oldKey*/ } = req.query;
    // mediaType = "image" | "audio" | "video" | "file"
    // fileType = extension: jpg, png, mp3, mp4, pdf, etc.

    /*if (oldKey) {
      try {
        await s3.send(
          new DeleteObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: oldKey,
          })
        );
      } catch (err) {
        console.warn("Failed to delete old file:", err.message);
      }
    }*/

    const folder = getFolderByType(mediaType);
    const key = `${folder}/${uuidv4()}.${fileType}`;
    const contentType = getContentType(mediaType, fileType);

    const command = new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
      // ACL: "public-read",
    });

    const uploadURL = await getSignedUrl(s3, command, { expiresIn: 60 });

    return res.status(200).json({
      success: true,
      uploadURL,
      key,
      fileURL: `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to get upload AI signed URL.",
      error: err.message,
    });
  }
};

exports.handleChat = async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId, message, type, audio, image, video, file } = req.body;

    // 1. Validate input
    if (!type || !["text", "audio", "image", "video", "file"].includes(type)) {
      return res.status(400).json({ success: false, message: "Invalid message type" });
    }
    if (!userId) {
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }
    if (type === "text" && !message) {
      return res.status(400).json({ success: false, message: "Text message required" });
    }
    if (type === "audio" && (!audio || !audio.url)) {
      return res.status(400).json({ success: false, message: "Audio url required" });
    }
    if (type === "image" && (!image || !image.url)) {
      return res.status(400).json({ success: false, message: "Image url required" });
    }
    if (type === "video" && (!video || !video.url)) {
      return res.status(400).json({ success: false, message: "Video url required" });
    }
    if (type === "file" && (!file || !file.url)) {
      return res.status(400).json({ success: false, message: "File url required" });
    }

    // 2. Find or create conversation
    let conversation;
    if (conversationId) {
      conversation = await Conversation.findOne({ _id: conversationId, user: userId });
      if (!conversation) {
        return res.status(404).json({ success: false, message: "Conversation not found" });
      }
    } else {
      conversation = new Conversation({ user: userId, messages: [] });
    }

    // 3. Prepare user message
    let content = message || "";
    let userMsg = {
      sender: "user",
      type,
      createdAt: new Date(),
    };

    // 4. Handle audio (transcribe)
    if (type === "audio") {
      // Call Whisper API utility (send audio.url), get transcript
      content = await WhisperTranscription(audio.url);
      userMsg.audio = audio;
      userMsg.content = content;
    }
    // 5. Handle other file/image/video
    if (type === "image" && image) userMsg.image = image;
    if (type === "video" && video) userMsg.video = video;
    if (type === "file"  && file)  userMsg.file  = file;
    if (type === "text") userMsg.content = content;

    // 6. Add user message to conversation
    conversation.messages.push(userMsg);

    // 7. Get AI response for text or audio (only for text-based prompts)
    let aiMsg = null;
    if (type === "text" || type === "audio") {
      // Build history as context for OpenAI (last 10 exchanges or so)

      const systemPrompt = {
        role: "system",
        // content: "You are Merlin AI, a helpful and knowledgeable assistant on the Muse platform. Always introduce yourself as Merlin AI, not as ChatGPT or OpenAI. Respond conversationally, warmly, and never break character. If asked your name, always say: 'My name is Merlin AI.'"
        content: "You are Merlin AI, a helpful, witty, and supportive assistant on the Muse platform. You are always up to date, never break character, and your name is Merlin AI. If asked about your abilities or origin, mention Muse and that you are powered by advanced AI."
        };

      const messagesForAI = [
        systemPrompt,
        ...conversation.messages
        .slice(-10)
        .map(m => ({
          role: m.sender === "user" ? "user" : "assistant",
          content: m.content,
        }))
        .filter(m => m.content)
        ]; // skip non-text messages

      const aiContent = await OpenAIResponse(messagesForAI);
      aiMsg = {
        sender: "ai",
        type: "text",
        content: aiContent,
        createdAt: new Date(),
      };
      conversation.messages.push(aiMsg);
    }

    // 8. Save conversation
    await conversation.save();

    // 9. Return updated conversation
    return res.status(200).json({
      success: true,
      conversationId: conversation._id,
      messages: conversation.messages,
      aiMessage: aiMsg,
    });
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ success: false, message: "Chat error", error: err.message });
  }
};

exports.handleChatSSE = async (req, res) => {
  // IMPORTANT: if you have compression middleware, disable it for this route.
  // e.g. app.get('/ai/chat/stream', noCompression, handleChatSSE)

  try {
    const userId = req.user?.id;
    const { conversationId, message, type, audio, image, video, file } = req.body;

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    // if you need CORS for SSE, ensure your global CORS middleware handles it,
    // or set explicit headers here.

    // helper to send an SSE data frame
    const sse = (event, data) => {
      if (event) res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // heartbeat to keep connection open (some proxies close idle streams)
    const heartbeat = setInterval(() => res.write(`: ping\n\n`), 15000);

    // 1) Basic validations (same as your handleChat)
    if (!userId) return sse("error", { message: "User not authenticated" }), res.end();
    if (!type || !["text", "audio", "image", "video", "file"].includes(type)) {
      sse("error", { message: "Invalid message type" }); return res.end();
    }
    if (type === "text" && !message) { sse("error", { message: "Text message required" }); return res.end(); }
    if (type === "audio" && (!audio || !audio.url)) { sse("error", { message: "Audio url required" }); return res.end(); }
    if (type === "image" && (!image || !image.url)) { sse("error", { message: "Image url required" }); return res.end(); }
    if (type === "video" && (!video || !video.url)) { sse("error", { message: "Video url required" }); return res.end(); }
    if (type === "file"  && (!file  || !file.url )) { sse("error", { message: "File url required"  }); return res.end(); }

    // 2) Find or create conversation
    let conversation;
    if (conversationId) {
      conversation = await Conversation.findOne({ _id: conversationId, user: userId });
      if (!conversation) { sse("error", { message: "Conversation not found" }); return res.end(); }
    } else {
      conversation = new Conversation({ user: userId, messages: [] });
    }

    // 3) Prepare the user message (transcribe if audio)
    let content = message || "";
    const userMsg = { sender: "user", type, createdAt: new Date() };

    if (type === "audio") {
      try {
        content = await WhisperTranscription(audio.url);
        userMsg.audio = audio;
        userMsg.content = content;
      } catch (e) {
        sse("error", { message: "Audio transcription failed", detail: e.message });
        clearInterval(heartbeat);
        return res.end();
      }
    } else {
      if (type === "image") userMsg.image = image;
      if (type === "video") userMsg.video = video;
      if (type === "file")  userMsg.file  = file;
      if (type === "text")  userMsg.content = content;
    }

    // 4) Append user message into conversation (pre‑save)
    conversation.messages.push(userMsg);

    // 5) Build context for AI
    const systemPrompt = {
      role: "system",
      content:
        "You are Merlin AI, a helpful, witty, and supportive assistant on the Muse platform. " +
        "Your name is Merlin AI. Never call yourself ChatGPT. If asked your name, say: 'My name is Merlin AI.'",
    };

    const messagesForAI = [
      systemPrompt,
      ...conversation.messages
        .slice(-10)
        .map((m) => ({
          role: m.sender === "user" ? "user" : "assistant",
          content: m.content,
        }))
        .filter((m) => m.content),
    ];

    // 6) Send initial event so client can prep UI
    sse("start", {
      conversationId: conversation._id,
      type: "text",
    });

    // 7) Stream AI response
    let aiText = "";
    try {
      await OpenAIStream(messagesForAI, (delta) => {
        aiText += delta;
        // push small chunks to client as they arrive
        sse("token", { text: delta });
      });
    } catch (e) {
      sse("error", { message: "AI stream failed", detail: e?.response?.data || e.message });
      clearInterval(heartbeat);
      return res.end();
    }

    // 8) Finalize: save AI message in DB
    const aiMsg = {
      sender: "ai",
      type: "text",
      content: aiText,
      createdAt: new Date(),
    };
    conversation.messages.push(aiMsg);
    await conversation.save();

    // 9) Tell client we're done, include final message for integrity
    sse("done", {
      conversationId: conversation._id,
      message: aiMsg,
    });

    clearInterval(heartbeat);
    res.end();
  } catch (err) {
    // If headers already sent, stream the error; otherwise send 500 JSON.
    try {
      res.write(`event: error\ndata: ${JSON.stringify({ message: "Chat error", detail: err.message })}\n\n`);
      res.end();
    } catch {
      res.status(500).json({ success: false, message: "Chat error", error: err.message });
    }
  }
};
