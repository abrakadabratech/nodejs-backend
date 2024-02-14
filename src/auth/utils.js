const functions = require("firebase-functions");
const logger = require("firebase-functions/logger");
const { db } = require("../utils/firebase");
const jwt = require("jsonwebtoken");
const { adminAuthJwtKey } = require("../utils/constants");
function verifyAdminAuth(req, res, next) {
  const { authorization } = req.headers;

  if (!authorization) {
    return res.status(403).send({ auth: false, message: "No token provided." });
  }

  // Split the Bearer token
  const tokenParts = authorization.split(" ");
  if (tokenParts.length !== 2 || tokenParts[0] !== "Bearer") {
    return res
      .status(400)
      .send({ auth: false, message: "Invalid Authentication Token!" });
  }
  const token = tokenParts[1];

  jwt.verify(token, adminAuthJwtKey, (err, decoded) => {
    if (err) {
      return res
        .status(500)
        .send({ auth: false, message: "Failed to authenticate token." });
    }

    res.locals = {
      uid: decoded.userId,
      email: decoded.email,
      name: decoded.name,
    };

    next();
  });
}

module.exports = { verifyAdminAuth };
