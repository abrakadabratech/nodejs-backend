const { db } = require("../utils/firebase");

// Reference to the Firestore collections
const productsCollectionRef = db.collection("products");
const userStatsCollectionRef = db.collection("user_stats");
const usersCollectionRef = db.collection("users");

// Function to delete documents in products collection based on posted_by value
const deleteProducts = (userId) => {
  productsCollectionRef
    .where("posted_by", "==", userId)
    .get()
    .then((querySnapshot) => {
      // Delete each document that matches the posted_by value
      querySnapshot.forEach((doc) => {
        productsCollectionRef
          .doc(doc.id)
          .delete()
          .then(() => {
            console.log(
              `Document with ID ${doc.id} deleted from products collection.`
            );
          })
          .catch((error) => {
            console.error(
              `Error deleting document with ID ${doc.id} from products collection: `,
              error
            );
          });
      });
    })
    .catch((error) => {
      console.error(
        "Error getting documents from products collection: ",
        error
      );
    });
};

// Function to delete document in user_stats collection based on document ID
const deleteUserStats = (userId) => {
  userStatsCollectionRef
    .doc(userId)
    .delete()
    .then(() => {
      console.log(
        `Document with ID ${userId} deleted from user_stats collection.`
      );
    })
    .catch((error) => {
      console.error(
        `Error deleting document with ID ${userId} from user_stats collection: `,
        error
      );
    });
};

// Function to delete document in users collection based on document ID
const deleteUsers = (userId) => {
  usersCollectionRef
    .doc(userId)
    .delete()
    .then(() => {
      console.log(`Document with ID ${userId} deleted from users collection.`);
    })
    .catch((error) => {
      console.error(
        `Error deleting document with ID ${userId} from users collection: `,
        error
      );
    });
};

// Call the functions with the desired user ID
const userId = "MYemCNy8AEMT4nj4QrKE3THyiwO2"; // Replace with the actual user ID
deleteProducts(userId);
deleteUserStats(userId);
deleteUsers(userId);
