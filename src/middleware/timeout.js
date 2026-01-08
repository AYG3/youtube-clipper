/**
 * Timeout middleware for long-running requests
 */
const config = require('../config');

/**
 * Set request/response timeout
 */
function timeoutMiddleware(req, res, next) {
  req.setTimeout(config.DEFAULT_TIMEOUT_MS);
  res.setTimeout(config.DEFAULT_TIMEOUT_MS);
  next();
}

module.exports = timeoutMiddleware;
