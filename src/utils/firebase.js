const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");

// Environment URLs
const DEV_DB_URL = "gs://abrakadabra-dev-default-rtdb.firebaseio.com";
const TESTING_DB_URL = "gs://abrakadabra-dev-default-rtdb.firebaseio.com"; // Seems duplicated with DEV_DB_URL
const PROD_DB_URL = "gs://akd-prod-default-rtdb.firebaseio.com";

const DEV_BUCKET_URL = "gs://abrakadabra-dev.appspot.com";
const TESTING_BUCKET_URL = "gs://akd-testing.appspot.com"; // Might be unused if TESTING_DB_URL is the same as DEV_DB_URL
const PROD_BUCKET_URL = "gs://akd-prod.appspot.com";

// Service Account Keys
var devServiceAccount = require("./admin-key-dev.json");
var prodServiceAccount = require("./admin-key-prod.json");

// Firebase App Initialization based on NODE_ENV
let firebaseConfig = {};
if (process.env.NODE_ENV === "production") {
    firebaseConfig = {
        credential: admin.credential.cert(prodServiceAccount),
        databaseURL: PROD_DB_URL,
        storageBucket: PROD_BUCKET_URL
    };
} else {
    // Assuming any non-production environment as development/staging
    firebaseConfig = {
        credential: admin.credential.cert(devServiceAccount),
        databaseURL: DEV_DB_URL,
        storageBucket: DEV_BUCKET_URL
    };
}

// Initialize Firebase App
const firebaseApp = admin.initializeApp(firebaseConfig);

// Firestore and Storage instances
const db = getFirestore();
const bucket = getStorage().bucket();

module.exports = { firebaseApp, db, bucket };
