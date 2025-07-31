const express = require("express");
const router = express.Router();
const {
  generatePostUploadUrl,
  createPost,
  getAllPosts,
  getPostById,
  getPostsByUser,
  LikePost,
  createComment,
  getCommentsForPost,
  getRepliesForComment,
  LikeComment,
  deletePost,
  deleteComment,
  updatePost,
  updateComment,
} = require("../controller/post");
const { authenticate } = require("../middleware/auth");

router.get("/get-post-images-upload-url", authenticate, generatePostUploadUrl);

router.post("/add-post", authenticate, createPost);

router.get("/get-all", authenticate, getAllPosts);

router.get("/get-post/:postId", authenticate, getPostById);

router.get("/get-user/:userId", authenticate, getPostsByUser);

router.post("/like/post/:postId", authenticate, LikePost);

router.post("/comment/add-comment", authenticate, createComment);

router.get("/comment/get-c4p/:postId", getCommentsForPost);

router.get("/comment/get-r4c/:commentId", getRepliesForComment);

router.post("/like/comment/:commentId", authenticate, LikeComment);

router.put("/update/:postId", authenticate, updatePost);

router.put("/comment/update/:commentId", authenticate, updateComment);

router.delete("/delete/:postId", authenticate, deletePost);

router.delete("/comment/delete/:commentId", authenticate, deleteComment);

module.exports = router;
