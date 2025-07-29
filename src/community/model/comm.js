const mongoose = require("mongoose");
const { Schema } = mongoose;

const communitySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    coverImage: {
      url: { type: String, required: true },
      key: { type: String, required: true },
    },
    bio: { type: String, trim: true },
    guideline: { type: String, trim: true },
    links: [
      {
        type: String,
        validate: {
          validator: function (v) {
            // basic URL validation
            return /^https?:\/\/\S+\.\S+$/.test(v);
          },
          message: (props) => `${props.value} is not a valid URL!`,
        },
      },
    ],
    price: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    // For future: Stripe productId/priceId
    /*stripeProductId: { type: String },
    stripePriceId: { type: String },*/
    type: {
      type: String,
      enum: ["private", "public"],
      default: "public",
    },
    category: [{ type: String, trim: true }],
    creator: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    members: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    status: {
      type: String,
      enum: ["active", "archived", "blocked"],
      default: "active",
    },
  },
  { timestamps: true }
);

const Community = mongoose.model("Community", communitySchema);
module.exports = Community;
