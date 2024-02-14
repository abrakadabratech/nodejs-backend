const admin = require("firebase-admin");
const { logger } = require("firebase-functions/v1");

async function isAuthenticated(req, res, next) {
  // res.locals.uid = "0O9L73FTMHWe3NawSB1PmqT49wz1";
  // res.locals.uid = "uGckR6IWnibLOsT8LnYbikhb40l2";
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

    console.log("decodedToken", JSON.stringify(decodedToken));
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
