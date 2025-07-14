const mongoose = require("mongoose");

const options = {
  // dbName: "eddva",
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  family: 4,
  directConnection: false,
};

const connectDb = async () => {
  try {
    console.log("initiating database connection...");
    await mongoose.connect(process.env.MONGO_URL, options);
    console.log("database connected :)");

    mongoose.connection.on("error", (err) => {
      console.error("database connection error:", err);
    });

    mongoose.connection.on("disconnected", () => {
      console.log("database disconnected :(");
    });
  } catch (error) {
    console.error("database connection failed:", error);
    process.exit(1);
  }
};

module.exports = { connectDb };