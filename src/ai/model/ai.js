const mongoose = require("mongoose");
const { Schema } = mongoose;

// Message schema embedded inside Conversation
const messageSchema = new Schema({
  sender: { type: String, enum: ["user", "ai"], required: true },
  type: {
    type: String,
    enum: ["text", "audio", "image", "video", "file"],
    default: "text",
    required: true,
  },
  content: { type: String, trim: true },
  audio: {
    url: { type: String, trim: true },
    key: { type: String, trim: true },
  },
  file: {
    url: { type: String, trim: true },
    key: { type: String, trim: true },
  },
  image: {
    url: { type: String, trim: true },
    key: { type: String, trim: true },
  },
  video: {
    url: { type: String, trim: true },
    key: { type: String, trim: true },
  },
  createdAt: { type: Date, default: Date.now }
});

// Conversation schema (main chat session)
const conversationSchema = new Schema({
  user: { type: Schema.Types.ObjectId, required: true },
  title: { type: String, trim: true },
  messages: [messageSchema],
  status: { type: String, enum: ["active", "archived"], default: "active" },
}, { timestamps: true });

const Conversation = mongoose.model("Conversation", conversationSchema);
module.exports = Conversation;
