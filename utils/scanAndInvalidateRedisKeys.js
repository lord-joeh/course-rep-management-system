const { client } = require("../config/redis");

async function scanAndInvalidateRedisKeys(pattern) {
  let cursor = "0";

  try {
    do {
      const [nextCursor, keys] = await client.scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        100,
      );

      cursor = nextCursor;

      if (keys && keys.length > 0) {
        await client.unlink(keys);
      }
    } while (cursor !== "0");
  } catch (error) {
    console.error(`Background Redis Invalidation Error: ${error.message}`);
    throw error;
  }
}

module.exports = scanAndInvalidateRedisKeys;
