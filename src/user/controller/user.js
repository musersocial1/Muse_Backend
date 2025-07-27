const twilio = require("twilio");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
//const rateLimitStore = new Map();
//const axios = require("axios");
const { OAuth2Client } = require("google-auth-library");
const crypto = require("crypto");
const User = require("../model/user");
const RateLimit = require("../model/rateLimit");
const VerificationCode = require("../model/code");
const PasswordResetToken = require("../model/password");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { v4: uuidv4 } = require("uuid");

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
  },
});

const TEST_NUMBERS = process.env.DEV_TEST_NUMBERS.split(",");

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const client = twilio(accountSid, authToken);

exports.checkUserExists = async (req, res) => {
  try {
    const { phoneNumber, email, username } = req.query;

    if (!phoneNumber && !email && !username) {
      return res.status(400).json({ message: "No field provided." });
    }

    if (phoneNumber) {
      const user = await User.findOne({ phoneNumber });
      if (user) {
        return res
          .status(200)
          .json({ exists: true, message: "Phone number already exists." });
      } else {
        return res
          .status(200)
          .json({ exists: false, message: "Phone number is available." });
      }
    }

    if (email) {
      const user = await User.findOne({ email });
      if (user) {
        return res
          .status(200)
          .json({ exists: true, message: "Email already exists." });
      } else {
        return res
          .status(200)
          .json({ exists: false, message: "Email is available." });
      }
    }

    if (username) {
      const user = await User.findOne({ username });
      if (user) {
        return res
          .status(200)
          .json({ exists: true, message: "Username already exists." });
      } else {
        return res
          .status(200)
          .json({ exists: false, message: "Username is available." });
      }
    }
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Check failed.", error: error.message });
  }
};

exports.sendVerificationCode = async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber)
      return res.status(400).json({ message: "Phone number is required." });

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);

    let record = await RateLimit.findOne({ phoneNumber });
    if (!record) {
      record = await RateLimit.create({ phoneNumber, requests: [now] });
    } else {
      record.requests = record.requests.filter((date) => date > oneHourAgo);

      const requestsLastMinute = record.requests.filter(
        (d) => d > oneMinuteAgo
      );
      if (requestsLastMinute.length >= 1) {
        const lastRequestTime = requestsLastMinute[0].getTime();
        const secondsPassed = Math.floor((Date.now() - lastRequestTime) / 1000);
        const secondsLeft = 60 - secondsPassed;

        return res.status(429).json({
          message: `Please wait ${secondsLeft} seconds before trying again.`,
        });
      }

      if (record.requests.length >= 5) {
        const firstRequestTime = record.requests[0].getTime();
        const oneHour = 60 * 60 * 1000;
        const timePassed = Date.now() - firstRequestTime;
        const minutesLeft = Math.ceil((oneHour - timePassed) / (60 * 1000));

        return res.status(429).json({
          message: `Hourly limit reached. Please wait ${minutesLeft} minute(s) before trying again.`,
        });
      }

      record.requests.push(now);
      await record.save();
    }

    if (TEST_NUMBERS.includes(phoneNumber)) {
      console.log(`[TEST NUMBER] Simulated OTP sent to ${phoneNumber}`);
      return res.status(200).json({
        message: "Simulated verification code sent (test mode).",
        devCode: "123456",
      });
    }

    if (process.env.NODE_ENV !== "production") {
      console.log(`[DEV MODE] Skipping real Twilio SMS to ${phoneNumber}`);
      return res.status(200).json({
        message: "Dev mode: Verification code not sent via Twilio.",
        devCode: "123456",
      });
    }

    await client.verify.v2
      .services(verifyServiceSid)
      .verifications.create({ to: phoneNumber, channel: "sms" });

    return res.status(200).json({ message: "Phone verification code sent." });
  } catch (error) {
    if (error.code === 60200) {
      return res.status(400).json({ message: "Invalid phone number format." });
    }

    if (error.code === 20429) {
      return res.status(429).json({
        message: "You're sending requests too fast. Try again later.",
      });
    }

    return res.status(500).json({
      message: "Failed to send verification code.",
      error: error.message,
    });
  }
};

/*exports.resendVerificationCode = async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber)
      return res.status(400).json({ message: "Phone number is required." });

    await client.verify.v2
      .services(verifyServiceSid)
      .verifications.create({ to: phoneNumber, channel: "sms" });

    return res.status(200).json({ message: "Phone verification code resent." });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to send verification code.",
      error: error.message,
    });
  }
};*/

