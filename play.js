const { firestore } = require("firebase-admin");
const { db } = require("./src/utils/firebase");

// --------- chats-metadata collection

// async function createChatsMetadata() {
//   const chatsCollection = db.collection("chats");
//   const chatsMetadataCollection = db.collection("chats-metadata");

//   // Fetch all documents from the chats collection
//   const chatsSnapshot = await chatsCollection.get();
//   const productChatsMap = {};

//   // Group chats by product_id and gather metadata
//   chatsSnapshot.forEach((doc) => {
//     const chatData = doc.data();
//     const productId = chatData.product_id;
//     const giverId = chatData.from;
//     const lastActivity = chatData.time_stamp;

//     if (!productChatsMap[productId]) {
//       productChatsMap[productId] = {
//         chat_count: 0,
//         giver_id: giverId,
//         last_activity: lastActivity,
//         product_id: productId,
//       };
//     }

//     productChatsMap[productId].chat_count += 1;

//     // Update the last_activity timestamp if the current one is later
//     if (lastActivity > productChatsMap[productId].last_activity) {
//       productChatsMap[productId].last_activity = lastActivity;
//       console.log(productId, "- debug");
//     }
//   });

//   // Add metadata documents to the chats-metadata collection
//   for (const productId in productChatsMap) {
//     if (productChatsMap.hasOwnProperty(productId)) {
//       await chatsMetadataCollection
//         .doc(productId)
//         .set(productChatsMap[productId]);
//       console.log(productId, "- debug 2");
//     }
//   }

//   console.log("Chats metadata created successfully");
// }

// createChatsMetadata().catch(console.error);

// ---- online_users collection

// async function createOnlineUsers() {
//   const usersCollection = db.collection("users");
//   const onlineUsersCollection = db.collection("online_users");

//   // Fetch all documents from the users collection
//   const usersSnapshot = await usersCollection.get();

//   usersSnapshot.forEach(async (doc) => {
//     const userData = doc.data();

//     // Define the online users document structure
//     const onlineUser = {
//       isOnline: false,
//       lastOnlineTimestamp:
//         userData.updated_at || firestore.FieldValue.serverTimestamp(),
//     };

//     console.log(doc.id);
//     // Add the online user document to the online_users collection
//     await onlineUsersCollection.doc(doc.id).set(onlineUser);
//   });

//   console.log("Online users created successfully");
// }

// createOnlineUsers().catch(console.error);

// --- update chats
// const productStatus = {
//   active: "active",
//   hold: "hold",
//   pending: "pending",
//   review: "under review",
//   suspended: "suspended",
//   deleted: "deleted",
//   given: "given",
// };

// async function updateChatsCollection() {
//   const chatsCollection = db.collection("chats");
//   const productsCollection = db.collection("products");

//   // Fetch all documents from the chats collection
//   const chatsSnapshot = await chatsCollection.get();

//   for (const chatDoc of chatsSnapshot.docs) {
//     const chatData = chatDoc.data();
//     const productId = chatData.product_id;

//     console.log(chatDoc.id);
//     // Fetch the product document to get the display_image and status
//     const productDoc = await productsCollection.doc(productId).get();
//     const productData = productDoc.data();
//     const productImage = productData ? productData.display_image : "";
//     const productStatusValue = productData ? productData.status : "";

//     let chatClosed = chatData.enabled;
//     if (!chatData.enabled) {
//       if (
//         productStatusValue === productStatus.hold ||
//         productStatusValue === productStatus.pending ||
//         productStatusValue === productStatus.review ||
//         productStatusValue === productStatus.suspended ||
//         productStatusValue === productStatus.deleted ||
//         productStatusValue === productStatus.given
//       ) {
//         chatClosed = false;
//       } else if (productStatusValue === productStatus.active) {
//         chatClosed = true;
//       }
//     }

//     const data = {
//       chat_closed: !chatClosed,
//       chat_closed_reason: null,
//       check_warnings: false,
//       is_active: chatClosed,
//       product_image: productImage,
//       user_report_evaluations: [],
//       warnings: [],
//     };
//     console.log(data);
//     // Update the chat document
//     await chatDoc.ref.update(data);
//   }

//   console.log("Chats collection updated successfully");
// }

// updateChatsCollection().catch(console.error);
