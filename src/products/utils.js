const admin = require("firebase-admin");
const { db } = require("../utils/firebase");

/**
 * Checks if the user is allowed to create a request on a product.
 * @param {string} userId - The ID of the user.
 * @returns {Promise<boolean>} - A promise that resolves with true if the user is allowed to create a request, false otherwise.
 */
async function isRequestAllowed(userId) {
  console.log(userId)
  const userRef = db.collection("user_requests").doc(userId);
  const userDoc = await userRef.get();

  if (!userDoc.exists) {
    // Create the doc with stat of zero
    await userRef.set({
      user_id: userId,
      request_count: 0,
      last_update_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    return true;
  }

  const requestCount = userDoc.data().requestCount;
  const lastUpdated = userDoc.data().last_update_at.toDate();
  const currentDate = new Date();

  // Check if the last updated is past the given date condition (12:00 am)
  if (
    lastUpdated <
    new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      currentDate.getDate()
    )
  ) {
    // Reset the stats to 0
    await userRef.set({
      user_id: userId,
      request_count: 0,
      last_update_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    return true;
  }

  // Check if the user has reached the maximum request count
  if (requestCount >= 2) {
    return false;
  }

  return true;
}

/**
 * Adds a new request count for a user.
 * @param {string} userId - The ID of the user.
 * @returns {Promise<void>} - A promise that resolves when the request count is added.
 */
async function addRequestCount(userId) {
  const userRef = db.collection("user_requests").doc(userId);
  await userRef.update({
    request_count: admin.firestore.FieldValue.increment(1),
    last_update_at: admin.firestore.Timestamp.now(),
  });
}

/**
 * Decreases the request count by 1 for a user.
 * @param {string} userId - The ID of the user.
 * @returns {Promise<void>} - A promise that resolves when the request count is decreased.
 */
async function decreaseRequestCount(userId) {
  const userRef = db.collection("user_requests").doc(userId);
  const userDoc = await userRef.get();

  if (!userDoc.exists) {
    // User document doesn't exist, no request count to decrease
    return;
  }

  const requestCount = userDoc.data().requestCount;

  if (requestCount <= 0) {
    // Request count is already 0, no need to decrease further
    return;
  }

  await userRef.update({
    request_count: admin.firestore.FieldValue.increment(-1),
    last_update_at: admin.firestore.Timestamp.now(),
  });
}

module.exports = { isRequestAllowed, addRequestCount, decreaseRequestCount };
