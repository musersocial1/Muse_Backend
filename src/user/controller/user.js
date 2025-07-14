const twilio = require("twilio");

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

const client = twilio(accountSid, authToken);

exports.sendVerificationCode = async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) return res.status(400).json({ message: "Phone number is required." });

    await client.verify.v2.services(verifyServiceSid)
      .verifications
      .create({ to: phoneNumber, channel: "sms" });

    return res.status(200).json({ message: "Verification code sent." });
  } catch (error) {
    return res.status(500).json({ message: "Failed to send verification code.", error: error.message });
  }
};

exports.verifyPhoneCode = async (req, res) => {
    try {
      const { phoneNumber, code } = req.body;
      if (!phoneNumber || !code) {
        return res.status(400).json({ message: "Phone number and code are required." });
      }
  
      const verificationCheck = await client.verify.v2.services(verifyServiceSid)
        .verificationChecks
        .create({ to: phoneNumber, code });
  
      if (verificationCheck.status === "approved") {
        await User.findOneAndUpdate({ phoneNumber }, { isPhoneVerified: true });
  
        return res.status(200).json({ message: "Phone number verified!" });
      } else {
        return res.status(400).json({ message: "Incorrect verification code." });
      }
    } catch (error) {
      return res.status(500).json({ message: "Verification failed.", error: error.message });
    }
};