const { db } = require("../src/utils/firebase");
const fs = require("fs");

const userId = "n91Enbiou2XDJ3fFVhYqv4Y8If53";
const productsRef = db.collection("products");

try {
    productsRef
        .where("posted_by", "==", userId)
        .get()
        .then((snapshot) => {
            const products = [];
            snapshot.forEach((doc) => {
                products.push(doc.data());
            });

            const json = JSON.stringify(products);
            fs.writeFileSync("./products.json", json);
            console.log("Products saved to products.json");
        })
        .catch((error) => {
            console.error("Error getting products:", error);
        });
} catch (error) {
    console.error("Error:", error);
}
