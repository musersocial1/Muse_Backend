const {
  S3Client,
  DeleteObjectCommand,
  PutObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { v4: uuidv4 } = require("uuid");
const Post = require("../model/post");
const Comment = require("../model/comment");

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
  },
});

exports.generatePostUploadUrl = async (req, res) => {
  try {
    const fileExt = req.query.fileType || "jpg"; // from frontend: .jpg, .png, etc.
    const oldKey = req.query.oldKey;

    // Optional: delete old post image if provided
    if (oldKey) {
      try {
        await s3.send(
          new DeleteObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: oldKey,
          })
        );
      } catch (err) {
        console.warn("Failed to delete old post image:", err.message);
      }
    }

    const key = `posts/${uuidv4()}.${fileExt}`;

    const params = new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
      ContentType: `image/${fileExt}`,
    });

    const uploadURL = await getSignedUrl(s3, params, { expiresIn: 60 });

    res.status(200).json({
      success: true,
      uploadURL,
      key,
      fileURL: `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`,
    });
  } catch (err) {
    console.error("S3 Post Image URL Error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to generate post image URL.",
      detail: err.message,
    });
  }
};

exports.createPost = async (req, res) => {
  try {
    const { content, images = [], tags = [] } = req.body;

    if (!content) {
      return res
        .status(400)
        .json({ success: false, message: "Content is required." });
    }

    const post = new Post({
      userId: req.user.id,
      content,
      images,
      tags,
    });

    await post.save();

    res.status(201).json({
      success: true,
      message: "Post created successfully.",
      post,
    });
  } catch (err) {
    console.error("Create Post Error:", err);
    res.status(500).json({
      success: false,
      message: "Server error while creating post.",
      detail: err.message,
    });
  }
};

exports.getAllPosts = async (req, res) => {
  try {
    const posts = await Post.find()
      //.populate("userId", "username profilePicture") // fetch basic user info
      .sort({ createdAt: -1 }) // newest first
      .lean({ virtuals: true }); // include virtuals like "comments"

    res.status(200).json({
      success: true,
      data: posts,
    });
  } catch (err) {
    console.error("Error fetching posts:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch posts.",
      detail: err.message,
    });
  }
};

exports.getPostById = async (req, res) => {
  try {
    const { postId } = req.params;

    const post = await Post.findById(postId)
      //.populate("userId", "username profilePicture")
      .lean({ virtuals: true });

    if (!post) {
      return res
        .status(404)
        .json({ success: false, message: "Post not found." });
    }

    res.status(200).json({
      success: true,
      data: post,
    });
  } catch (err) {
    console.error("Error fetching post:", err);
    res.status(500).json({
      success: false,
      message: "Failed to get post.",
      detail: err.message,
    });
  }
};

exports.getPostsByUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const posts = await Post.find({ userId })
      //.populate("userId", "username profilePicture")
      .sort({ createdAt: -1 })
      .lean({ virtuals: true });

    res.status(200).json({
      success: true,
      data: posts,
    });
  } catch (err) {
    console.error("Error fetching user's posts:", err);
    res.status(500).json({
      success: false,
      message: "Failed to get user's posts.",
      detail: err.message,
    });
  }
};

exports.LikePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.id;

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found.",
      });
    }

    const index = post.likes.indexOf(userId);

    if (index === -1) {
      post.likes.push(userId);
    } else {
      post.likes.splice(index, 1);
    }

    await post.save();

    res.status(200).json({
      success: true,
      liked: index === -1,
      likesCount: post.likes.length,
    });
  } catch (err) {
    console.error("Like Post Error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to like on post.",
      detail: err.message,
    });
  }
};

exports.createComment = async (req, res) => {
  try {
    const { postId, text = "", images = [], parent = null } = req.body;

    if (!postId || (!text?.trim() && (!images || images.length === 0))) {
      return res.status(400).json({
        success: false,
        message: "Comment must contain text or an image.",
      });
    }

    const comment = await Comment.create({
      post: postId,
      user: req.user.id,
      text,
      images,
      parent,
    });

    res.status(201).json({
      success: true,
      message: "Comment created successfully.",
      data: comment,
    });
  } catch (err) {
    console.error("Create Comment Error:", err);
    res.status(500).json({
      success: false,
      message: "Server error while creating comment.",
      detail: err.message,
    });
  }
};

