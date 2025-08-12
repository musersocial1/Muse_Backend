const express = require("express");
const router = express.Router();
const {
  getAiUploadUrl,
  handleChat,
  handleChatSSE,
  renameChatTitle,
  getHistory,
  getHistoryById
} = require("../controller/ai");
const { authenticate } = require("../middleware/auth");

router.get("/get-ai-upload-url", authenticate, getAiUploadUrl);

router.post("/test", authenticate, handleChat);

router.post("/chat", authenticate, handleChatSSE);

router.get("/history", authenticate, getHistory);

router.get("/history/:id", authenticate, getHistoryById);

router.patch("/title/:id", authenticate, renameChatTitle);

module.exports = router;
