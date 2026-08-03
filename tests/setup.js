process.env.NODE_ENV = "test";
process.env.REDIS_URL = "";
process.env.MONGOMS_VERSION = process.platform === "win32" ? "4.4.28" : "8.2.6";
