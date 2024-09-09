const { firestore } = require("firebase-admin");
const { db } = require("./src/utils/firebase");
const { Timestamp } = require("firebase-admin/firestore");

// --------- chats-metadata collection
async function createChatsMetadata() {
  const chatsCollection = db.collection("chats");
  const chatsMetadataCollection = db.collection("chats-metadata");
  // Fetch all documents from the chats collection
  const chatsSnapshot = await chatsCollection.get();
  const productChatsMap = {};
  // Group chats by product_id and gather metadata
  chatsSnapshot.forEach((doc) => {
    const chatData = doc.data();
    const productId = chatData.product_id;
    const giverId = chatData.from;
    const lastActivity = chatData.time_stamp;
    if (!productChatsMap[productId]) {
      productChatsMap[productId] = {
        chat_count: 0,
        giver_id: giverId,
        last_activity: lastActivity,
        product_id: productId,
      };
    }
    productChatsMap[productId].chat_count += 1;
    // Update the last_activity timestamp if the current one is later
    if (lastActivity > productChatsMap[productId].last_activity) {
      productChatsMap[productId].last_activity = lastActivity;
      console.log(productId, "- debug");
    }
  });
  // Add metadata documents to the chats-metadata collection
  for (const productId in productChatsMap) {
    if (productChatsMap.hasOwnProperty(productId)) {
      await chatsMetadataCollection
        .doc(productId)
        .set(productChatsMap[productId]);
      console.log(productId, "- debug 2");
    }
  }
  console.log("Chats metadata created successfully");
}

// console.log(db);
// createChatsMetadata().catch(console.error);

// ---- online_users collection
async function createOnlineUsers() {
  const usersCollection = db.collection("users");
  const onlineUsersCollection = db.collection("online_users");

  // Fetch all documents from the users collection
  const usersSnapshot = await usersCollection.get();

  usersSnapshot.forEach(async (doc) => {
    const userData = doc.data();

    // Define the online users document structure
    const onlineUser = {
      isOnline: false,
      lastOnlineTimestamp:
        userData.updated_at || firestore.FieldValue.serverTimestamp(),
    };

    console.log(doc.id);
    // Add the online user document to the online_users collection
    await onlineUsersCollection.doc(doc.id).set(onlineUser);
  });

  console.log("Online users created successfully");
}

// createOnlineUsers().catch(console.error);

// --- update chats
const productStatus = {
  active: "active",
  hold: "hold",
  pending: "pending",
  review: "under review",
  suspended: "suspended",
  deleted: "deleted",
  given: "given",
};

async function updateChatsCollection() {
  const chatsCollection = db.collection("chats");
  const productsCollection = db.collection("products");

  // Fetch all documents from the chats collection
  const chatsSnapshot = await chatsCollection.get();

  for (const chatDoc of chatsSnapshot.docs) {
    const chatData = chatDoc.data();
    const productId = chatData.product_id;

    console.log(chatDoc.id);
    // Fetch the product document to get the display_image and status
    const productDoc = await productsCollection.doc(productId).get();
    const productData = productDoc.data();
    const productImage = productData ? productData.display_image : "";
    const productStatusValue = productData ? productData.status : "";

    let chatClosed = chatData.enabled;
    if (!chatData.enabled) {
      if (
        productStatusValue === productStatus.hold ||
        productStatusValue === productStatus.pending ||
        productStatusValue === productStatus.review ||
        productStatusValue === productStatus.suspended ||
        productStatusValue === productStatus.deleted ||
        productStatusValue === productStatus.given
      ) {
        chatClosed = false;
      } else if (productStatusValue === productStatus.active) {
        chatClosed = true;
      }
    }

    const data = {
      chat_closed: !chatClosed,
      chat_closed_reason: null,
      check_warnings: false,
      is_active: chatClosed,
      product_image: productImage,
      user_report_evaluations: [],
      warnings: [],
    };
    console.log(data);
    // Update the chat document
    await chatDoc.ref.update(data);
  }

  console.log("Chats collection updated successfully");
}

// updateChatsCollection().catch(console.error);

