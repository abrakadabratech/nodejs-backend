const functions = require("firebase-functions");
const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");
const express = require("express");
const Papa = require("papaparse");
const dayjs = require("dayjs");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const { db } = require("../utils/firebase");
const {
  adminAuthJwtKey,
  allUsersBroadcastTopic,
  productStatus,
} = require("../utils/constants");
const { emailService } = require("../utils/email");
const { updateAdminAnalytics } = require("./utils");
const { sendNotification } = require("../utils/utils");

async function userLogin(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).send({ message: "Email and password are required" });
  }

  try {
    const userSnapshot = await db
      .collection("admin-users")
      .where("email", "==", email)
      .limit(1)
      .get();

    if (userSnapshot.empty) {
      return res.status(400).send({ message: "User with email not found!" });
    }

    const user = userSnapshot.docs[0].data();

    // Compare the provided password with the stored hashed password
    const passwordIsValid = await bcrypt.compare(password, user.password);
    if (!passwordIsValid) {
      return res.status(400).send({ message: "Invalid Username or Password!" });
    }

    // If validation is successful, generate a JWT for the user
    const token = jwt.sign(
      { userId: userSnapshot.docs[0].id, email: user.email, name: user.name },
      adminAuthJwtKey,
      { expiresIn: "7d" }
    ); // Expires in 7 days

    res.send({
      token: `Bearer ${token}`,
      user: {
        userId: userSnapshot.docs[0].id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: "Server Error!" });
  }
}

async function getProfile(req, res) {
  return res.send({ user: res.locals });
}

async function getDashboard(req, res) {
  try {
    const docSnapshot = await db.collection("app").doc("analytics").get();
    if (docSnapshot.exists) {
      const documentData = docSnapshot.data();
      return res.send(documentData);
    } else {
      return res.status(404).send({ message: "Document not found" });
    }
  } catch (error) {
    console.log(error);
    return res.status(500).send({ message: "Server Error!" });
  }
}

async function getUsers(req, res) {
  try {
    const { email, phone, name, pageSize = 10, page = 1 } = req.query;

    // Begin a base query
    let usersQuery = db.collection("users");

    // Handle search by fields: email, phone, or name
    if (email)
      usersQuery = usersQuery
        .where("email", ">=", email)
        .where("email", "<=", email + "\uf8ff");
    else if (phone)
      usersQuery = usersQuery
        .where("phone", ">=", phone)
        .where("phone", "<=", phone + "\uf8ff");
    else if (name)
      usersQuery = usersQuery
        .where("name", ">=", name)
        .where("name", "<=", name + "\uf8ff");

    // Count the total number of users matching the search criteria
    const totalUsersCountPromise = usersQuery
      .get()
      .then((snapshot) => snapshot.size);

    // Calculate total pages and offset for pagination
    const totalUsersCount = await totalUsersCountPromise;
    const totalPages = Math.ceil(totalUsersCount / parseInt(pageSize));
    const offset = (parseInt(page) - 1) * parseInt(pageSize);

    // Update the query for pagination
    usersQuery = usersQuery
      .select("name", "email", "phone", "user_avatar", "timestamp")
      .limit(parseInt(pageSize))
      .offset(offset);

    const usersSnapshotPromise = usersQuery.get();
    const userStatsPromises = [];

    const usersSnapshot = await usersSnapshotPromise;
    const usersData = [];

    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();

      // Fetch stats for the user from the 'user_stats' collection
      const userStatsPromise = db
        .collection("user_stats")
        .doc(userDoc.id)
        .get()
        .then((snapshot) => snapshot.data() || {});

      userStatsPromises.push(userStatsPromise);

      usersData.push({
        id: userDoc.id,
        ...userData,
        timestamp: userData.timestamp._seconds,
      });
    }

    const userStatsSnapshots = await Promise.all(userStatsPromises);
    for (let i = 0; i < usersData.length; i++) {
      const userStats = userStatsSnapshots[i];
      usersData[i].stats = {
        given: userStats.given,
        received: userStats.received,
      };
    }

    res.status(200).send({
      currentPage: parseInt(page),
      pageSize: parseInt(pageSize),
      totalPages: totalPages,
      users: usersData,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send({ message: "Internal Server Error" });
  }
}

async function getUserDetail(req, res) {}

async function broadcastAppNotification(req, res) {
  const { title, body } = req.body;

  if (!title || !body) {
    return res.status(400).send({ message: "title, and body are required." });
  }

  const message = {
    notification: {
      title: title,
      body: body,
    },
    topic: allUsersBroadcastTopic,
  };

  // Send a message to devices subscribed to the provided topic.
  admin
    .messaging()
    .send(message)
    .then((response) => {
      // Response is a message ID string.
      res.status(200).send({ message: "Successfully sent message:", response });
    })
    .catch((error) => {
      res.status(500).send({ message: "Error sending message:", error });
    });
}

async function exportUsersCsv(req, res) {
  try {
    let users = [];
    let query = db.collection("users"); // Initialize your query
    let startDate, endDate;

    // Check if date filter is present in request
    if (req.query.startDate && req.query.endDate) {
      startDate = dayjs(req.query.startDate).startOf("day").toDate();
      endDate = dayjs(req.query.endDate).endOf("day").toDate();

      if (dayjs(startDate).add(95, "day").isBefore(endDate)) {
        return res.status(400).send("Date range should not exceed 95 days.");
      }

      query = query
        .where("timestamp", ">=", startDate)
        .where("timestamp", "<=", endDate);
    }

    res.status(200).send({
      message: `Data Export is Queued and will be sent to email ${res.locals.email}`,
    });

    const usersSnapshot = await query.get();

    for (let userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      const userStatsRef = db.collection("user_stats").doc(userDoc.id);
      const userStatsSnap = await userStatsRef.get();
      const userStatsData = userStatsSnap.data();

      users.push({
        uid: userDoc.id,
        name: userData.name,
        email: userData.email,
        phone: userData.phone,
        created_at: dayjs
          .unix(userData.timestamp._seconds)
          .format("DD-MM-YYYY"),
        given: userStatsData ? userStatsData.given : 0,
        received: userStatsData ? userStatsData.received : 0,
      });
    }

    const csv = Papa.unparse(users);

    // Send email with the CSV as an attachment
    let emailText = "Attached is the exported user data in CSV format.";

    emailText += `\n\nExported User Count - ${usersSnapshot.size}`;

    if (startDate && endDate) {
      emailText += `\nFiltered Dates - ${dayjs(startDate).format(
        "DD-MM-YYYY"
      )} - ${dayjs(endDate).format("DD-MM-YYYY")}`;
    }

    await emailService
      .sendMail({
        from: "Abra-Ka-Dabra Admin<admin@abra-ka-dabra.com>",
        to: res.locals.email,
        subject: `User Data Export - ${dayjs().format("DD-MM-YYYY - HH:MM")} `,
        text: emailText,
        attachments: [
          {
            filename: "users_export.csv",
            content: csv,
          },
        ],
      })
      .then((e) => {
        console.log(e);
      });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("Internal Server Error");
  }
}

// products

async function getProducts(req, res) {
  try {
    // Extract query parameters
    const { pageNumber = 1, pageSize = 10, status = "" } = req.query;

    const statuses = status.split(",");
    console.log(status);
    console.log(statuses);
    // Reference to the "products" collection in Firestore
    const productsRef = db.collection("products");

    // Build the query based on is_review and order by "updated_at" in descending order
    const query = productsRef
      .where("status", "in", statuses)
      .orderBy("updated_at", "desc")
      .select("name", "display_image", "timestamp", "status");

    // Paginate results
    const startAfterDoc = await query
      .offset((pageNumber - 1) * Number(pageSize))
      .limit(Number(pageSize))
      .get();

    // Get the total number of items
    const totalItems = (await query.get()).size;

    // Extract the data from the Firestore documents
    const products = startAfterDoc.docs.map((doc) => {
      return { id: doc.id, ...doc.data() };
    });

    // Prepare response
    const response = {
      currentPage: parseInt(pageNumber, 10),
      totalItems,
      pageSize: parseInt(pageSize, 10),
      products,
    };

    res.json(response);
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).send("Internal Server Error");
  }
}

