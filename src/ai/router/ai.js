const express = require("express");
const router = express.Router();
const {
  getAiUploadUrl,
  handleChat,
  handleChatSSE
//  getCommunity,
} = require("../controller/ai");
const { authenticate } = require("../middleware/auth");

router.get("/get-ai-upload-url", authenticate, getAiUploadUrl);

router.post("/test", authenticate, handleChat);

router.post("/chat", authenticate, handleChatSSE);

// router.get("/my-community", authenticate, getCommunity);

module.exports = router;
