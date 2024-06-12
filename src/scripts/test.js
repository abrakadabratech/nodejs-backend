const { db } = require("../utils/firebase");

// console.log(db)

db.collection("products").get().then((snapshot) => {
    snapshot.forEach((doc) => {
        db.collection("products").doc(doc.id).update({
            type: "free",
            currency:"INR"
        });
    });
}).catch((error) => {
    console.error("Error updating products:", error);
});