async function getProductDetail(req, res) {
  try {
    const productId = req.params.productId;

    // Retrieve the product by ID
    const productDoc = await db.collection("products").doc(productId).get();

    if (!productDoc.exists) {
      res.status(404).json({ message: "Product not found" });
      return;
    }

    // Get all fields of the product
    const productData = productDoc.data();

    // Check if 'posted_by' field exists in the productData
    if (productData.posted_by) {
      const userId = productData.posted_by;

      // Retrieve user document by user ID
      const userDoc = await db.collection("users").doc(userId).get();

      if (userDoc.exists) {
        const userData = userDoc.data();
        // Extract only the required user fields
        const { name, email, phone } = userData;

        // Add user_data object to the productData response
        productData.user_data = { name, email, phone };
      } else {
        console.error("User not found");
      }
    }

    res.status(200).json({ id: productDoc.id, ...productData });
  } catch (error) {
    console.error("Error fetching product:", error);
    res.status(500).send("Internal Server Error");
  }
}

async function updateProductStatus(req, res) {
  try {
    const productId = req.params.productId;
    const { status } = req.body;
    if (![productStatus.active, productStatus.suspended].includes(status)) {
      res.status(400).json({ message: "Invalid Status Update" });
      return;
    }

    // Retrieve the product by ID
    const productRef = db.collection("products").doc(productId);
    const productDoc = await productRef.get();

    if (!productDoc.exists) {
      res.status(404).json({ message: "Product not found" });
      return;
    }

    // Update the product's status and updated_at timestamp
    const currentData = productDoc.data();
    if (status == productStatus.active) {
      await productRef.update({
        is_review: false,
        is_active: true,
        status: productStatus.active,
      });
    } else if (status == productStatus.suspended) {
      await productRef.update({
        is_review: false,
        is_active: false,
        status: productStatus.suspended,
      });

      // send notification
      sendNotification(
        [currentData.posted_by],
        "Product Suspended",
        `Product ${currentData.title} is suspended due to violation of our policies`,
        {
          module: "listing_detail",
          data: { product_id: productId },
        },
        {
          notification: {
            click_action: "listing_detail",
          },
        }
      );
    }

    res.status(200).json({ message: "Product status updated successfully" });
  } catch (error) {
    console.error("Error updating product status:", error);
    res.status(500).send("Internal Server Error");
  }
}

module.exports = {
  userLogin,
  getProfile,
  getDashboard,

  // users
  getUsers,
  getUserDetail,
  broadcastAppNotification,
  exportUsersCsv,

  // products
  getProducts,
  getProductDetail,
  updateProductStatus,
};
