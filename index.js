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

