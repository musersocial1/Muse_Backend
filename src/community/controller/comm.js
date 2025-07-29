const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { v4: uuidv4 } = require("uuid");
const Community = require("../model/comm");
const User = require("../../user/model/user");

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
  },
});

exports.getCoverImageUploadUrl = async (req, res) => {
  try {
    const fileExt = req.query.fileType || "jpg";
    const oldKey = req.query.oldKey; // frontend should send this if there is an old image

    // Optional: delete the old image if provided
    if (oldKey) {
      try {
        await s3.send(
          new DeleteObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: oldKey,
          })
        );
      } catch (err) {
        console.warn("Failed to delete old cover image:", err.message);
      }
    }

    const key = `cover-images/${uuidv4()}.${fileExt}`;
    const command = new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
      ContentType: `image/${fileExt}`,
      ACL: "public-read",
    });

    const uploadURL = await getSignedUrl(s3, command, { expiresIn: 60 });

    return res.status(200).json({
      success: true,
      uploadURL,
      key,
      fileURL: `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to get signed URL.",
      error: err.message,
    });
  }
};

exports.createCommunity = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "creator") {
      return res
        .status(403)
        .json({ message: "Only creators can create communities." });
    }

    const creatorId = req.user.id;

    const { name, coverImage, bio, links, price, type, guideline, category } =
      req.body;

    if (!name || !coverImage || !coverImage.url || !coverImage.key) {
      return res
        .status(400)
        .json({ message: "Name and cover image are required." });
    }
    if (!bio || !links || !price || !type || !guideline || !category) {
      return res.status(400).json({ message: "these fields are required." });
    }

    /*if (!bio) return res.status(400).json({ message: "Bio is required." });
    if (!links || !Array.isArray(links))
      return res.status(400).json({ message: "Links must be an array." });
    if (typeof price !== "number" || price < 0)
      return res.status(400).json({ message: "Price must be a valid number." });
    if (!type || !["public", "private"].includes(type))
      return res
        .status(400)
        .json({ message: "Type must be public or private." });
    if (!guideline)
      return res.status(400).json({ message: "Guideline is required." });
    if (!category)
      return res.status(400).json({ message: "Category is required." });*/

    // Stripe payment logic (optional)
    // let stripeProductId = null;
    // let stripePriceId = null;
    // if (price > 0) {
    //   // Create Stripe product/price here
    // }

    // Create community document
    const community = new Community({
      name,
      coverImage,
      bio,
      links,
      price,
      type,
      guideline,
      category,
      creator: creatorId,
      members: [creatorId], // auto-add creator as member
      // stripeProductId,
      // stripePriceId,
    });

    await community.save();

    // Optionally, update the user document (e.g., add communityId to createdCommunities)
    // user.createdCommunities.push(community._id);
    // await user.save();

    // const axios = require('axios');

    // // after community.save() ...
    // try {
    // await axios.post(
    //     `${process.env.USER_SERVICE_URL}/users/${creatorId}/add-community`,
    //     { communityId: community._id }
    // );
    // } catch (err) {
    // // Optionally log or alert if this fails!
    // console.warn("Failed to update user's createdCommunities", err.message);
    // }

    return res.status(201).json({
      message: "Community created successfully.",
      community,
    });
  } catch (err) {
    console.error("Create Community Error:", err);
    return res
      .status(500)
      .json({ message: "Failed to create community.", error: err.message });
  }
};
