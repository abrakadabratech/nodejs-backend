const { firestore } = require("firebase-admin");
const { db } = require("../src/utils/firebase");
const fs = require("fs");

const userId = "3pXAEpVfplMlrhHXM3pH2PdQmJa2";
const productsRef = db.collection("products");

// Read the JSON file
const data = fs.readFileSync("./products.json");
const products = JSON.parse(data);

// Loop through each product and add it to the Firestore collection
products.forEach((product) => {
  const data = {
    ...product,
    coordinates: new firestore.GeoPoint(
      product.coordinates._latitude,
      product.coordinates._longitude
    ),
    category: "DvYeXff6KCnJ9oakmipj",
    updated_at: firestore.Timestamp.fromDate(
      new Date(product.timestamp._seconds * 1000)
    ),
    timestamp: firestore.Timestamp.fromDate(
      new Date(product.timestamp._seconds * 1000)
    ),
    is_active: true,
    is_review: false,
    posted_by: "D93SVUQFuifyM549dXPWpYRXv6o1",
    status: "active",
  };

  productsRef
    .add(data)
    .then((docRef) => {
      console.log("Document ID:", docRef.id);
    })
    .catch((error) => {
      console.error("Error adding product:", error);
    });
});
