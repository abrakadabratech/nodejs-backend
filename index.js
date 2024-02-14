require("dotenv").config();

const functions = require("firebase-functions");
const express = require("express");
const { getMessaging } = require("firebase-admin/messaging");

const cors = require("cors");

require("./src/utils/firebase.js");

const { authRoutesConfig } = require("./src/users/routes-config");
const { productsRoutesConfig } = require("./src/products/routes-config");
const { appRoutesConfig } = require("./src/app/routes-config.js");
const { adminRoutesConfig } = require("./src/admin/routes-config.js");

const {
  productBroadcastTopic,
  productStatus,
} = require("./src/utils/constants.js");
const { validateProduct } = require("./src/utils/openai/functions.js");
const { sendNotification } = require("./src/utils/utils.js");
const { updateAdminAnalytics } = require("./src/admin/utils.js");

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb", extended: true }));
app.use(express.urlencoded({ extended: false, limit: "50mb" }));

const adminApp = express();
adminApp.use(cors());
adminApp.use(express.json({ limit: "50mb", extended: true }));
adminApp.use(express.urlencoded({ extended: false, limit: "50mb" }));

authRoutesConfig(app);
productsRoutesConfig(app);
appRoutesConfig(app);
adminRoutesConfig(adminApp);

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}...`);
});

// exports.api = functions.region("asia-south1").https.onRequest(app);
// exports.adminApi = functions
//   .region("asia-south1")
//   .runWith({ timeoutSeconds: 540 })
//   .https.onRequest(adminApp);


// exports.newProductValidation = functions.firestore
//   .document("products/{productId}")
//   .onCreate(async (snap, context) => {
//     // Product data
//     const docId = context.params.productId;
//     const newValue = snap.data();
//     const title = newValue.name;
//     const description = newValue.description;

//     const posted_by = newValue.posted_by;

//     try {
//       const res = await validateProduct({ title, description });

//       // Determine the product status based on the match_score
//       let status;
//       if (res.match_score < 40) {
//         await snap.ref.update({
//           status: productStatus.suspended,
//           is_active: false,
//           product_validation: res,
//         });

//         sendNotification(
//           [posted_by],
//           "Product Suspended",
//           `Product ${title} is suspended due to violation of our policies`,
//           {
//             module: "listing_detail",
//             data: { product_id: docId },
//           },
//           {
//             notification: {
//               click_action: "listing_detail",
//             },
//           }
//         );
//       } else if (res.match_score >= 40 && res.match_score <= 80) {
//         await snap.ref.update({
//           status: productStatus.review,
//           is_active: false,
//           is_review: true,
//           product_validation: res,
//         });

//         sendNotification(
//           [posted_by],
//           "Product Under Review",
//           `Product ${title} is under review because it may violate our policies`,
//           {
//             module: "listing_detail",
//             data: { product_id: docId },
//           },
//           {
//             notification: {
//               click_action: "listing_detail",
//             },
//           }
//         );
//       } else if (res.match_score > 80) {
//         await snap.ref.update({
//           status: productStatus.active,
//           is_active: true,
//           product_validation: res,
//         });

//         // send broadcast notification for product

//         const message = {
//           data: {
//             title: `New product uploaded`,
//             body: "A new product is uploaded on Abra Ka Dabra. Be the first one to grab it.",
//             module: "product_detail",
//             data: JSON.stringify({ product_id: docId, user_id: posted_by }),
//           },
//           android: {},
//           topic: productBroadcastTopic,
//         };

//         getMessaging()
//           .send(message)
//           .then((response) => {
//             console.log("Successfully sent broadcast notification:", response);
//           });
//       }

//       return console.log("Product status updated:", status);
//     } catch (error) {
//       console.error("Error processing product:", error);
//     }
//   });

// // update analytics data
// exports.adminAnalyticsRefresh = functions.pubsub
//   .schedule("0 */12 * * *")
//   .onRun(async (context) => {
//     await updateAdminAnalytics();
//     return null;
//   });
