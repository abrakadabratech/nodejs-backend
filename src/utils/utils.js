const { db } = require("./firebase");
const { getMessaging } = require("firebase-admin/messaging");
const functions = require("firebase-functions");
const firestore = require("firebase-admin/firestore");
const { messaging } = require("firebase-admin");

async function sendNotification(
  userIds,
  notificationTitle,
  notificationBody,
  action_data,
  android_action = {}
) {
  const usersRef = db.collection("users");
  const notificationsRef = db.collection("notifications");

  for (const userId of userIds) {
    // Fetch user's FCM token
    const userDoc = await usersRef.doc(userId).get();
    const fcmToken = userDoc.data().fcmToken;

    if (!fcmToken) {
      functions.logger.error(`FCM-TOKEN Not Found! - UID - ${userId}`);
      continue;
    }

    // Send a notification

    // Record the notification in Firestore
    const notificationDocRef = notificationsRef.doc();

    const message = {
      notification: {
        title: notificationTitle,
        body: notificationBody,
      },
      data: {
        title: notificationTitle,
        body: notificationBody,
        ...action_data,
        data: JSON.stringify({
          ...action_data.data,
          notificationDoc: notificationDocRef.id,
        }),
      },

      android: android_action,
      token: fcmToken,
    };

    await notificationDocRef.set({
      docId: notificationDocRef.id,
      userId: userId,
      title: message.data.title,
      body: message.data.body,
      module: message.data.module,
      data: JSON.parse(message.data.data),
      timestamp: firestore.FieldValue.serverTimestamp(),
      deleted: false,
    });

    console.log(notificationDocRef.id);

    // Send the message
    await messaging().send(message);
  }
}

// async function sendNotification(
//   userIds,
//   notificationTitle,
//   notificationBody,
//   action_data,
//   android_action = {}
// ) {
//   const usersRef = db.collection("users");

//   const tokens = [];

//   const users = await Promise.all(
//     userIds.map(async (id) => {
//       const userDoc = await usersRef.doc(id).get();
//       const t = userDoc.data().fcmToken;
//       if (t) tokens.push(t);
//     })
//   );
//   if (tokens.length === 0) return;

//   const notificationsRef = db.collection("notifications");

//   const message = {
//     notification: {
//       title: notificationTitle,
//       body: notificationBody,
//     },
//     data: {
//       title: notificationTitle,
//       body: notificationBody,
//       ...action_data,
//       data: JSON.stringify({
//         ...action_data.data,
//         notificationDoc: notificationsRef.id,
//       }),
//     },
//     android: android_action,
//     tokens,
//   };

//   // TODO: Remove Logging for prod
//   getMessaging()
//     .sendMulticast(message)
//     .then(async (response) => {
//       functions.logger.info({
//         userIds,
//         tokens,
//         response,
//         message: "notification are sent",
//       });

//       // Create a batched write operation for all the notifications
//       const batch = db.batch();

//       userIds.forEach((userId) => {
//         // Generate a unique ID for the notification document
//         const notificationId = db.collection("notifications").doc().id;

//         // Create a new notification document with the user ID and a timestamp
//         const notification = {
//           docId: notificationId,
//           userId: userId,
//           title: message.data.title,
//           body: message.data.body,
//           module: message.data.module,
//           data: JSON.parse(message.data.data),
//           timestamp: firestore.FieldValue.serverTimestamp(),
//           deleted: false,
//         };

//         // Add the notification document to the batched write operation
//         batch.set(notificationsRef.doc(notificationId), notification);
//       });
//       await batch.commit();
//     })
//     .catch((e) => {
//       console.log(e);
//       functions.logger.error({
//         userIds,
//         tokens,
//         e,
//         message: "notification not sent",
//       });
//     });
// }

async function calculateUserRating(userId, newValue) {
  const userStatsRef = db.collection("user_stats").doc(userId);
  const snapshot = await userStatsRef.get();
  const userStats = snapshot.data().rating;
  var updated = 0;
  if (parseInt(userStats) === 0) {
    updated = newValue;
  } else {
    updated = Math.floor((userStats + newValue) / 2);
  }

  await userStatsRef.update({ rating: updated });
}

function maskEmail(email) {
  const atIndex = email.indexOf("@");
  if (atIndex === -1 || atIndex < 2) {
    throw new Error("Invalid email format");
  }

  const namePart = email.slice(0, atIndex);
  const domainPart = email.slice(atIndex);

  return namePart.slice(0, 3) + "*".repeat(namePart.length - 3) + domainPart;
}

function maskPhoneNumber(phoneNumber) {
  if (phoneNumber.length < 10) {
    throw new Error("Invalid phone number format");
  }

  const len = phoneNumber.length;
  return phoneNumber.slice(0, 4) + "*".repeat(len - 6) + phoneNumber.slice(-2);
}
module.exports = {
  sendNotification,
  calculateUserRating,
  maskEmail,
  maskPhoneNumber,
};
