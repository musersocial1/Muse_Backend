const mongoose = require("mongoose");
const { Schema } = mongoose;

const CardSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    paymentMethodId: { type: String, required: true }, // Stripe PaymentMethod ID
    last4: { type: String, required: true },
    brand: { type: String },
    expMonth: { type: Number },
    expYear: { type: Number },
    cardholderName: { type: String }
  },
  { timestamps: true }
);

const Card = mongoose.model("Card", CardSchema);
module.exports = Card;