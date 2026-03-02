import logger from "../utils/logger.js";

const errorHandler = (err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode);

  logger.error(`EXPRESS_ERROR [${req.method} ${req.url}]: ${err.stack || err.message || err}`);

  res.json({
    message: err.message,
    stack: process.env.NODE_ENV === "production" ? null : err.stack,
  });
};

export default errorHandler;