async function updateChatsAndMessages() {
  const productRequestsCollection = db.collection("product_requests");
  const productsCollection = db.collection("products");
  const usersCollection = db.collection("users");
  const chatsCollection = db.collection("chats");

  // Fetch all documents from the product_requests collection
  const productRequestsSnapshot = await productRequestsCollection.get();

  for (const requestDoc of productRequestsSnapshot.docs) {
    console.log(requestDoc.id);
    const requestData = requestDoc.data();
    const productId = requestData.productId;
    const userId = requestData.userId;

    // Fetch the product document to get details
    const productDoc = await productsCollection.doc(productId).get();
    const productData = productDoc.data();
    const productImage = productData ? productData.display_image : "";
    const productGiver = productData ? productData.posted_by : "";
    const productStatus = productData ? productData.status : "";

    // Fetch the user document to get details
    const userDoc = await usersCollection.doc(userId).get();
    const userData = userDoc.data();
    const senderAvatar = userData ? userData.user_avatar : "";
    const senderName = userData ? userData.name : "";

    // Default values for receiver if not available
    let receiverAvatar = "";
    let receiverName = "";

    // Fetch the receiver's details (assuming receiver ID is stored in product data or request)
    if (productData && productData.receiver_id) {
      const receiverDoc = await usersCollection
        .doc(productData.receiver_id)
        .get();
      const receiverData = receiverDoc.data();
      receiverAvatar = receiverData ? receiverData.user_avatar : "";
      receiverName = receiverData ? receiverData.name : "";
    }

    // Check if a chat node already exists for this product request
    const chatDoc = await chatsCollection
      .where("product_id", "==", productId)
      .limit(1)
      .get();

    let chatRef;
    if (chatDoc.empty) {
      // Create a new chat document if none exists
      chatRef = chatsCollection.doc();
      await chatRef.set({
        product_id: productId,
        chat_closed: false,
        chat_closed_reason: null,
        check_warnings: false,
        date: requestData.timestamp, // Set the chat creation date to the request's timestamp
        enabled: true,
        from: userId,
        is_active: true,
        last_message: requestData.message || "", // Optional: Use the request's message as the last message
        product_giver: productGiver,
        product_image: productImage,
        product_receiver: requestData.userId || "", // Use receiver_id from product data
        receiver_avatar: receiverAvatar,
        receiver_id: requestData.userId || "",
        receiver_name: receiverName,
        requestId: requestDoc.id,
        sender_avatar: senderAvatar,
        sender_id: userId,
        sender_name: senderName,
        status: productStatus,
        time_stamp: requestData.timestamp,
        user_report_evaluations: [],
        warnings: [],
      });
    } else {
      chatRef = chatDoc.docs[0].ref;
    }

    // Check for messages subcollection
    const messagesCollection = chatRef.collection("Messages");
    const messagesSnapshot = await messagesCollection.get();

    if (messagesSnapshot.empty) {
      // Add the first message if none exist
      await messagesCollection.add({
        chatNode: chatRef.id,
        from: userId,
        read: true,
        receiverId: requestData.userId || "",
        senderId: userId,
        text: requestData.message || "User Requested the product",
        timestamp: requestData.timestamp, // Use current timestamp or request's timestamp as needed
      });
    }
  }

  console.log("Chats and messages updated successfully");
}

// updateChatsAndMessages().catch(console.error);

async function updateTimestampForChats(collectionName) {
  const collectionRef = db.collection(collectionName);
  const snapshot = await collectionRef.get();

  const updatePromises = snapshot.docs.map(async (doc) => {
    const data = doc.data();
    if (typeof data.time_stamp === "string") {
      try {
        const newTimestamp = Timestamp.fromDate(new Date(data.time_stamp));
        await doc.ref.update({ time_stamp: newTimestamp });
        console.log("Updated document ID:", doc.id);
      } catch (error) {
        console.error("Error updating document ID:", doc.id, "Error:", error);
      }
    }
  });

  // Execute all update promises concurrently
  await Promise.all(updatePromises);
  console.log("Update complete");
}

// Specify the name of your collection
const collectionName = "chats";

updateTimestampForChats(collectionName)
  .then(() => console.log("All documents updated"))
  .catch((error) => console.error("Error updating documents:", error));
