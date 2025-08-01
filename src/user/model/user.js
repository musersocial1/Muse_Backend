const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { Schema } = mongoose;

const DEFAULT_PROFILE_PIC = process.env.DEFAULT_PROFILE_PIC;

const userSchema = new Schema({
  fullName: { type: String, trim: true, required: true },
  username: {
    type: String,
    unique: true,
    trim: true,
    sparse: true,
    required: true,
  },
  email: { type: String, unique: true, trim: true, required: true },
  password: { type: String, required: true },
  phoneNumber: { type: String, trim: true },
  isPhoneVerified: { type: Boolean, default: false },
  dateOfBirth: { type: Date },
  accountType: {
    type: String,
    enum: ["join_community", "create_community"],
    required: true,
  },
  gender: {
    type: String,
    enum: ["male", "female", "prefer_not_to_say"],
    default: "prefer_not_to_say",
  },
  interests: [{ type: String, trim: true }], // Array of strings for flexibility
  profilePicture: {
    url: {
      type: String,
      required: true,
      default: DEFAULT_PROFILE_PIC,
    },
    key: { type: String },
  },
  role: {
    type: String,
    enum: ["admin", "creator", "joiner"],
    default: "joiner",
    required: true,
  },
  // profilePicture: { type: String, default: process.env.DEFAULT_PROFILE_PIC },
  // isVerified: { type: Boolean, default: false },
  // isActive: { type: Boolean, default: true },
  signUpMode: {
    type: String,
    enum: ["local", "google"],
    default: "local",
  },
  usernameChangeCount: {
    type: Number,
    default: 0,
  },
  stripeCustomerId: { type: String, trim: true },
  profileCompleted: { type: Boolean, default: false }, // check this out very much later (null).
  createdAt: { type: Date, default: Date.now },
});

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

const User = mongoose.model("User", userSchema);
module.exports = User;
