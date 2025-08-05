const express = require("express");
const router = express.Router();
const {
  getCoverImageUploadUrl,
  createCommunity,
  getCommunity,
} = require("../controller/comm");
const { authenticate } = require("../middleware/auth");

router.get("/get-cover-image-upload-url", authenticate, getCoverImageUploadUrl);

router.post("/create-community", authenticate, createCommunity);

router.get("/my-community", authenticate, getCommunity);

module.exports = router;
