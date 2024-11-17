const { db } = require("./src/utils/firebase");

async function deleteProductsForUser(userId) {
  const productsRef = db.collection("products");
  try {
    const snapshot = await productsRef.where("posted_by", "==", userId).get();

    if (snapshot.empty) {
      console.log("No matching documents.");
      return;
    }

    // Batch all deletions (note: Firestore batches are limited to 500 operations)
    let batch = db.batch();
    let count = 0;

    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
      count++;
      // Commit batch every 500 deletes and start a new batch
      if (count >= 500) {
        batch.commit(); // Commit the batch
        batch = db.batch(); // Start a new batch
        count = 0;
      }
    });

    // Commit any remaining deletes in the last batch
    if (count > 0) {
      await batch.commit();
    }

    console.log(`Successfully deleted ${snapshot.size} products.`);
  } catch (error) {
    console.error("Error removing documents: ", error);
  }
}

// Call the function with the specific user ID
deleteProductsForUser("tCaMVivo2uMa0qhUvcnRax6kiXi2");

//   rxeS2gnjuPM7AyoTq9H6UPj7E8m2 - 22 products
//   n91Enbiou2XDJ3fFVhYqv4Y8If53 - 12 products
//   tCaMVivo2uMa0qhUvcnRax6kiXi2 - 7 products
