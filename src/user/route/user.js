const express = require("express");
const router = express.Router();
const {
  sendVerificationCode,
  //resendVerificationCode,
  verifyPhoneCode,
  createAccount,
  googleAuth,
  completeProfile,
  login,
  resendCode,
  verifyLogin,

  getUserProfile,
  requestChangeEmail,
  confirmChangeEmail,
  changeUsername,
  requestChangePassword,
  confirmChangePassword,
} = require("../controller/user");
const { authenticate } = require("../middleware/auth");

router.post("/send-code", sendVerificationCode);

router.post("/resend-code", sendVerificationCode);

router.post("/verify-code", verifyPhoneCode);

router.post("/signup", createAccount);

router.post("/google", googleAuth);

router.put("/complete-profile", authenticate, completeProfile);

router.post("/signin", login);

router.post("/resend", resendCode);

router.post("/verify-login", verifyLogin);

// SETTINGS
router.get("/me", authenticate, getUserProfile);

router.post("/change-email", authenticate, requestChangeEmail);

router.post("/confirm-email", authenticate, confirmChangeEmail);

router.patch("/username", authenticate, changeUsername);

router.post("/change-password", authenticate, requestChangePassword);

router.post("/confirm-password", authenticate, confirmChangePassword);

module.exports = router;
