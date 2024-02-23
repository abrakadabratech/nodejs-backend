const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");

const DEV_DB_URL = "gs://abrakadabra-dev-default-rtdb.firebaseio.com";
const TESTING_DB_URL = "gs://abrakadabra-dev-default-rtdb.firebaseio.com";
const PROD_DB_URL = "gs://akd-prod-default-rtdb.firebaseio.com";

const DEV_BUCKET_URL = "gs://abrakadabra-dev.appspot.com";
const TESTING_BUCKET_URL = "gs://akd-testing.appspot.com";
const PROD_BUCKET_URL = "gs://akd-prod.appspot.com";

var devServiceAccount = require("./admin-key-dev.json");
var prodServiceAccount = require("./admin-key-prod.json");

const firebaseApp = admin.initializeApp({
  credential: admin.credential.cert(prodServiceAccount),
  databaseURL: PROD_DB_URL,
  storageBucket: PROD_BUCKET_URL,
});

// const firebaseApp = admin.initializeApp({
//   credential: admin.credential.cert(devServiceAccount),
//   databaseURL: DEV_DB_URL,
//   storageBucket: DEV_BUCKET_URL,
// });

const db = getFirestore();
const bucket = getStorage().bucket();

module.exports = { firebaseApp, db, bucket };
