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
const { generateChatTitle } = require("../utils/title");

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

    // Auto-generate a title if this is the first message in the conversation
    if (!conversation.title) {
      const firstText = conversation.messages.find(m => m.sender === "user" && m.content)?.content;
      if (firstText) {
        conversation.title = await generateChatTitle(firstText);
      }
    }

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

function safeErrDetail(err) {
  try {
    if (!err) return 'Unknown error';
    if (typeof err === 'string') return err;
    // axios-like error body if present
    if (err.response?.data) {
      const d = err.response.data;
      return typeof d === 'string' ? d : JSON.stringify(d);
    }
    // node-fetch error cause
    if (err.cause?.message) return err.cause.message;
    if (err.message) return err.message;
    return JSON.stringify(err, Object.getOwnPropertyNames(err));
  } catch (e) {
    return `Error extracting detail: ${String(e)}`;
  }
}

const errPayload = (err, message) => ({
  message,
  detail: safeErrDetail(err),
});

exports.handleChatSSE = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { conversationId, message, type, audio, image, video, file } = req.body;

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    // helper to send an SSE data frame
    const sse = (event, data) => {
      if (event) res.write(`event: ${event}\n`);
      try {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch (serr) {
        // last resort: never allow circulars to break the stream
        res.write(
          `data: ${JSON.stringify({
            message: 'serialization failed',
            detail: String(serr)
          })}\n\n`
        );
      }
    };

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

    const heartbeat = setInterval(() => res.write(`: ping\n\n`), 15000);
    const cleanup = () => clearInterval(heartbeat);
    req.on('close', cleanup);

    // 2) Find or create conversation
    let conversation;
    if (conversationId) {
      conversation = await Conversation.findOne({ _id: conversationId, user: userId });
      if (!conversation) { sse("error", { message: "Conversation not found" }); return res.end(); }
      // sse("start", { conversationId: conversation._id, type: "text", title: conversation.title || null });
    } else {
      conversation = new Conversation({ user: userId, messages: [] });
      // await conversation.save();

      // sse("start", { conversationId: conversation._id, type: "text", title: null });
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
        sse("error", errPayload(e, "Audio transcription failed"));
        cleanup();
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

    // Auto-generate a title if this is the first message in the conversation
    if (!conversation.title) {
      const firstText = conversation.messages.find(m => m.sender === "user" && m.content)?.content;
      if (firstText) {
        conversation.title = await generateChatTitle(firstText);
      }
    }

    // 5) Build context for AI
    const systemPrompt = {
      role: "system",
      content: `
      You are Merlin AI, the flagship intelligence of the Muse platform.
      You are precise, fast, and insightful—confident without being arrogant, warm without being fluffy.
      You never refer to yourself as ChatGPT or any other model—only Merlin AI.

      ## Core Behavior
      - Give the **most helpful, practical answer** for the user’s goal with minimal friction.
      - If the request is ambiguous, **ask exactly one clarifying question** before proceeding.
      - Prefer **clear structure**: 1) short answer first, 2) supporting detail, 3) next steps.
      - When evidence or sources are provided (e.g., retrieval/search results), **use them** and be explicit about what’s known vs. uncertain.
      - Don’t invent facts. If you’re not sure, say so and suggest how to verify.
      - Keep latency low; avoid unnecessary preambles.

      ## Adaptive Style Matrix (pick the dominant mode from the user’s intent)
      - **Casual / Conversational**: light wit, crisp phrasing, friendly energy. Avoid slang overload.
      - **Empathy / Support**: validate feelings briefly, then move to constructive, actionable guidance.
      - **Technical / Engineering**: precise terminology, minimal fluff, correct trade-offs, code or commands where helpful, safe defaults.
      - **Strategy / Product / Creative**: structured options, sharp pros/cons, quick frameworks, concrete examples.
      - **Analytical / Data / Legal**: careful language, cite assumptions, define terms, show reasoning summary without verbose internal steps.

      ## Knowledge & Freshness
      - Treat your knowledge as **current** when the system provides context (search/RAG/news feeds). 
      - If the user asks for “latest” and no live context is supplied, say you can **pull or accept** recent context and proceed with best practices or historical patterns.

      ## Output Guidelines
      - Use **concise paragraphs** and tight bullets. Avoid filler.
      - Provide **copy-paste-ready** artifacts (code, commands, checklists) when useful.
      - Match the user’s format preference if stated (e.g., table, list, JSON).
      - For code: include only what’s necessary; annotate briefly with comments when non-obvious.

      ## Safety & Integrity
      - No medical, legal, or financial determinism—offer information, options, and "verify/consult" guidance when stakes are high.
      - Decline requests that violate policy, but do so **politely** and, when possible, suggest a safe alternative.

      ## Tone Knobs (auto-tune based on context)
      - **Crispness**: Default high. Expand only when the user asks for depth.
      - **Humor**: Light, context-safe. Never at the user’s expense.
      - **Confidence**: High when facts are clear; **calibrated** when uncertain.

      ## Examples of Mode Switching
      - If user says "explain like I’m new," simplify and use analogies.
      - If user says "go deep," provide layered depth with headings.
      - If the user wants "quick fix," deliver the minimal steps immediately.

      Remember: You are **Merlin AI**—a high-IQ, up-to-date, pragmatic partner. Prioritize usefulness over verbosity.
      `
    };

    /*const systemPrompt = {
      role: "system",
      content: `
      You are Merlin AI — the flagship intelligence of the Muse platform — designed to think fast, respond with precision, and adapt like the most advanced AI of 2025. 

      You are helpful, witty, and remarkably resourceful, combining deep knowledge with the ability to surface and integrate the most relevant, up-to-date information when needed. 
      You think critically, explain clearly, and offer solutions that are practical, creative, and insightful.

      Rules:
      1. Always identify yourself as "Merlin AI" — never "ChatGPT" or any other name.
      2. Communicate with clarity, professionalism, and confidence, but keep a touch of human warmth and approachability.
      3. When asked about current or trending topics, provide accurate answers using the latest available context given to you.
      4. Be concise when needed, but thorough when the user requires depth.
      5. Avoid generic or canned responses — each reply should feel tailored and intentional.

      Personality:
      - High IQ, but never condescending.
      - Curious and adaptive — always seeking the best way to assist.
      - A calm but confident presence in any conversation.
      `
    };*/

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
      sse("error", errPayload(e, "AI stream failed"));
      cleanup();
      return res.end();
    }

    // 8) Finalize: save AI message in DB
    const aiMsg = {
      sender: "ai",
      type: "text",
      title: conversation.title,
      content: aiText,
      createdAt: new Date(),
    };
    conversation.messages.push(aiMsg);
    await conversation.save();

    // 9) Tell client we're done, include final message for integrity
    sse("done", {
      conversationId: conversation._id,
      message: aiMsg,
      title: conversation.title || null
    });
    cleanup();
    res.end();
  } catch (err) {
    try {
      res.write(`event: error\ndata: ${JSON.stringify(errPayload(err, "Chat error"))}\n\n`);
      res.end();
    } catch {
      res.status(500).json({ success: false, ...errPayload(err, "Chat error") });
    }
  }
};

