process.env.NODE_ENV = "test";
process.env.REDIS_URL = "";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || "7d";
process.env.MONGOMS_VERSION = process.platform === "win32" ? "4.4.28" : "8.2.6";
