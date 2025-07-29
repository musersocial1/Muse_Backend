const express = require("express");
const router = express.Router();
const {
  getCoverImageUploadUrl,
  createCommunity,
} = require("../controller/comm");
const { authenticate } = require("../middleware/auth");

router.get("/get-cover-image-upload-url", authenticate, getCoverImageUploadUrl);

router.post("/create-community", authenticate, createCommunity);

module.exports = router;
