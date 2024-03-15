const { db } = require("../utils/firebase");

async function isUserBlocked(blockerId, blockedId) {
  const blocksSnapshot = await db
    .collection("blocks")
    .where("blocker", "==", blockerId)
    .where("blocked", "==", blockedId)
    .get();

  return !blocksSnapshot.empty;
}

module.exports = { isUserBlocked };