/*
exports.handleChatSSE = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { conversationId, message, type, audio, image, video, file } = req.body;

    // === SSE headers ===
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform"); // no proxies buffering
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");                  // Nginx: disable buffering
    res.flushHeaders?.();                                      // send headers immediately

    // ---- tiny helpers ----
    const writeSafe = (event, dataObj) => {
      if (res.writableEnded) return;
      if (event) res.write(`event: ${event}\n`);
      try {
        res.write(`data: ${JSON.stringify(dataObj)}\n\n`);
      } catch (serr) {
        // never allow circulars to break the stream
        res.write(`data: ${JSON.stringify({ message: "serialization failed", detail: String(serr) })}\n\n`);
      }
    };

    const endStream = () => {
      clearInterval(heartbeat);
      clearInterval(partialFlusher);
      if (!res.writableEnded) res.end();
    };

    // keep‑alive heartbeat (helps behind proxies/load balancers)
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(`: ping\n\n`);
    }, 15000);

    // If client disconnects, stop work
    req.on("close", endStream);

    // === Validate input (as in your non‑stream controller) ===
    if (!userId)      { writeSafe("error", { message: "User not authenticated" }); return endStream(); }
    if (!type || !["text","audio","image","video","file"].includes(type)) {
      writeSafe("error", { message: "Invalid message type" }); return endStream();
    }
    if (type === "text"  && !message)                { writeSafe("error", { message: "Text message required"  }); return endStream(); }
    if (type === "audio" && (!audio || !audio.url))  { writeSafe("error", { message: "Audio url required"      }); return endStream(); }
    if (type === "image" && (!image || !image.url))  { writeSafe("error", { message: "Image url required"      }); return endStream(); }
    if (type === "video" && (!video || !video.url))  { writeSafe("error", { message: "Video url required"      }); return endStream(); }
    if (type === "file"  && (!file  || !file.url ))  { writeSafe("error", { message: "File url required"       }); return endStream(); }

    // === Load / create conversation ===
    let conversation;
    if (conversationId) {
      conversation = await Conversation.findOne({ _id: conversationId, user: userId });
      if (!conversation) { writeSafe("error", { message: "Conversation not found" }); return endStream(); }
    } else {
      conversation = new Conversation({ user: userId, messages: [] });
    }

    // === Prepare user message (with optional transcription) ===
    let content = message || "";
    const userMsg = { sender: "user", type, createdAt: new Date() };

    if (type === "audio") {
      try {
        content = await WhisperTranscription(audio.url);
        userMsg.audio = audio;
        userMsg.content = content;
      } catch (e) {
        writeSafe("error", errPayload(e, "Audio transcription failed"));
        return endStream();
      }
    } else {
      if (type === "image") userMsg.image = image;
      if (type === "video") userMsg.video = video;
      if (type === "file")  userMsg.file  = file;
      if (type === "text")  userMsg.content = content;
    }

    conversation.messages.push(userMsg);

    // === Build context for the AI ===
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
        .map(m => ({
          role: m.sender === "user" ? "user" : "assistant",
          content: m.content,
        }))
        .filter(m => m.content),
    ];

    // === Notify client stream start ===
    writeSafe("start", { conversationId: conversation._id, type: "text" });

    // === Stream from OpenAI -> tokens + partials + final ===
    let aiText = "";
    let buffer = "";                      // smooth typing (flush in small batches)
    const FLUSH_MS = 80;                  // tune for “typing” feel vs. request count

    const partialFlusher = setInterval(() => {
      if (!buffer) return;
      // send a batched partial chunk
      writeSafe("token", { text: buffer });
      buffer = "";
    }, FLUSH_MS);

    try {
      await OpenAIStream(messagesForAI, (delta) => {
        aiText += delta;     // we’ll save full text later
        buffer += delta;     // we batched-send in partials
      });
    } catch (e) {
      writeSafe("error", errPayload(e, "AI stream failed"));
      return endStream();
    }

    // flush any remaining buffered text
    if (buffer) writeSafe("token", { text: buffer });

    // === Persist the final AI message ===
    const aiMsg = {
      sender: "ai",
      type: "text",
      content: aiText,
      createdAt: new Date(),
    };

    try {
      conversation.messages.push(aiMsg);
      await conversation.save();
    } catch (e) {
      // Saving failed — still tell the client we’re done, but include a warning
      writeSafe("warn", errPayload(e, "Saved stream but failed to persist AI message"));
    }

    // === Final event with the full message (for reliable save on the client, too) ===
    writeSafe("done", { conversationId: conversation._id, message: aiMsg });

    endStream();
  } catch (err) {
    // If headers already went out, stream a safe error; otherwise send JSON 500.
    try {
      res.write(`event: error\ndata: ${JSON.stringify(errPayload(err, "Chat error"))}\n\n`);
      res.end();
    } catch {
      res.status(500).json({ success: false, ...errPayload(err, "Chat error") });
    }
  }
};
*/

