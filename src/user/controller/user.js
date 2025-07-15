const twilio = require("twilio");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const User = require("../model/user");
const VerificationCode = require("../model/code");

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

const client = twilio(accountSid, authToken);

exports.sendVerificationCode = async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber)
      return res.status(400).json({ message: "Phone number is required." });

    await client.verify.v2
      .services(verifyServiceSid)
      .verifications.create({ to: phoneNumber, channel: "sms" });

    return res.status(200).json({ message: "Phone verification code sent." });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to send verification code.",
      error: error.message,
    });
  }
};

exports.resendVerificationCode = async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber)
      return res.status(400).json({ message: "Phone number is required." });

    await client.verify.v2
      .services(verifyServiceSid)
      .verifications.create({ to: phoneNumber, channel: "sms" });

    return res.status(200).json({ message: "Phone verification code sent." });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to send verification code.",
      error: error.message,
    });
  }
};

exports.verifyPhoneCode = async (req, res) => {
  try {
    const { phoneNumber, code } = req.body;
    if (!phoneNumber || !code) {
      return res
        .status(400)
        .json({ message: "Phone number and code are required." });
    }

    const verificationCheck = await client.verify.v2
      .services(verifyServiceSid)
      .verificationChecks.create({ to: phoneNumber, code });

    if (verificationCheck.status === "approved") {
      //await User.findOneAndUpdate({ phoneNumber }, { isPhoneVerified: true });

      return res.status(200).json({ message: "Phone number verified!" });
    } else {
      return res.status(400).json({ message: "Incorrect verification code." });
    }
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Verification failed.", error: error.message });
  }
};

exports.createAccount = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      username,
      email,
      password,
      confirmPassword,
      dateOfBirth,
      accountType,
      gender,
      interests,
      phoneNumber,
    } = req.body;

    if (
      !firstName ||
      !lastName ||
      !username ||
      !email ||
      !password ||
      !confirmPassword ||
      !dateOfBirth ||
      !accountType ||
      !phoneNumber
    ) {
      return res
        .status(400)
        .json({ message: "All required fields must be provided." });
    }

    const validateEmail = (email) => {
      const regex =
        /^[^\s@]+@[^\s@]+\.(com|net|org|edu|gov|mil|biz|info|mobi|name|aero|jobs|museum|co\.[a-z]{2}|[a-z]{2})$/i;
      return regex.test(email);
    };

    if (!validateEmail(email)) {
      return res.status(400).json({ error: "Invalid email format." });
    }

    const validatePassword = (password) => {
      return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_\-+={}[\]|:;"'<>,.?/~`])[A-Za-z\d!@#$%^&*()_\-+={}[\]|:;"'<>,.?/~`]{8,}$/.test(
        password
      );
    };

    if (!validatePassword(password)) {
      return res.status(400).json({
        error:
          "Password must be at least 8 characters, include an uppercase letter, a lowercase letter, a number, and a special character.",
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match." });
    }

    const usernameExists = await User.findOne({
      username: username.toLowerCase(),
    });
    if (usernameExists) {
      return res.status(409).json({ error: "Username already in use." });
    }

    const emailExists = await User.findOne({ email: email.toLowerCase() });
    if (emailExists) {
      return res.status(409).json({ error: "Email already in use." });
    }

    const phoneExists = await User.findOne({ phoneNumber });
    if (phoneExists) {
      return res.status(409).json({ error: "Phone number already in use." });
    }

    const user = new User({
      firstName,
      lastName,
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      password,
      dateOfBirth,
      accountType,
      gender,
      interests,
      phoneNumber,
      isPhoneVerified: true,
    });

    await user.save();

    const generateToken = (user) => {
      return jwt.sign(
        { id: user._id, username: user.username, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );
    };

    const token = generateToken(user);

    const safeUser = user.toObject();
    delete safeUser.password;

    return res
      .status(201)
      .json({ message: "Registration successful.", token, user: safeUser });
  } catch (err) {
    return res
      .status(500)
      .json({ message: "Registration failed.", error: err.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res
        .status(400)
        .json({ error: "Email and password are required." });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ error: "User not found." });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(401).json({ error: "Invalid credentials." });

    await VerificationCode.deleteMany({ email });

    //const code = Math.floor(100000 + Math.random() * 900000).toString();
    const code = crypto.randomInt(100000, 999999).toString(); // secure 6-digit code
    const expiresAt = Date.now() + 10 * 60 * 1000; // expires in 10 minutes

    await VerificationCode.create({ email, code, expiresAt });

    return res.status(200).json({
      message: "Email verification code sent.",
      email,
      code,
      expiresAt,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ error: "Failed to generate code.", details: error.message });
  }
};

exports.resendCode = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required." });

    // Check for recent (unexpired) code sent in the last 60s
    const existingCode = await VerificationCode.findOne({ email }).sort({
      expiresAt: -1,
    });

    if (
      existingCode &&
      Date.now() - (existingCode.createdAt?.getTime() || 0) < 60 * 1000
    ) {
      const secondsLeft =
        60 - Math.floor((Date.now() - existingCode.createdAt.getTime()) / 1000);
      return res.status(429).json({
        error: `Please wait ${secondsLeft} seconds before resending the code.`,
      });
    }

    await VerificationCode.deleteMany({ email });

    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
    await VerificationCode.create({ email, code, expiresAt });

    return res.status(200).json({
      message: "Email verification code resent.",
      email,
      code,
      expiresAt,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ error: "Failed to resend code.", details: error.message });
  }
};

