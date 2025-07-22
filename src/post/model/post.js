const mongoose = require("mongoose");
const { Schema } = mongoose;

const postSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
    content: {
      type: String,
      trim: true,
      required: true,
    },
    images: [
      {
        url: { type: String, required: true },
        key: { type: String },
      },
    ],
    tags: [{ type: String, trim: true }],
    likes: [{ type: Schema.Types.ObjectId, ref: "User" }],
    likesCount: {
      type: Number,
      default: 0,
    },
    commentsCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

postSchema.virtual("comments", {
  ref: "Comment",
  localField: "_id",
  foreignField: "post",
});

//dummy
// if (!mongoose.models.User) {
//   mongoose.model("User", new mongoose.Schema({}, { strict: false }));
// }

const Post = mongoose.model("Post", postSchema);
module.exports = Post;
