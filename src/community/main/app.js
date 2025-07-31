const express = require("express");
const http = require("http");
const cors = require("cors");
//const cookieParser = require("cookie-parser");
require("dotenv").config({ path: __dirname + "/../.env" });
//const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const corsOptions = {
  origin: [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://localhost:3003",
    "http://localhost:3004",
    "http://localhost:3005",
  ],
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
//app.use(cookieParser());

/*const io = new Server(server, {
  cors: corsOptions,
});

io.on("connection", (socket) => {
  console.log("webSocket connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("webSocket disconnected:", socket.id);
  });
});

app.set("io", io);*/

const commRoute = require("../router/comm");
// const commentRoute = require("../route/comment");

app.use(`/community`, commRoute);
// app.use(`/comment`, commentRoute);

/*app.use((err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE") {
    return res
      .status(413)
      .json({ error: "File too large. Max allowed is 2MB." });
  }
  next(err);
});*/

app.get("/", (req, res) => {
  res.status(200).send("Hello from Muse_Backend!");
});

app.get("/ping", (req, res) => {
  res.status(200).send("post-pong");
});
console.log("pinged at", new Date().toLocaleTimeString());

module.exports = { app, server };
