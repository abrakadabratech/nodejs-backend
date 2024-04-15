const { app, logger } = require("firebase-functions/v1");
const Joi = require("joi");
const { firestore } = require("firebase-admin");
const crypto = require('crypto');
const axios = require('axios');

const { db, bucket } = require("../utils/firebase");
const { PAYMENT_REQUEST } = require("../utils/phonepe/constants");
const { Console } = require("console");

async function getAppSupportData(req, res) {
  try {
    const appRef = await db.collection("app").doc("support").get();

    res.json({
      code: 200,
      status: 1,
      data: appRef.data(),
    });
  } catch (err) {
    handleError(err, res);
  }
}

async function addPaymentLog(req, res) {
  const paymentSchema = Joi.object({
    payeeName: Joi.string().required(),
    transactionNote: Joi.string().allow("", null),
    amount: Joi.string().pattern(/^\d+$/).required(),
    status: Joi.string().valid("success", "failed").required(),
    transactionId: Joi.string().required(),
  });

  try {
    // Validate the body against the Joi schema
    const { error, value } = paymentSchema.validate(req.body);

    if (error) {
      return res.status(400).send({ message: error.details[0].message });
    }

    await db.collection("user_payments").add({
      ...value,
      created_at: firestore.FieldValue.serverTimestamp(),
      created_by: res.locals.uid,
    });
    let response;
    if (value.status === "success")
      response = {
        status: "success",
        message: "Payment Added Successfully",
        userMessage: generateThankingMessage(value.amount),
      };

    if (value.status === "failed")
      response = {
        status: "success",
        message: "Status Recorded Success",
        userMessage: "Payment failed. Please try again.",
      };

    res.status(201).send(response);
  } catch (err) {
    handleError(err, res);
  }
}

async function getAppBanners(req, res) {
  try {
    const collectionName = "app-banners"; // Replace with your collection name
    const snapshot = await db.collection(collectionName).get();

    let documents = [];

    snapshot.forEach((doc) => {
      documents.push({ id: doc.id, ...doc.data() });
    });

    res.status(200).send({
      code: 200,
      status: 1,
      data: [...documents],
    });
  } catch (error) {
    console.error("Error getting documents: ", error);
    res.status(500).send(error);
  }
}

const schemas = {
  product: Joi.object({
    source: Joi.string().valid("product").required(),
    product_id: Joi.string().required(),
    type: Joi.string().required(),
    message: Joi.string().required(),
  }),
  chat: Joi.object({
    source: Joi.string().valid("chat").required(),
    chat_node: Joi.string().required(),
    type: Joi.string().required(),
    message: Joi.string().required(),
  }),
};
async function createReport(req, res) {
  const { source } = req.body;
  let schema = source === "product" ? schemas.product : schemas.chat;

  const { error, value } = schema.validate(req.body);

  if (error) {
    res
      .status(400)
      .send({ code: 400, status: 0, message: error.details[0].message });
    return;
  }

  // Assuming we're sending the validated data back as a response
  // In a real-world scenario, you would likely process the data further,
  // for example, saving it to a database.
  res.status(200).send({
    code: 200,
    status: 1,
    response_message:
      "Your report has been successfully submitted. Thank you for your feedback!",
  });
}

async function getUserNotifications(req, res) {
  const { uid } = res.locals;
  const { page = 1 } = req.query;

  const pageSize = 20;
  try {
    const querySnapshot = await db
      .collection("notifications")
      .where("userId", "==", uid)
      .orderBy("timestamp", "desc")
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .get();

    const notifications = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      notifications.push({
        id: doc.id,
        timestamp: data.timestamp._seconds,
        ...data,
      });
    });

    const totalNotifications = await db
      .collection("notifications")
      .where("userId", "==", uid)
      .get();

    const totalPages = Math.ceil(totalNotifications.size / pageSize);

    res.status(200).json({
      code: 200,
      status: 1,
      currentPage: parseInt(page),
      pageSize: parseInt(pageSize),
      totalPages,
      notifications,
    });
  } catch (error) {
    handleError(res, error);
  }
}

async function markNotificationRead(req, res) {
  try {
    const userId = res.locals.uid; // assuming userId is sent in the request body
    const notificationIds = req.body.notifications; // array of notification document IDs
    const markAll = req.body.all || false; // boolean to mark all notifications

    // Validate notificationIds length
    if (
      notificationIds &&
      (notificationIds.length < 1 || notificationIds.length > 100)
    ) {
      return res
        .status(400)
        .send(
          "Invalid notificationIds length. It should have a minimum of 1 item and a maximum of 100 items."
        );
    }

    if (markAll) {
      // If markAll is true, update all notifications where userId matches and deleted is false
      const notificationsRef = db
        .collection("notifications")
        .where("userId", "==", userId)
        .where("deleted", "==", false);
      const snapshot = await notificationsRef.get();

      if (snapshot.empty) {
        return res.status(404).send({
          code: 400,
          status: 0,
          message: "No matching notifications found.",
        });
      }

      // Batch update to set deleted to true
      const batch = db.batch();
      snapshot.forEach((doc) => {
        batch.update(doc.ref, { deleted: true });
      });
      await batch.commit();
    } else if (notificationIds && notificationIds.length > 0) {
      // If specific notificationIds are provided, update each one
      const batch = db.batch();
      notificationIds.forEach((notificationId) => {
        const notificationRef = db
          .collection("notifications")
          .doc(notificationId);
        batch.update(notificationRef, { deleted: true });
      });
      await batch.commit();
    } else {
      return res
        .status(400)
        .send("No notification IDs provided and markAll is not true.");
    }

    res.status(200).send({
      code: 200,
      status: 1,
      message: "Notifications updated successfully.",
    });
  } catch (error) {
    console.error("Error updating notifications: ", error);
    res.status(500).send("Internal Server Error");
  }
}

