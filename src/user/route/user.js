const express = require("express");
const router = express.Router();
const { sendVerificationCode, verifyPhoneCode } = require("../controller/user");

router.post("/send-code", sendVerificationCode);

router.post("/verify-code", verifyPhoneCode);


module.exports = router;