function logRequests(req, res, next) {
  const currentTime = new Date().toISOString(); // Get current time in ISO format
  console.log(
    `[${currentTime}] Received ${req.method} request on ${req.url} from ${req.ip}`
  );
  next();
}

module.exports = { logRequests };