exports.getCommentsForPost = async (req, res) => {
  try {
    const { postId } = req.params;

    const comments = await Comment.find({ post: postId, parent: null })
      //.populate("user", "username profilePicture")
      .populate("repliesCount") // this ensures repliesCount is included
      .lean({ virtuals: true })
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: comments,
    });
  } catch (err) {
    console.error("Fetch Comments Error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch comments.",
      detail: err.message,
    });
  }
};

exports.getRepliesForComment = async (req, res) => {
  try {
    const { commentId } = req.params;

    const replies = await Comment.find({ parent: commentId })
      //.populate("user", "username profilePicture")
      .lean({ virtuals: true })
      .sort({ createdAt: 1 }); // Oldest first

    res.status(200).json({
      success: true,
      data: replies,
    });
  } catch (err) {
    console.error("Fetch Replies Error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch replies.",
      detail: err.message,
    });
  }
};

exports.LikeComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.id;

    const comment = await Comment.findById(commentId);
    if (!comment) {
      return res.status(404).json({
        success: false,
        message: "Comment not found.",
      });
    }

    const index = comment.likes.indexOf(userId);
    if (index === -1) {
      comment.likes.push(userId);
    } else {
      comment.likes.splice(index, 1);
    }

    await comment.save();

    res.status(200).json({
      success: true,
      liked: index === -1,
      likesCount: comment.likes.length,
    });
  } catch (err) {
    console.error("Like Comment Error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to like on comment.",
      detail: err.message,
    });
  }
};

exports.updatePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.id;
    const { content, images, tags } = req.body;

    const post = await Post.findById(postId);
    if (!post) {
      return res
        .status(404)
        .json({ success: false, message: "Post not found." });
    }

    if (post.userId.toString() !== userId) {
      return res
        .status(403)
        .json({ success: false, message: "Unauthorized to update this post." });
    }

    if (content !== undefined) post.content = content;
    if (images !== undefined) post.images = images;
    if (tags !== undefined) post.tags = tags;

    await post.save();

    res.status(200).json({
      success: true,
      message: "Post updated successfully.",
      post,
    });
  } catch (err) {
    console.error("Update Post Error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to update post.",
      detail: err.message,
    });
  }
};

exports.updateComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.id;
    const { text, images } = req.body;

    const comment = await Comment.findById(commentId);
    if (!comment) {
      return res
        .status(404)
        .json({ success: false, message: "Comment not found." });
    }

    if (comment.user.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized to update this comment.",
      });
    }

    if (text !== undefined) comment.text = text;
    if (images !== undefined) comment.images = images;

    await comment.save();

    res.status(200).json({
      success: true,
      message: "Comment updated successfully.",
      comment,
    });
  } catch (err) {
    console.error("Update Comment Error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to update comment.",
      detail: err.message,
    });
  }
};

exports.deletePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.id;

    const post = await Post.findById(postId);
    if (!post) {
      return res
        .status(404)
        .json({ success: false, message: "Post not found." });
    }

    if (post.userId.toString() !== userId) {
      return res
        .status(403)
        .json({ success: false, message: "Unauthorized to delete this post." });
    }

    await post.deleteOne();

    res
      .status(200)
      .json({ success: true, message: "Post deleted successfully." });
  } catch (err) {
    console.error("Delete Post Error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to delete post.",
      detail: err.message,
    });
  }
};

exports.deleteComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.id;

    const comment = await Comment.findById(commentId);
    if (!comment) {
      return res
        .status(404)
        .json({ success: false, message: "Comment not found." });
    }

    if (comment.user.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized to delete this comment.",
      });
    }

    await comment.deleteOne();

    res
      .status(200)
      .json({ success: true, message: "Comment deleted successfully." });
  } catch (err) {
    console.error("Delete Comment Error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to delete comment.",
      detail: err.message,
    });
  }
};
