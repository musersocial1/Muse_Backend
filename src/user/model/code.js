const mongoose = require("mongoose");
const { Schema } = mongoose;

const verificationCodeSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    //phoneNumber: { type: String, trim: true },
    email: { type: String, unique: true, trim: true, required: true },
    code: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    //used: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const VerificationCode = mongoose.model(
  "VerificationCode",
  verificationCodeSchema
);
module.exports = VerificationCode;
