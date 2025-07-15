const express = require("express");
const router = express.Router();
const {
  sendVerificationCode,
  resendVerificationCode,
  verifyPhoneCode,
  createAccount,
  login,
  resendCode,
  verifyLogin,

  getUserProfile,
  requestChangeEmail,
  confirmChangeEmail,
  changeUsername,
} = require("../controller/user");
const { authenticate } = require("../middleware/auth");

router.post("/send-code", sendVerificationCode);

router.post("/resend-code", resendVerificationCode);

router.post("/verify-code", verifyPhoneCode);

router.post("/signup", createAccount);

router.post("/signin", login);

router.post("/resend", resendCode);

router.post("/verify-login", verifyLogin);

// SETTINGS
router.get("/me", authenticate, getUserProfile);

router.post("/request", authenticate, requestChangeEmail);

router.post("/confirm", authenticate, confirmChangeEmail);

router.patch("/username", authenticate, changeUsername);

module.exports = router;
