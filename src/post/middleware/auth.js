const jwt = require("jsonwebtoken");
//const User = require("../../user/model/user");

exports.authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "access token missing or invalid" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: decoded.id };
    if (!req.user) return res.status(401).json({ error: "user not found" });
    next();
  } catch (err) {
    return res
      .status(403)
      .json({ error: "invalid or expired access token", details: err.message });
  }
};

exports.authorize = (allowedRoles = []) => {
  return (req, res, next) => {
    if (!req.user.role.some((role) => allowedRoles.includes(role))) {
      return res
        .status(403)
        .json({ message: "forbidden: insufficient privileges" });
    }
    next();
  };
};
