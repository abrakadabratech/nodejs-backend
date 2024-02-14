const { firestore } = require("firebase-admin");
const { db } = require("../utils/firebase");

async function updateAdminAnalytics() {
  try {
    console.log("start");

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      totalUsersSnapshot,
      totalUsersThisWeekSnapshot,
      totalUsersInDaySnapshot,
      totalProductsSnapshot,
      totalProductRequestsSnapshot,
      successfulTransactionsSnapshot,
      activeProductsSnapshot,
      activeUsersSnapshot,
      receivedOrDeliveredRequestsSnapshot,
    ] = await Promise.all([
      db.collection("users").get(),
      db.collection("users").where("timestamp", ">=", sevenDaysAgo).get(),
      db.collection("users").where("timestamp", ">=", twentyFourHoursAgo).get(),
      db.collection("products").get(),
      db.collection("product_requests").get(),
      db
        .collection("product_requests")
        .where("isReceived", "==", true)
        .where("isDelivered", "==", true)
        .get(),
      db.collection("products").where("status", "==", "active").get(),
      db.collection("users").where("status", "==", "active").get(),
      db
        .collection("product_requests")
        .where("status", "in", ["received", "delivered"])
        .get(),
    ]);

    const stats = {
      totalUsers: totalUsersSnapshot.size,
      totalProducts: totalProductsSnapshot.size,
      totalProductRequests: totalProductRequestsSnapshot.size,
      successfulTransactions: successfulTransactionsSnapshot.size,
      activeProducts: activeProductsSnapshot.size,
      activeUsers: activeUsersSnapshot.size,
      receivedOrDeliveredRequests: receivedOrDeliveredRequestsSnapshot.size,
      totalUsersThisWeek: totalUsersThisWeekSnapshot.size,
      totalUsersinDay: totalUsersInDaySnapshot.size,
      updatedAt: firestore.FieldValue.serverTimestamp(),
    };

    console.log("End");
    await db.collection("app").doc("analytics").set(stats);

    await db
      .collection("app")
      .doc("analytics")
      .collection("history")
      .add(stats);
  } catch (error) {
    console.log("Error:", error);
  }
}

module.exports = { updateAdminAnalytics };
