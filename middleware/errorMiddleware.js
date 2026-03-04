import logger from "../utils/logger.js";

const errorHandler = (err, req, res, next) => {
  // Determine proper status code — Express 5 leaves res.statusCode at 200
  // for unhandled errors, so we must infer the correct code
  let statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;

  // Map known error types to proper HTTP status codes
  if (err.name === "ValidationError") statusCode = 400;
  if (err.code === 11000) statusCode = 409; // MongoDB duplicate key
  if (err.name === "CastError") statusCode = 400;

  res.status(statusCode);

  logger.error(`EXPRESS_ERROR [${req.method} ${req.url}]: ${err.stack || err.message || err}`);

  res.json({
    message: err.message,
    stack: process.env.NODE_ENV === "production" ? null : err.stack,
  });
};

export default errorHandler;
