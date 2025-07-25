const express = require("express");
const router = express.Router();
const {
  checkUserExists,
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
  forgotPassword,
  resetPassword,
  generateProfilePicUploadUrl,
  uploadProfilePicture,
  removeProfilePicture,
} = require("../controller/user");
const { authenticate } = require("../middleware/auth");

router.get("/check-user", checkUserExists);

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

router.post("/forgot-password", forgotPassword);

router.post("/reset-password", resetPassword);

router.get("/get-profile-pic-url", authenticate, generateProfilePicUploadUrl);

router.patch("/upload-dp", authenticate, uploadProfilePicture);

router.delete("/remove-dp", authenticate, removeProfilePicture);

module.exports = router;