exports.verifyPhoneCode = async (req, res) => {
  try {
    const { phoneNumber, code } = req.body;
    if (!phoneNumber || !code) {
      return res
        .status(400)
        .json({ message: "Phone number and code are required." });
    }

    const isDev = process.env.NODE_ENV !== "production";
    const testCode = "123456";

    if (isDev && TEST_NUMBERS.includes(phoneNumber)) {
      if (code === testCode) {
        return res
          .status(200)
          .json({ message: "Phone number verified (test mode)." });
      } else {
        return res.status(400).json({ message: "Incorrect code (test mode)." });
      }
    }

    const verificationCheck = await client.verify.v2
      .services(verifyServiceSid)
      .verificationChecks.create({ to: phoneNumber, code });

    if (verificationCheck.status === "approved") {
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

/*exports.sendVerificationCode = async (req, res) => {
  const { phoneNumber } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ message: "Phone number is required." });
    }

    await VerificationCode.deleteMany({ phoneNumber });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const url = "https://graph.facebook.com/v22.0/764377226749149/messages";
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

    const payload = {
      messaging_product: "whatsapp",
      to: phoneNumber.replace(/^\+/, ""),
      type: "template",
      template: {
        name: "muse_otp",
        language: { code: "en_US" },
        components: [
          {
            type: "body",
            parameters: [{ type: "text", text: code }],
          },
          {
            type: "button",
            sub_type: "url",
            index: 0,
            parameters: [
              { type: "text", text: "Muse Verification" },
            ],
          },
          {
            type: "button",
            sub_type: "url",
            index: 1,
            parameters: [
              { type: "text", text: "Copy Muse Code" }
            ]
          }
        ],
      },
    };

    try {
      await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });
  
      await VerificationCode.create({
        phoneNumber,
        code,
        expiresAt,
        used: false,
      });
  
      return res
        .status(200)
        .json({ message: "WhatsApp verification code sent.", code });
    } catch (waError) {
      try {
        await client.verify.v2
          .services(verifyServiceSid)
          .verifications.create({ to: phoneNumber, channel: "sms" });
  
        return res.status(200).json({ message: "Twilio verification code sent." });
      } catch (smsError) {
        return res.status(500).json({
          message: "Failed to send code via WhatsApp and SMS.",
          whatsapp: waError.response?.data || waError.message,
          sms: smsError.message
        });
      }
    }
};

exports.resendVerificationCode = async (req, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber) {
    return res.status(400).json({ message: "Phone number is required." });
  }

  const latestCode = await VerificationCode.findOne({ phoneNumber }).sort({ createdAt: -1 });
  if (latestCode) {
    const now = Date.now();
    const sentTime = new Date(latestCode.createdAt).getTime();
    if (now - sentTime < 60 * 1000) {
      const secondsLeft = Math.ceil((60 * 1000 - (now - sentTime)) / 1000);
      return res.status(429).json({
        message: `Please wait ${secondsLeft}s before requesting another code.`,
      });
    }
  }

  await VerificationCode.deleteMany({ phoneNumber });

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  const url = "https://graph.facebook.com/v22.0/764377226749149/messages";
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  const payload = {
    messaging_product: "whatsapp",
    to: phoneNumber.replace(/^\+/, ""),
    type: "template",
    template: {
      name: "muse_otp",
      language: { code: "en_US" },
      components: [
        {
          type: "body",
          parameters: [{ type: "text", text: code }],
        },
        {
          type: "button",
          sub_type: "url",
          index: 0,
          parameters: [{ type: "text", text: "Muse Verification" }],
        },
        {
          type: "button",
          sub_type: "url",
          index: 1,
          parameters: [{ type: "text", text: "Copy Muse Code" }]
        }
      ],
    },
  };

  try {
    await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    await VerificationCode.create({
      phoneNumber,
      code,
      expiresAt,
      used: false,
    });

    return res.status(200).json({
      message: "WhatsApp verification code resent.",
      code,
    });
  } catch (waError) {
    try {
      await client.verify.v2
        .services(verifyServiceSid)
        .verifications.create({ to: phoneNumber, channel: "sms" });

      return res.status(200).json({ message: "Twilio SMS verification code resent." });
    } catch (smsError) {
      return res.status(500).json({
        message: "Failed to resend code via WhatsApp and SMS.",
        whatsapp: waError.response?.data || waError.message,
        sms: smsError.message,
      });
    }
  }
};

exports.verifyPhoneCode = async (req, res) => {
  try {
    const { phoneNumber, code } = req.body;
    if (!phoneNumber || !code) {
      return res.status(400).json({ message: "Phone number and code are required." });
    }

    const verification = await VerificationCode.findOne({
      phoneNumber,
      code,
      expiresAt: { $gt: new Date() },
      used: false,
    });

    if (verification) {
      verification.used = true;
      await verification.save();

      return res.status(200).json({ message: "Phone number verified! (WhatsApp)" });
    }

    try {
      const verificationCheck = await client.verify.v2
        .services(verifyServiceSid)
        .verificationChecks.create({ to: phoneNumber, code });

      if (verificationCheck.status === "approved") {

        return res.status(200).json({ message: "Phone number verified! (SMS)" });
      } else {
        return res.status(400).json({ message: "Incorrect verification code." });
      }
    } catch (twilioError) {
      return res.status(400).json({ message: "Incorrect or expired verification code." });
    }

  } catch (error) {
    return res
      .status(500)
      .json({ message: "Verification failed.", error: error.message });
  }
};*/

exports.createAccount = async (req, res) => {
  try {
    const {
      fullName,
      username,
      email,
      password,
      //confirmPassword,
      dateOfBirth,
      accountType,
      gender,
      interests,
      phoneNumber,
    } = req.body;

    if (
      !fullName ||
      !username ||
      !email ||
      !password ||
      //!confirmPassword ||
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

    /*if (password !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match." });
    }*/

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

    const stripeCustomer = await stripe.customers.create({
      email: email.toLowerCase(),
      name: `${fullName}`,
      phone: phoneNumber,
    });

    const user = new User({
      fullName,
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      password,
      dateOfBirth,
      accountType,
      gender,
      interests,
      phoneNumber,
      isPhoneVerified: true,
      stripeCustomerId: stripeCustomer.id,
    });

    await user.save();

    const generateToken = (user) => {
      return jwt.sign(
        { id: user._id, username: user.username, email: user.email },
        process.env.JWT_SECRET
      );
    };

    const jwtToken = generateToken(user);

    const safeUser = user.toObject();
    delete safeUser.password;

    return res
      .status(201)
      .json({ message: "Registration successful.", jwtToken, user: safeUser });
  } catch (err) {
    return res
      .status(500)
      .json({ message: "Registration failed.", error: err.message });
  }
};

exports.googleAuth = async (req, res) => {
  const { token } = req.body;

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, given_name, family_name, sub, picture } = payload;

    const fullName = `${given_name} ${family_name}`.trim();

    /*const peopleRes = await axios.get(
      "https://people.googleapis.com/v1/people/me?personFields=genders,birthdays,phoneNumbers",
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const peopleData = peopleRes.data;

    const gender =
      peopleData.genders?.[0]?.value?.toLowerCase() || "prefer_not_to_say";
    const birthdayObj = peopleData.birthdays?.[0]?.date;
    const phoneNumber = peopleData.phoneNumbers?.[0]?.value;

    const dateOfBirth = birthdayObj
      ? new Date(
          `${birthdayObj.year || 2000}-${birthdayObj.month}-${birthdayObj.day}`
        )
      : undefined;*/

    let user = await User.findOne({ email });
    if (user) {
      let updated = false;

      if (!user.authProvider) {
        user.authProvider = "google";
        updated = true;
      }

      if (!user.profilePicture) {
        user.profilePicture = picture;
        updated = true;
      }

      if (updated) await user.save();
    }

    if (user) {
      const jwtToken = jwt.sign(
        { id: user._id, username: user.username, email: user.email },
        process.env.JWT_SECRET
      );

      const isProfileIncomplete =
        !user.phoneNumber ||
        !user.gender ||
        !user.dateOfBirth ||
        !user.accountType ||
        !user.interests ||
        !user.profileCompleted;

      /*const refreshToken = jwt.sign(
        { id: user._id, role: user.role },
        process.env.REFRESH_TOKEN,
        { expiresIn: "7d" }
      );

      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "Strict",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });*/

      return res.status(200).json({
        message: "google login successful",
        user,
        jwtToken,
        isGoogleUser: user.signUpMode === "google",
        profileCompleted: !isProfileIncomplete,
      });
    }

    const username = email.split("@")[0];

    const checkEmailAgain = await User.findOne({ email });
    if (checkEmailAgain) {
      return res.status(409).json({ message: "email already exists" });
    }

    const stripeCustomer = await stripe.customers.create({
      email: email.toLowerCase(),
      name: `${fullName}`,
    });

    user = new User({
      fullName,
      username,
      email,
      password: sub,
      signUpMode: "google",
      profilePicture: picture,
      stripeCustomerId: stripeCustomer.id,
      /*gender,
      dateOfBirth,
      phoneNumber,
      isPhoneVerified: true,*/
    });

    await user.save();

    const jwtToken = jwt.sign(
      { id: user._id, username: user.username, email: user.email },
      process.env.JWT_SECRET
    );

    /*const refreshToken = jwt.sign(
      { id: user._id, role: user.role },
      process.env.REFRESH_TOKEN,
      { expiresIn: "7d" }
    );

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });*/

    return res.status(201).json({
      message: "google signup successful",
      user,
      jwtToken,
      isGoogleUser: user.signUpMode === "google",
      profileCompleted: !isProfileIncomplete,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(400)
      .json({ error: "google signup/signin failed", details: error.message });
  }
};

exports.completeProfile = async (req, res) => {
  const userId = req.user.id;
  const { phoneNumber, gender, dateOfBirth, accountType, interests } = req.body;

  try {
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    if (user.signUpMode !== "google") {
      return res
        .status(403)
        .json({ error: "Not allowed for non-Google users." });
    }

    user.phoneNumber = phoneNumber || user.phoneNumber;
    user.gender = gender || user.gender;
    user.dateOfBirth = dateOfBirth || user.dateOfBirth;
    user.accountType = accountType || user.accountType;
    user.interests = interests || user.interests;
    user.isPhoneVerified = true;
    user.profileCompleted = true;

    await user.save();

    return res.status(200).json({
      message: "Profile completed successfully.",
      user,
    });
  } catch (error) {
    console.error("Profile completion error:", error);
    return res
      .status(500)
      .json({ error: "Server error", details: error.message });
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
    const expiresAt = Date.now() + 10 * 60 * 1000;

    await VerificationCode.create({ user: user._id, email, code, expiresAt });

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

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ error: "User not found." });

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

    await VerificationCode.create({ user: user._id, email, code, expiresAt });

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

    const jwtToken = jwt.sign(
      { id: user._id, username: user.username, email: user.email },
      process.env.JWT_SECRET
    );

    return res
      .status(200)
      .json({ message: "Login successful.", jwtToken, user });
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

    const validateEmail = (email) => {
      const regex =
        /^[^\s@]+@[^\s@]+\.(com|net|org|edu|gov|mil|biz|info|mobi|name|aero|jobs|museum|co\.[a-z]{2}|[a-z]{2})$/i;
      return regex.test(email);
    };

    if (!validateEmail(newEmail)) {
      return res.status(400).json({ error: "Invalid email format." });
    }

    const emailExists = await User.findOne({ email: newEmail.toLowerCase() });
    if (emailExists) {
      return res.status(409).json({ message: "Email already in use." });
    }

    await VerificationCode.deleteMany({ email: newEmail.toLowerCase() });

    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000;

    // Save or update code with association to user and new email
    await VerificationCode.findOneAndUpdate(
      { user: userId, email: newEmail.toLowerCase() },
      { code, expiresAt },
      { upsert: true, new: true }
    );

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

// COMMUNITIES AND SUBSCRIPTION INFO controller functions

exports.requestChangePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res
        .status(400)
        .json({ message: "Old and new password are required." });
    }

    const validatePassword = (password) => {
      return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_\-+={}[\]|:;"'<>,.?/~`])[A-Za-z\d!@#$%^&*()_\-+={}[\]|:;"'<>,.?/~`]{8,}$/.test(
        password
      );
    };

    if (!validatePassword(newPassword)) {
      return res.status(400).json({
        error:
          "Password must be at least 8 characters, include an uppercase letter, a lowercase letter, a number, and a special character.",
      });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found." });

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Old password is incorrect." });

    await VerificationCode.deleteMany({ email: user.email });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await VerificationCode.create({
      user: user._id,
      email: user.email,
      code,
      expiresAt,
    });

    return res.status(200).json({
      message:
        "OTP code generated. Send this code to the user's email to continue.",
      email: user.email,
      code,
      expiresAt,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Failed to process password change.",
      error: error.message,
    });
  }
};

exports.confirmChangePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { newPassword, code } = req.body;

    if (!newPassword || !code) {
      return res
        .status(400)
        .json({ message: "New password and code are required." });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found." });

    const verification = await VerificationCode.findOne({
      user: user._id,
      email: user.email,
      code,
      expiresAt: { $gt: new Date() },
    });

    if (!verification) {
      return res.status(400).json({ message: "Invalid or expired OTP code." });
    }

    user.password = newPassword;
    await user.save();

    return res.status(200).json({ message: "Password changed successfully." });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Failed to change password.", error: error.message });
  }
};

