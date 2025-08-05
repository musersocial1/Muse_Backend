//const { Client } = require("@elastic/elasticsearch");
const { Client } = require("@opensearch-project/opensearch");

const client = new Client({
  node: process.env.ELASTIC_URL,
  auth: {
    username: process.env.ELASTIC_USERNAME,
    password: process.env.ELASTIC_PASSWORD,
  },
  //   headers: {
  //     "Content-Type": "application/json",
  //   },
  // If using AWS SigV4 auth, you’ll need aws4 module (advanced, ask if needed)
});

module.exports = client;
