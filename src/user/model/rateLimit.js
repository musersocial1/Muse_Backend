const mongoose = require("mongoose");
const { Schema } = mongoose;

const rateLimitSchema = new Schema({
  phoneNumber: { type: String, required: true },
  requests: { type: [Date], default: [] },
});

const RateLimit = mongoose.model("RateLimit", rateLimitSchema);
module.exports = RateLimit;
