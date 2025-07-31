const express = require("express");
const router = express.Router();
const { addCard, getCards, deleteCard } = require("../controller/card");
const { authenticate } = require("../middleware/auth");

router.post("/add", authenticate, addCard);

router.get("/get", authenticate, getCards);

router.delete("/delete/:id", authenticate, deleteCard);

module.exports = router;
