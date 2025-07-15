const { server } = require("./app");
const { connectDb } = require("./db");

const port = process.env.PORT || 3000;

const startServer = async () => {
  try {
    await connectDb();

    server.listen(port, "0.0.0.0", () => {
      console.log(`server and websocket running on port ${port}`);
    });
  } catch (error) {
    console.error("error starting the server", error);
  }
};

startServer();