exports.forgotPassword = async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required." });

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: "User not found." });

    await PasswordResetToken.deleteMany({ user: user._id });

    const token = crypto.randomInt(100000, 999999).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000;

    await PasswordResetToken.create({ user: user._id, token, expiresAt });

    return res.status(200).json({
      message: "Password reset code has been generated.",
      token,
      expiresAt,
    });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: "Failed to process password reset request." });
  }
};

exports.resetPassword = async (req, res) => {
  const { token, newPassword /*, confirmPassword*/ } = req.body;

  if (!token || !newPassword /* || !confirmPassword*/) {
    return res.status(400).json({ error: "All fields are required." });
  }

  /*if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: "Passwords do not match." });
  }*/

  const validatePassword = (password) => {
    return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_\-+={}[\]|:;"'<>,.?/~`])[A-Za-z\d!@#$%^&*()_\-+={}[\]|:;"'<>,.?/~`]{8,}$/.test(
      password
    );
  };

  if (!validatePassword(newPassword)) {
    return res.status(400).json({
      error:
        "Password must be at least 8 characters, include an uppercase letter, a lowercase letter, a number, and a special character.",
    });
  }

  try {
    const resetRecord = await PasswordResetToken.findOne({ token });
    if (!resetRecord || resetRecord.expiresAt < Date.now()) {
      return res.status(400).json({ error: "Invalid or expired reset token." });
    }

    const user = await User.findById(resetRecord.user);
    if (!user) return res.status(404).json({ error: "User not found." });

    user.password = newPassword;

    if (!user.profilePicture?.url) {
      user.profilePicture = {
        url: process.env.DEFAULT_PROFILE_PIC,
        key: process.env.DEFAULT_PROFILE_KEY,
      };
    }

    await user.save();

    await PasswordResetToken.deleteMany({ user: user._id });

    return res.status(200).json({ message: "Password has been reset." });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ error: "Failed to reset password.", details: error.message });
  }
};

