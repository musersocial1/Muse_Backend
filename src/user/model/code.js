const mongoose = require("mongoose");
const { Schema } = mongoose;

const verificationCodeSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    email: { type: String, required: true, unique: true, trim: true },
    code: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

const VerificationCode = mongoose.model(
  "VerificationCode",
  verificationCodeSchema
);
module.exports = VerificationCode;
