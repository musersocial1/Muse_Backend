const elastic = require("../utils/elastic");

exports.indexUser = async (req, res) => {
  try {
    const { _id, ...userData } = req.body;
    // Ensure interests always exists
    userData.interests = userData.interests || [];
    await elastic.index({
      index: "users",
      id: _id,
      body: userData,
    });
    res.status(200).json({ message: "User indexed in search." });
  } catch (err) {
    console.error("Elastic indexUser error:", err);
    res
      .status(500)
      .json({ message: "Failed to index user.", error: err.message });
  }
};

exports.indexPost = async (req, res) => {
  try {
    const { _id, ...postData } = req.body;
    await elastic.index({
      index: "posts",
      id: _id,
      body: postData,
    });
    res.status(200).json({ message: "Post indexed in search." });
  } catch (err) {
    console.error("Elastic indexPost error:", err);
    res
      .status(500)
      .json({ message: "Failed to index post.", error: err.message });
  }
};

exports.indexComm = async (req, res) => {
  try {
    const { _id, ...commData } = req.body;
    commData.category = commData.category || "";
    commData.creatorUsername = commData.creatorUsername || "";
    await elastic.index({
      index: "communities",
      id: _id,
      body: commData,
    });
    res.status(200).json({ message: "Community indexed in search." });
  } catch (err) {
    console.error("Elastic indexComm error:", err);
    res
      .status(500)
      .json({ message: "Failed to index community.", error: err.message });
  }
};

exports.search = async (req, res) => {
  // const userId = req.user.id; // (integrate very much later)
  // TODO: In future, use req.user.id for personalized search/filtering
  const { q, size = 10, from = 0 } = req.query;
  if (!q) return res.status(400).json({ error: "Missing search query." });

  try {
    const results = await elastic.search({
      index: ["users", /*"posts",*/ "communities"],
      body: {
        query: {
          multi_match: {
            query: q,
            fields: [
              "username^3",
              "fullName^2",
              "interests",

              // COMMUNITY fields
              "name^3",
              "category^2",
              "creatorUsername^2",
            ],
            fuzziness: "auto",
          },
        },
        size: Number(size),
        from: Number(from),
      },
    });

    // Map hits for cleaner frontend consumption
    const hits = results.body.hits.hits.map((hit) => {
      if (hit._index === "communities") {
        return {
          _index: hit._index,
          _id: hit._id,
          name: hit._source.name,
          category: hit._source.category,
          //creator: hit._source.creator,
          creatorUsername: hit._source.creatorUsername,
          coverImage: hit._source.coverImage,
        };
      }
      if (hit._index === "users") {
        return {
          _index: hit._index,
          _id: hit._id,
          username: hit._source.username,
          fullName: hit._source.fullName,
          interests: hit._source.interests,
          profilePicture: hit._source.profilePicture,
        };
      }
      // fallback: return everything if needed
      return hit._source;
      /*_index: hit._index, // users, posts, or communities
      _id: hit._id,
      _score: hit._score,
      //_source: hit._source,
      ...hit._source,*/
    });

    const total =
      typeof results.body.hits.total === "number"
        ? results.body.hits.total
        : results.body.hits.total.value;

    res.json({ results: hits, total });
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: "Search failed.", details: err.message });
  }
};

exports.discoverFeed = async (req, res) => {
  const { size = 10, from = 0 } = req.query;
  const userInterests =
    req.user && Array.isArray(req.user.interests) ? req.user.interests : [];

  if (!userInterests.length) {
    return res.status(200).json({ results: [], total: 0 });
  }

  try {
    // communities that match user's interests
    const results = await elastic.search({
      index: ["communities"],
      body: {
        query: {
          terms: {
            category: userInterests, // matches any
          },
        },
        sort: [
          // { trendingScore: "desc" }, // if field exist
          { createdAt: "desc" }, // or fall back to most recent
        ],
        size: Number(size),
        from: Number(from),
      },
    });

    const hits = results.body.hits.hits.map((hit) => ({
      _index: hit._index,
      _id: hit._id,
      ...hit._source,
    }));

    res.json({ results: hits, total: results.body.hits.total.value });
  } catch (err) {
    console.error("Discover feed error:", err);
    res
      .status(500)
      .json({ error: "Discover feed failed.", details: err.message });
  }
};
