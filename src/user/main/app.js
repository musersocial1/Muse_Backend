const express = require("express");
const http = require("http");
const cors = require("cors");
//const cookieParser = require("cookie-parser");
require("dotenv").config({ path: __dirname + "/../.env" });
//const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const corsOptions = {
  origin: "*",
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

const userRoute = require("../router/user");
const cardRoute = require("../router/card");

app.use(`/user`, userRoute);
app.use(`/card`, cardRoute);

/*app.use((err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE") {
    return res
      .status(413)
      .json({ error: "File too large. Max allowed is 2MB." });
  }
  next(err);
});*/

app.get("/", (req, res) => {
  res.status(200).send("Hello User Muse_Backend!");
});

app.get("/ping", (req, res) => {
  res.status(200).send("user-pong");
});
console.log("pinged at", new Date().toLocaleTimeString());

module.exports = { app, server };