exports.renameChatTitle = async (req, res) => {
  try {
    const { id } = req.params;
    const { title } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ message: "Title required" });

    const convo = await Conversation.findOneAndUpdate(
      { _id: id, user: req.user.id },
      { $set: { title: title.trim() } },
      { new: true }
    ).select("_id title updatedAt");

    if (!convo) return res.status(404).json({ message: "Conversation not found" });
    res.json({ conversation: convo });
  } catch (e) {
    res.status(500).json({ message: "Rename failed", error: e.message });
  }
};

exports.getHistory = async (req, res) => {
  try {
    const conversations = await Conversation
      .find({ user: req.user.id, status: "active" })
      .sort({ updatedAt: -1 })
      .select("_id title createdAt updatedAt messages");

    // shape: add last message preview & count without sending whole transcript
    const items = conversations.map(c => {
      const last = c.messages?.[c.messages.length - 1];
      return {
        id: c._id,
        title: c.title || (c.messages?.[0]?.content?.slice(0, 50) || "New chat"),
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        lastMessage: last?.content || null,
        count: c.messages?.length || 0
      };
    });

    res.json({ conversations: items });
  } catch (e) {
    res.status(500).json({ message: "Error fetching history", error: e.message });
  }
};

exports.getHistoryById = async (req, res) => {
  try {
    const convo = await Conversation.findOne({
      _id: req.params.id,
      user: req.user.id
    });

    if (!convo) return res.status(404).json({ message: "Conversation not found" });
    res.json({ conversation: convo });
  } catch (e) {
    res.status(500).json({ message: "Error fetching conversation", error: e.message });
  }
};
