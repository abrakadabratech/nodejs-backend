const admin = require("firebase-admin");
const { logger } = require("firebase-functions/v1");

async function isAuthenticated(req, res, next) {
  // res.locals.uid = "n91Enbiou2XDJ3fFVhYqv4Y8If53";
  // res.locals.uid = "D93SVUQFuifyMx549dXPWpYRXv6o1";
  // return next();

  const { authorization } = req.headers;

  if (!authorization)
    return res.send({
      code: 401,
      status: 0,
      response_message: "Unauthorized - Authorization Token Required",
    });
  if (!authorization.startsWith("Bearer"))
    return res.send({ code: 401, status: 0, response_message: "Unauthorized" });
  const split = authorization.split("Bearer ");
  if (split.length !== 2)
    return res.send({ code: 401, status: 0, response_message: "Unauthorized" });
  const token = split[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);

    res.locals = {
      ...res.locals,
      uid: decodedToken.uid,
      phone: decodedToken.phone_number,
    };
    return next();
  } catch (err) {
    logger.warn(
      `ERROR IN AUTHENTICATION ${err.code} -  ${err.message} - TOKEN -  ${token} - ENDPOINT -${req.method} ${req.originalUrl}`
    );
    return res.status(401).send({
      code: 401,
      status: 0,
      response_message: "Unauthorized - Invalid Token",
    });
  }
}

module.exports = { isAuthenticated };