exports.verifyLogin = async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code)
      return res.status(400).json({ error: "Email and code are required." });

    const user = await User.findOne({ email: email.toLowerCase() }).select(
      "-password"
    );
    if (!user) return res.status(404).json({ error: "User not found." });

    const record = await VerificationCode.findOne({
      email,
      code,
      expiresAt: { $gt: new Date() },
    });
    if (!record)
      return res
        .status(400)
        .json({ error: "No verification code found. Please login again." });

    if (record.code !== code)
      return res.status(400).json({ error: "Invalid verification code." });

    if (Date.now() > record.expiry)
      return res.status(400).json({ error: "Verification code expired." });

    await VerificationCode.deleteMany({ email });

    const token = jwt.sign(
      { id: user._id, username: user.username, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.status(200).json({ message: "Login successful.", token, user });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// SETTINGS
exports.getUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).select("-password");
    if (!user) return res.status(404).json({ error: "User not found." });

    return res.status(200).json({ user });
  } catch (error) {
    return res
      .status(500)
      .json({ error: "Failed to get user profile.", details: error.message });
  }
};

exports.requestChangeEmail = async (req, res) => {
  try {
    const userId = req.user.id;
    const { newEmail } = req.body;

    if (!newEmail) {
      return res.status(400).json({ message: "New email is required." });
    }

    const emailExists = await User.findOne({ email: newEmail.toLowerCase() });
    if (emailExists) {
      return res.status(409).json({ message: "Email already in use." });
    }

    await VerificationCode.deleteMany({ email: newEmail.toLowerCase() });

    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000;

    // Save or update code with association to user and new email
    // await VerificationCode.findOneAndUpdate(
    //   { user: userId, email: newEmail.toLowerCase() },
    //   { code, expiresAt },
    //   { upsert: true, new: true }
    // );

    await VerificationCode.create({ email, code, expiresAt });

    return res.status(200).json({
      message: "Verification code sent to new email.",
      newEmail,
      code,
      expiresAt,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to initiate email change.",
      error: error.message,
    });
  }
};

exports.confirmChangeEmail = async (req, res) => {
  try {
    const userId = req.user.id;
    const { newEmail, code } = req.body;

    if (!newEmail || !code) {
      return res
        .status(400)
        .json({ message: "New email and code are required." });
    }

    const verification = await VerificationCode.findOne({
      user: userId,
      email: newEmail.toLowerCase(),
      code,
    });

    if (!verification) {
      return res.status(400).json({ message: "Invalid verification code." });
    }
    if (verification.expiresAt < Date.now()) {
      return res.status(400).json({ message: "Verification code expired." });
    }

    await User.findByIdAndUpdate(userId, { email: newEmail.toLowerCase() });

    await VerificationCode.deleteMany({
      user: userId,
      email: newEmail.toLowerCase(),
    });

    return res.status(200).json({ message: "Email updated successfully." });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to confirm email change.",
      error: error.message,
    });
  }
};

exports.changeUsername = async (req, res) => {
  try {
    const userId = req.user.id;
    const { newUsername } = req.body;

    if (!newUsername) {
      return res.status(400).json({ message: "New username is required." });
    }

    const existingUser = await User.findOne({
      username: newUsername.toLowerCase(),
    });
    if (existingUser) {
      return res.status(409).json({ message: "Username already exist." });
    }

    // Limit username changes
    const user = await User.findById(userId);
    if (user.usernameChangeCount >= 3) {
      return res
        .status(403)
        .json({ message: "You can only change username 3 times." });
    }

    user.username = newUsername.toLowerCase();
    user.usernameChangeCount += 1;
    await user.save();

    return res.status(200).json({
      message: "Username changed successfully.",
      username: user.username,
      usernameChangeCount: user.usernameChangeCount,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Failed to change username.", error: error.message });
  }
};