exports.generateProfilePicUploadUrl = async (req, res) => {
  try {
    const fileExt = req.query.fileType || "jpg";
    const userId = req.user._id.toString();

    const key = `profile-pictures/${userId}-${uuidv4()}.${fileExt}`;

    const command = new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
      ContentType: `image/${fileExt}`,
      ACL: "public-read", // optional, but common for profile images.
    });

    const uploadURL = await getSignedUrl(s3, command, { expiresIn: 60 });

    return res.status(200).json({
      success: true,
      uploadURL,
      key,
      fileURL: `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`,
    });
  } catch (err) {
    console.error("S3 Profile Pic URL Error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to generate profile picture upload URL.",
      error: err.message,
    });
  }
};

exports.uploadProfilePicture = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    const { fileURL, key } = req.body;

    if (!fileURL || !key) {
      return res.status(400).json({ message: "Missing profile picture data." });
    }

    const oldKey = user.profilePicture?.key;

    // Delete old profile picture if it exists and is NOT the default
    if (oldKey && oldKey !== process.env.DEFAULT_PROFILE_KEY) {
      try {
        await s3.send(
          new DeleteObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: oldKey,
          })
        );
      } catch (err) {
        console.warn("Failed to delete old profile picture:", err.message);
      }
    }

    user.profilePicture = { url: fileURL, key };
    await user.save();

    res.status(200).json({
      message: "Profile picture updated successfully.",
      profilePicture: user.profilePicture,
    });
  } catch (err) {
    console.error("Error uploading profile picture:", err.message);
    res.status(500).json({ message: "Internal server error." });
  }
};

exports.removeProfilePicture = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    const currentKey = user.profilePicture?.key;

    // Delete current picture if it exists and is NOT the default
    if (currentKey && currentKey !== process.env.DEFAULT_PROFILE_KEY) {
      try {
        await s3.send(
          new DeleteObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: currentKey,
          })
        );
      } catch (err) {
        console.warn("Failed to delete profile picture:", err.message);
      }
    }

    // Reset to default
    user.profilePicture = {
      url: process.env.DEFAULT_PROFILE_PIC,
      key: process.env.DEFAULT_PROFILE_KEY,
    };

    await user.save();

    res.status(200).json({
      message: "Profile picture removed and reset to default.",
      profilePicture: user.profilePicture,
    });
  } catch (err) {
    console.error("Error removing profile picture:", err.message);
    res.status(500).json({ message: "Internal server error." });
  }
};