async function deleteNotifications(req, res) {
  try {
    const userId = res.locals.uid;
    const notificationIds = req.body.notifications;
    const deleteAll = req.body.all || false;

    if (deleteAll) {
      // If deleteAll is true, delete all notifications where userId matches
      const notificationsRef = db
        .collection("notifications")
        .where("userId", "==", userId);
      const snapshot = await notificationsRef.get();

      if (snapshot.empty) {
        return res.status(404).send("No matching notifications found.");
      }

      // Batch delete
      const batch = db.batch();
      snapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();
    } else if (notificationIds && notificationIds.length > 0) {
      // If specific notificationIds are provided, delete each one
      const batch = db.batch();
      notificationIds.forEach((notificationId) => {
        const notificationRef = db
          .collection("notifications")
          .doc(notificationId);
        batch.delete(notificationRef);
      });
      await batch.commit();
    } else {
      return res
        .status(400)
        .send("No notification IDs provided and deleteAll is not true.");
    }

    res.status(200).send({
      code: 200,
      status: 1,
      message: "Notifications deleted successfully.",
    });
  } catch (error) {
    console.error("Error deleting notifications: ", error);
    res.status(500).send("Internal Server Error");
  }
}

// phonepe pg integration
async function initPayment(req, res) {
  try {
    const user_id = res.locals.uid;
    const merchantTransactionId = 'M' + Date.now();
    const { amount } = req.body;

    if (!amount || amount < 0) {
      return res.status(400).send({ code: 400, status: 0, message: "Invalid Amount" })
    }

    const hostUrl = req.headers.host;
    const data = {
      merchantId: process.env.PHONEPE_MERCHANT_ID,
      merchantTransactionId: merchantTransactionId,
      merchantUserId: 'MUID' + user_id,
      amount: amount * 100,
      redirectUrl: `http://${hostUrl}/app/payment/status/${merchantTransactionId}/${user_id}`,
      redirectMode: 'POST',
      paymentInstrument: {
        type: 'PAY_PAGE'
      }
    };
    const payload = JSON.stringify(data);
    const payloadMain = Buffer.from(payload).toString('base64');
    const keyIndex = 1;
    const string = payloadMain + '/pg/v1/pay' + process.env.PHONEPE_SALT_KEY;
    const sha256 = crypto.createHash('sha256').update(string).digest('hex');
    const checksum = sha256 + '###' + keyIndex;
    // const prod_URL = "https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/pay"
    const prod_URL = "https://api.phonepe.com/apis/hermes/pg/v1/pay"
    const options = {
      method: 'POST',
      url: prod_URL,
      headers: {
        accept: 'application/json',
        'Content-Type': 'application/json',
        'X-VERIFY': checksum
      },
      data: {
        request: payloadMain
      }
    };
    axios.request(options).then(function (response) {
      // return res.redirect(response.data.data.instrumentResponse.redirectInfo.url)
      return res.status(200).send({ status: 1, code: 200, data: { url: response.data.data.instrumentResponse.redirectInfo.url } })
    })
      .catch(function (error) {
        console.error(error);
      });
  } catch (error) {
    res.status(500).send({
      message: error.message,
      success: false
    })
  }
}

async function checkPaymentStatus(req, res) {
  try {
    const merchantTransactionId = req.params.txnId;
    const uid = req.params.userId;
    const merchantUserId = process.env.PHONEPE_MERCHANT_ID;  // Update with your merchant ID
    const key = process.env.PHONEPE_SALT_KEY;  // Update with your API key
    const keyIndex = 1;

    const string = `/pg/v1/status/${merchantUserId}/${merchantTransactionId}` + key;
    const sha256 = crypto.createHash('sha256').update(string).digest('hex');
    const checksum = sha256 + "###" + keyIndex;

    const URL = `https://api.phonepe.com/apis/hermes/pg/v1/status/${merchantUserId}/${merchantTransactionId}`;

    const options = {
      method: 'GET',
      url: URL,
      headers: {
        accept: 'application/json',
        'Content-Type': 'application/json',
        'X-VERIFY': checksum,
        'X-MERCHANT-ID': merchantUserId,
      }
    };

    try {
      const response = await axios.request(options);

      if (response.data.data.responseCode === 'SUCCESS') {
        const data = response.data.data

        await db.collection("user-payments").add({ user_id: uid, timestamp: firestore.FieldValue.serverTimestamp(), merchant_trans_id: data.merchantTransactionId, trans_id: data.transactionId, amount: data.amount / 100, pg_gateway: "PHONEPE_PG" })

        res.status(200).json({ code: 200, status: 1, message: "Payment Success" });
      } else {
        res.status(400).json({ code: 400, status: 0, message: "Payment Failed" });

      }
    } catch (error) {
      res.status(400).json({ code: 400, status: 0, message: "Internal Server Error" });
    }
  } catch (error) {
    res.status(500).json({ code: 500, status: 0, message: "Internal Server Error" });
  }
}



// utils
function generateThankingMessage(amount) {
  if (amount <= 5) {
    return "Every bit counts! Thanks for your contribution!";
  } else if (amount <= 20) {
    return "Your generosity makes a difference. Thank you!";
  } else {
    return "Wow! Your immense generosity overwhelms us. A heartfelt thank you from the entire Abra Ka Dabra team!";
  }
}

function handleError(res, err) {
  logger.error(err);

  return res.json({
    code: 500,
    status: 0,
    response_message: "Internal Server Error",
  });
}

module.exports = {
  getAppSupportData,
  addPaymentLog,
  getAppBanners,
  createReport,
  getUserNotifications,
  markNotificationRead,
  deleteNotifications,

  initPayment,
  checkPaymentStatus
};
