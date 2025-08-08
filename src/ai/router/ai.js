const express = require("express");
const router = express.Router();
const {
  getAiUploadUrl,
  handleChat,
//  getCommunity,
} = require("../controller/ai");
const { authenticate } = require("../middleware/auth");

router.get("/get-ai-upload-url", authenticate, getAiUploadUrl);

router.post("/chat", authenticate, handleChat);

// router.get("/my-community", authenticate, getCommunity);

module.exports = router;
