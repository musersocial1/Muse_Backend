const express = require("express");
const router = express.Router();
const {
  indexUser,
  indexPost,
  indexComm,
  search,
  discoverFeed,
} = require("../controller/discover");
const { authenticate } = require("../middleware/auth");

router.post("/index-user", indexUser);

router.post("/index-post", indexPost);

router.post("/index-comm", indexComm);

router.get("/search", /*authenticate,*/ search);

router.get("/feed", authenticate, discoverFeed);

module.exports = router;
