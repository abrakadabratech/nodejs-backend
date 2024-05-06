const formidable = require("formidable-serverless");
const { getStorage, ref, getDownloadURL } = require("firebase-admin/storage");
var validator = require("validator");
const functions = require("firebase-functions");
const firebase = require("firebase-admin");
const firestore = require("firebase-admin/firestore");
const { info } = require("firebase-functions/logger");
const { getMessaging } = require("firebase-admin/messaging");

const { db, bucket, pubsub } = require("../utils/firebase");
const {
  userStatus,
  userRoles,
  productBroadcastTopic,
  productStatus,
} = require("../utils/constants");
const admin = require("firebase-admin");
const { maskEmail, maskPhoneNumber } = require("../utils/utils");
const { v4: uuidv4 } = require("uuid");
const { nanoid } = require("nanoid");

// v2

async function createNewUserv2(req, res) {
  try {
    const { method, idToken } = req.body;
    // Validate input
    if (method !== "google" && method !== "phone") {
      return res.status(400).send({
        code: 400,
        status: "error",
        message: "Invalid sign-in method. Must be 'google' or 'phone'.",
      });
    }

    if (method === "google" && !idToken) {
      return res.status(400).send({
        code: 400,
        status: "error",
        message: "Google sign-in method requires an ID token.",
      });
    }

    if (method === "phone" && !idToken) {
      return res.status(400).send({
        code: 400,
        status: 0,
        message: "Phone sign-in method requires an ID token.",
      });
    }

    let uid, name, email, phone;
    if (method === "google") {
      // Verify the ID token and decode it for Google sign-in
      const decodedToken = await admin.auth().verifyIdToken(idToken);

      uid = decodedToken.uid;
      name = decodedToken.name;
      email = decodedToken.email;
    } else if (method == "phone") {
      const decodedToken = await admin.auth().verifyIdToken(idToken);

      uid = decodedToken.uid;
      phone = decodedToken.phone_number;
    } else {
      res.status(400).send({
        code: 400,
        status: 0,
        message: "Invalid Login Method!",
      });
    }

    // Check if the user already exists
    const userRef = db.collection("users").doc(uid);
    const doc = await userRef.get();

    if (doc.exists) {
      const deletionRequestDoc = await db
        .collection("user-deletion-requests")
        .doc(uid)
        .get();
      if (
        deletionRequestDoc.exists &&
        deletionRequestDoc.data().status === "pending"
      ) {
        return res.send({
          status: 0,
          code: 200,
          error: true,
          error_code: "USER_DELETION_REQUEST_ACTIVE",
        });
      } else {
        return res.status(201).send({
          code: 201,
          status: 1,
          message: "User Login Success.",
          data: { uid, method },
        });
      }
    } else {
      // Create a new user document in Firestore
      if (method === "google") {
        const userQuery = db.collection("users").where("email", "==", email);

        const existingUser = await userQuery.get();

        if (!existingUser.empty) {
          const data = existingUser.docs[0].data();
          const maskedPhone = maskPhoneNumber(data.phone);
          let error_message = `An account already exists with the email associated with this phone number (${maskedPhone}). Please sign in using your email or use a different phone number for a new account.`;

          return res.status(200).send({
            code: 200,
            status: 1,
            message: error_message,
            alert_message: {
              type: "error",
              message: error_message,
            },
          });
        }
      } else if (method == "phone") {
        const userQuery = db.collection("users").where("phone", "==", phone);

        const existingUser = await userQuery.get();

        if (!existingUser.empty) {
          const data = existingUser.docs[0].data();
          const maskedEmail = maskEmail(data.email);
          let error_message = `An account already exists with the phone number associated with this email(${maskedEmail}). Please sign in using your phone number or use a different email for a new account.`;

          return res.status(200).send({
            code: 200,
            status: 1,
            message: error_message,
            alert_message: {
              type: "error",
              message: error_message,
            },
          });
        }
      } else {
        res.status(400).send({
          code: 400,
          status: 0,
          message: "Invalid Login Method!",
        });
      }
      await userRef.set({
        name: name || null,
        email: email || null,
        phone: phone || null,
        signin_method: method,
        user_avatar: null,
        fcmToken: null,
        location: null,
        status: userStatus.active,
        timestamp: firestore.FieldValue.serverTimestamp(),
        created_at: firestore.FieldValue.serverTimestamp(),
        role: userRoles.user,
        onboarding_status: false,
      });

      await db.collection("user_stats").doc(uid).set({
        given: 0,
        received: 0,
        cost_saving: 0,
        energy_saving: 0,
        rating: 0,
      });

      res.status(201).send({
        code: 201,
        status: 1,
        message: "User created successfully.",
        data: { uid, method },
      });
    }
  } catch (err) {
    handleError(req, res, err);
  }
}

// update user v2

async function updateUserv2(req, res) {
  try {
    const { uid } = res.locals;
    const { name, email, phone, location_lat, location_lng } = req.body;

    // Initialize an object to hold the fields to be updated
    let dataToUpdate = {};

    if (name) dataToUpdate.name = name;

    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!emailRegex.test(email)) {
        return res.status(400).send({
          status: 400,
          status: 0,
          message: "Invalid Phone Number Format",
        });
      }
      dataToUpdate.email = email;
    }
    if (phone) {
      const phoneRegex = /^[+]*[(]{0,1}[0-9]{1,4}[)]{0,1}[-\s\./0-9]*$/;
      if (!phoneRegex.test(phone)) {
        return res.status(400).send({
          status: 400,
          status: 0,
          message: "Invalid Phone Number Format",
        });
      }
      dataToUpdate.phone = phone;
    }
    // Validate and transform location data if present
    if (location_lat !== undefined && location_lng !== undefined) {
      let latitude = parseFloat(location_lat);
      let longitude = parseFloat(location_lng);

      if (isNaN(latitude) || latitude < -90 || latitude > 90) {
        return res.status(400).send({
          status: 0,
          message: "Invalid Latitude Value",
        });
      }
      if (isNaN(longitude) || longitude < -180 || longitude > 180) {
        return res.status(400).send({
          status: 0,
          message: "Invalid Longitude Value",
        });
      }

      // Convert to Firestore GeoPoint
      dataToUpdate.location = new firestore.GeoPoint(latitude, longitude);
    }

    if (Object.keys(dataToUpdate).length === 0) {
      return res.status(400).send({
        status: 0,
        message: "No valid fields provided for update.",
      });
    }

    // Get a reference to the user document in Firestore
    const userRef = db.collection("users").doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).send({
        status: 0,
        message: "User not found.",
      });
    }

    const userData = userDoc.data();
    const validSigninMethods = ["phone", "google"];
    if (!validSigninMethods.includes(userData.signin_method)) {
      return res.status(400).send({
        status: 0,
        message: "Invalid signin method. Must be 'phone' or 'google'.",
      });
    }

    // Update the user document
    await userRef.update({
      ...dataToUpdate,
      updated_at: firestore.FieldValue.serverTimestamp(),
    });

    // Retrieve the updated user document
    const updated = await userRef.get();

    // Send response
    res.status(200).send({
      status: 1,
      message: "User updated successfully.",
      data: {
        ...updated.data(),
      },
    });
  } catch (error) {
    handleError(req, res, error);
  }
}

// onboarding
async function userOnboarding(req, res) {
  try {
    const { uid } = res.locals;
    const { name, phone, email, signin_method } = req.body;

    // Email and phone validation regex patterns
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^[0-9]{10}$/;

    // Basic validation
    if (!uid) {
      return res.status(400).send({ message: "UID is required" });
    }
    if (!name) {
      return res.status(400).send({ message: "Name is mandatory" });
    }

    // Prepare userData object
    const userData = { name };

    if (signin_method === "phone") {
      if (email) {
        if (!emailRegex.test(email)) {
          return res.status(400).send({
            code: 400,
            status: 0,
            message: "Invalid email format",
          });
        }
        userData.email = email;
      }
    } else if (signin_method === "google") {
      if (phone) {
        if (!phoneRegex.test(phone)) {
          return res.status(400).send({
            code: 400,
            status: 0,
            message: "Invalid phone number format",
          });
        }
        userData.phone = phone;
      }
    } else {
      return res.status(400).send({
        code: 400,
        status: 0,
        message: "Invalid sign-in method",
      });
    }

    // Update in Firestore
    await db
      .collection("users")
      .doc(uid)
      .update({
        ...userData,
        onboarding_status: true,
      });

    res.status(200).send({
      code: 200,
      status: 1,
      message: "User details updated successfully",
    });
  } catch (error) {
    console.error("Error updating user details:", error);
    res
      .status(500)
      .send({ code: 500, status: 0, message: "Internal Server Error" });
  }
}

// Example error handling function
function handleError(req, res, error) {
  console.error(error);
  res.status(500).send({
    status: 0,
    message: "An unexpected error occurred.",
  });
}

// update fcm token
async function updateFcmToken(req, res) {
  logFunctionInit(req);

  try {
    const uid = res.locals.uid;

    const { data } = req.body;

    const usersRef = db.collection("users").doc(uid);
    const doc = await usersRef.get();

    if (!doc.exists) {
      return res.status(401).send({ message: "User Not Found!" });
    }

    if (data.fcmToken) {
      await getMessaging().subscribeToTopic(
        [data.fcmToken],
        productBroadcastTopic
      );
    } else {
      return res.status(400).send({
        code: 400,
        status: 0,
        message: "Invalid Request!",
      });
    }

    await usersRef.update({ fcmToken: data.fcmToken });

    res.send({
      code: 200,
      status: 1,
      response_message: "",
    });
  } catch (err) {
    handleError(req, res, err);
  }
}

// v1
async function getUserProfile(req, res) {
  logFunctionInit(req);

  try {
    const uid = res.locals.uid;

    // fetch user from firebase
    const usersRef = db.collection("users").doc(uid);
    const userDoc = await usersRef.get();

    if (!userDoc.exists) {
      res.send({ code: 404, status: 0, response_message: `User Not Found` });
    } else {
      const data = { ...userDoc.data(), uid };

      delete data.fcmToken;
      delete data.timestamp;
      // delete data.status;
      const userStatsRef = db.collection("user_stats").doc(uid);
      const statsDoc = await userStatsRef.get();
      data.user_stats = statsDoc.data();
      res.send({ code: 200, status: 1, data });
    }
  } catch (err) {
    handleError(req, res, err);
  }
}

async function newUser(req, res) {
  logFunctionInit(req);
  try {
    const uid = res.locals.uid;

    const { name, email } = req.body;

    if (!name || !email)
      return res.send({
        code: 400,
        status: 0,
        response_message: "Invalid Request",
      });

    if (!name.length > 3)
      return res.send({
        code: 400,
        status: 0,
        response_message: "Invalid Name",
      });

    if (!validator.isEmail(email))
      return res.send({
        code: 400,
        status: 0,
        response_message: "Invalid Email Address",
      });

    //   add data to user collection adn get updated data
    const usersRef = db.collection("users").doc(uid);
    const userDoc = await usersRef.get();
    if (userDoc.exists) {
      const dataToUpdate = {};
      if (name) dataToUpdate["name"] = name;
      if (email) dataToUpdate["email"] = email;

      usersRef.update({ ...dataToUpdate });
      return res.send({
        code: 201,
        status: 1,
        response_message: "User Updated",
      });
    } else {
      await usersRef.set({
        name,
        email,
        phone: res.locals.phone,
        social_link: null,
        social_link_type: null,
        user_avatar: null,
        fcmToken: null,
        location: null,
        // status: userStatus.not_verified,
        status: userStatus.active,
        timestamp: firestore.FieldValue.serverTimestamp(),
        role: userRoles.user,
      });

      // add user stats
      await db.collection("user_stats").doc(uid).set({
        given: 0,
        received: 0,
        cost_saving: 0,
        energy_saving: 0,
        rating: 0,
      });

      res.send({
        code: 201,
        status: 1,
        response_message: "User Created",
        data: {
          uid,
        },
      });
    }
  } catch (err) {
    console.log(err);
    handleError(req, res, err);
  }
}

async function updateUser(req, res) {
  logFunctionInit(req);

  try {
    const uid = res.locals.uid;

    const { data } = req.body;
    if (data.email) {
      if (!validator.isEmail(data.email))
        return res.json({
          code: 400,
          status: 0,
          response_message: "Invalid email address!",
        });
    }
    if (!data)
      return res.send({
        code: 400,
        status: 0,
        response_message: "Invalid Request",
      });

    //   add data to user collection adn get updated data
    const usersRef = db.collection("users").doc(uid);
    const doc = await usersRef.get();

    if (!doc.exists) {
      return res.status(401).send({ message: "User Not Found!" });
    }

    const userData = doc.data();

    // disable user from modifying phone
    if (userData.hasOwnProperty("phone")) delete userData["phone"];
    if (userData.hasOwnProperty("location")) delete userData["location"];
    if (userData.hasOwnProperty("user_avatar")) delete userData["user_avatar"];
    if (userData.hasOwnProperty("status")) delete userData["status"];
    if (userData.hasOwnProperty("social_link")) delete userData["social_link"];
    if (userData.hasOwnProperty("social_link_type"))
      delete userData["social_link_type"];
    if (userData.hasOwnProperty("role")) delete userData["role"];

    // get object keys from user request data
    const dataKeys = Object.keys(data);

    // check is field exists already in db object,disable user to update/add new items
    if (userData.fcmToken) {
      const response = await getMessaging().subscribeToTopic(
        [userData.fcmToken],
        productBroadcastTopic
      );
      functions.logger.log("Successfully subscribed to topic:", response);
    }
    var validRequest = true;
    dataKeys.forEach((e) => {
      if (!(e in userData)) {
        validRequest = false;
      }
    });
    if (!validRequest)
      return res.send({
        code: 400,
        status: 0,
        response_message: "Invalid Request",
      });

    await usersRef.update(data);
    const userDataUpdated = await usersRef.get();

    res.send({
      code: 200,
      status: 1,
      response_message: "Data Updated",
      data: userDataUpdated.data(),
    });
  } catch (err) {
    handleError(req, res, err);
  }
}

async function getUserPublicProfile(req, res) {
  try {
    const userId = req.params.id; // Assuming the user ID is passed as a URL parameter
    const userRef = db.collection("users").doc(userId);
    const userSnapshot = await userRef.get();

    if (!userSnapshot.exists) {
      return res.status(200).json({
        code: 400,
        status: 0,
        response_message: "User does not exist",
      });
    }

    const userData = userSnapshot.data();
    const userResponse = {
      name: userData.name,
      photo: userData?.user_avatar || null,
      joined_at: userData.timestamp._seconds,
    };

    // Fetching the latest 10 products posted by the user
    const productsRef = db
      .collection("products")
      .where("posted_by", "==", userId)
      .where("status", "in", [
        productStatus.active,
        productStatus.hold,
        productStatus.given,
      ])
      .select("name", "timestamp", "type", "price", "status", "display_image");

    const productsSnapshot = await productsRef.get();

    const productsCount = productsSnapshot.size;

    const recentProducts = [];

    productsSnapshot.forEach((doc) => {
      if (recentProducts.length >= 10) {
        return;
      }
      recentProducts.push({ id: doc.id, ...doc.data() });
    });

    // Constructing the response
    const response = {
      user: userResponse,
      total_products_posted: productsCount,
      recent_products: recentProducts,
      reviews: [],
    };

    return res.json({ code: 200, status: 1, data: response });
  } catch (error) {
    console.error("Error fetching user profile:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// async function uploadAvatar(req, res) {

//   const uid = res.locals.uid;
//   const form = new formidable.IncomingForm({ multiples: true });
//   let uuid = UUID();

//   try {
//     form.parse(req, async (err, fields, files) => {
//       const profileImage = files.image;
//       const filePath = `avatars/${uuid}.${profileImage.name.split(".").pop()}`;

//       // check if image or not
//       if (profileImage.type.split("/")[0] !== "image") {
//         return res.json({
//           code: 400,
//           status: 0,
//           response_message: "file should be image",
//         });
//       }
//       // check if file is less than 2MB
//       if (Math.ceil(profileImage.size / (1024 * 1024)) > 2) {
//         return res.json({
//           code: 400,
//           status: 0,
//           response_message: "Image size should be less than 2MB",
//         });
//       }
//       // url of the uploaded image
//       // let imageUrl;
//       const response = await bucket.upload(profileImage.path, {
//         public: true,
//         destination: filePath,
//         gzip: true,
//       });

//       const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

//       const usersRef = db.collection("users").doc(uid);
//       const dbRes = await usersRef.update({ user_avatar: publicUrl });

//       const updatedUser = await usersRef.get();

//       res.send({
//         code: 200,
//         status: 1,
//         response_message: "Update Success",
//         data: publicUrl,
//       });
//     });
//   } catch (err) {
//     handleError(req, res, err);
//   }
// }

async function uploadAvatar(req, res) {
  logFunctionInit(req);
  const uid = res.locals.uid;
  const usersRef = db.collection("users").doc(uid);

  // If the delete flag is present and true, delete the avatar image
  if (req.query.delete === "true") {
    try {
      // Update Firestore user document to remove avatar image
      await usersRef.update({ user_avatar: null });

      // Respond with a success message
      return res.json({
        code: 200,
        status: 1,
        response_message: "Avatar image deleted successfully",
      });
    } catch (err) {
      // Handle any errors during the deletion
      return handleError(req, res, err);
    }
  }

  // If not deleting, proceed with the upload
  const form = new formidable.IncomingForm();

  try {
    form.parse(req, async (err, fields, files) => {
      if (err) {
        // Handle form parsing errors
        return handleError(req, res, err);
      }

      if (!files.image) {
        return res.json({
          code: 400,
          status: 0,
          response_message: "No image file provided",
        });
      }

      let uuid = uuidv4();

      const profileImage = files.image;
      const imageExtension = profileImage.name.split(".").pop();
      const filePath = `avatars/${uuid}.${imageExtension}`;

      // Check if the file is an image
      if (profileImage.type.split("/")[0] !== "image") {
        return res.json({
          code: 400,
          status: 0,
          response_message: "File should be an image",
        });
      }

      // Check if the file size is less than 2MB
      if (profileImage.size > 2 * 1024 * 1024) {
        return res.json({
          code: 400,
          status: 0,
          response_message: "Image size should be less than 2MB",
        });
      }

      // Upload the image to the bucket
      const response = await bucket.upload(profileImage.path, {
        public: true,
        destination: filePath,
        gzip: true,
      });

      // Construct the public URL for the uploaded image
      const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

      // Update the user document in Firestore
      await usersRef.update({ user_avatar: publicUrl });

      // Respond with a success message and the public URL of the uploaded image
      res.json({
        code: 200,
        status: 1,
        response_message: "Avatar updated successfully",
        data: { user_avatar: publicUrl },
      });
    });
  } catch (err) {
    // Handle other errors
    handleError(req, res, err);
  }
}

async function getUserSocialLink(req, res) {
  logFunctionInit(req);

  try {
    const uid = res.locals.uid;

    const usersRef = db.collection("users").doc(uid);
    const doc = await usersRef.get();
    const data = doc.data();

    res.send({
      code: 200,
      status: 1,
      data: {
        social_link: data.social_link,
        social_link_type: data.social_link_type,
      },
    });
  } catch (err) {
    handleError(req, res, err);
  }
}

async function updateUserSocialLink(req, res) {
  logFunctionInit(req);

  const { social_link, social_link_type } = req.body;

  if (!social_link || !social_link_type)
    return res.send({
      code: 400,
      status: 0,
      response_message: "Invalid social link or type.",
    });

  const urlPattern =
    /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/;

  if (!urlPattern.test(social_link)) {
    return res.json({
      code: 400,
      status: 0,
      response_message: `Invalid ${social_link_type} URL.`,
    });
  }

  try {
    const uid = res.locals.uid;

    // fetch user from firebase
    const usersRef = db.collection("users").doc(uid);

    const user = await usersRef.get();
    const status = user.data().status;
    if (
      status === userStatus.pending ||
      status === userStatus.active ||
      status === userStatus.suspended
    )
      return res.send({
        code: 401,
        status: 0,
        response_message: "Update Not Allowed",
      });

    await usersRef.update({
      social_link,
      social_link_type,
      // status: userStatus.pending,
    });

    res.send({
      code: 200,
      status: 1,
      response_message: "Data Updated",
      data: {
        social_link,
        social_link_type,
      },
    });
  } catch (err) {
    handleError(req, res, err);
  }
}

async function updateGeolocation(req, res) {
  logFunctionInit(req);

  const uid = res.locals.uid;
  try {
    const latitude = parseFloat(req.body.latitude);
    const longitude = parseFloat(req.body.longitude);
    const locationName = req.body.name;
    if (!latitude || !longitude || !locationName) {
      return res.json({
        code: 400,
        status: 0,
        response_message:
          "Missing required fields: latitude and longitude, location name",
      });
    }
    const userRef = db.collection("users").doc(uid);
    await userRef.update({
      location: {
        coordinates: new firebase.firestore.GeoPoint(latitude, longitude),
        name: locationName,
      },
    });
    return res.json({
      code: 200,
      status: 1,
      response_message: "User location updated successfully",
    });
  } catch (err) {
    handleError(req, res, err);
  }
}

async function createUserDeletionRequest(req, res) {
  logFunctionInit(req);

  const userId = res.locals.uid;
  const deletionRequest = {
    requested_at: firestore.FieldValue.serverTimestamp(),
    status: "pending",
  };

  try {
    const uid = res.locals.uid;
    await db
      .collection("user-deletion-requests")
      .doc(userId)
      .set(deletionRequest);

    // Invalidate user's session
    await admin.auth().revokeRefreshTokens(userId);

    res.send({
      success: true,
      message:
        "Your account deletion request is confirmed, and you've been logged out. You have 7 days to reverse this decision. Thank you for your time with us.",
    });
  } catch (err) {
    handleError(req, res, err);
  }
}

async function validateUser(req, res) {
  logFunctionInit(req);

  const userId = res.locals.uid;

  try {
    const deletionRequestDoc = await admin
      .firestore()
      .collection("user-deletion-requests")
      .doc(userId)
      .get();
    if (
      deletionRequestDoc.exists &&
      deletionRequestDoc.data().status === "pending"
    ) {
      return res.send({
        success: false,
        message:
          "To proceed with login, your existing account deletion request will be canceled. Continue to log in and keep your account active.",
      });
    }
    // Proceed with login flow here, assuming authentication was already handled.
    res.send({
      success: true,
      message: "Login successful.",
      token: "new_auth_token",
    });
  } catch (error) {
    handleError(req, res, err);
  }
}

async function cancelUserDeletionRequest(req, res) {
  logFunctionInit(req);

  const userId = res.locals.uid; // Assuming userID is already set in res.locals

  try {
    const deletionRequestRef = admin
      .firestore()
      .collection("user-deletion-requests")
      .doc(userId);
    const deletionRequestDoc = await deletionRequestRef.get();

    if (!deletionRequestDoc.exists) {
      return res.status(404).send({
        success: false,
        message: "No active deletion request found for this account.",
      });
    }

    if (deletionRequestDoc.data().status === "pending") {
      await deletionRequestRef.update({
        status: "cancelled",
      });

      res.send({
        success: true,
        message:
          "Your account deletion request has been cancelled. You can now continue to log in.",
      });
    } else {
      // If the request is found but not in a 'pending' state, inform the user appropriately
      res.send({
        success: false,
        message: "Deletion request is not in a cancellable state.",
      });
    }
  } catch (err) {
    handleError(req, res, err);
  }
}

// chats handing start

async function initiateProductChat(req, res) {
  const productId = req.params.id;
  const { uid } = res.locals;
  const { request_id } = req.body;

  try {
    if (!request_id) {
      return res.status(400).send({
        code: 400,
        status: 0,
        message: "Request Id not found.",
      });
    }

    // Fetch product details to get the giver's UID
    const productRef = db.collection("products").doc(productId);
    const productSnap = await productRef.get();

    if (!productSnap.exists) {
      return res.status(404).json({
        code: 404,
        status: 0,
        message: "Product not found.",
      });
    }

    const productData = productSnap.data();
    const giverId = productData.posted_by;

    // Prevent chat initiation with oneself
    if (giverId === uid) {
      return res.status(400).json({
        code: 400,
        status: 1,
        message: "Chat initiation with oneself is not allowed.",
      });
    }

    // Check if the user is blocked by the giver
    const blockCheckQuery = db
      .collection("user-chat-blocks")
      .where("blocker_id", "==", giverId)
      .where("blocked_id", "==", uid)
      .limit(1);
    const blockCheckSnap = await blockCheckQuery.get();

    if (!blockCheckSnap.empty) {
      return res.status(400).json({
        code: 400,
        status: 1,
        message: "Chat Not Allowed as User is Blocked",
      });
    }

    // Check for existing chat session
    const chatQuery = db
      .collection("chats")
      .where("product_id", "==", productId)
      .where("product_giver", "==", giverId)
      .where("product_receiver", "==", uid)
      .limit(1);
    const chatSnap = await chatQuery.get();

    if (!chatSnap.empty) {
      // Existing chat found, return its ID
      return res.status(200).json({
        code: 200,
        status: 1,
        data: {
          chat_id: chatSnap.docs[0].id,
          message: "Existing chat session returned.",
        },
      });
    }

    // Initialize a new chat document
    const newChatRef = db.collection("chats").doc();
    // Retrieve receiver's user data
    const receiverRef = db.collection("users").doc(uid);
    const receiverSnap = await receiverRef.get();
    const receiverData = receiverSnap.data();

    // Retrieve sender's user data (in this case, the product giver)
    const senderRef = db.collection("users").doc(giverId);
    const senderSnap = await senderRef.get();
    const senderData = senderSnap.data();

    await newChatRef.set({
      date: "",
      from: giverId,
      last_message: "",
      product: productData.name,
      product_giver: giverId,
      product_id: productId,
      product_image: productData.display_image,
      product_receiver: uid,
      receiver_avatar: receiverData.user_avatar,
      receiver_id: uid,
      receiver_name: receiverData.name,
      requestId: request_id,
      sender_avatar: senderData.user_avatar,
      sender_id: giverId,
      sender_name: senderData.name,
      status: "active",
      is_active: true,
      time_stamp: firestore.FieldValue.serverTimestamp(),
      chat_closed: false,
      chat_closed_reason: null,
    });
    // Update the product_chat_meta document
    const chatMetaRef = db.collection("chats-metadata").doc(productId);
    const chatMetaSnap = await chatMetaRef.get();
    if (!chatMetaSnap.exists) {
      // If no meta data exists yet for this product, create it
      await chatMetaRef.set({
        product_id: productId,
        giver_id: giverId,
        chat_count: 1, // This is the first chat for this product
        last_activity: firestore.FieldValue.serverTimestamp(),
      });
    } else {
      // If meta data already exists, increment the counts
      await chatMetaRef.update({
        chat_count: firestore.FieldValue.increment(1),
        last_activity: firestore.FieldValue.serverTimestamp(),
      });
    }

    // Respond with the new chat session ID
    res.status(200).json({
      code: 200,
      status: 1,
      data: {
        chat_id: newChatRef.id,
        message: "Chat Session Started",
      },
    });
  } catch (error) {
    functions.logger.error("Error blocking user:", error); // Log the error
    res.status(500).json({
      code: 500,
      status: 0,
      message: "Internal server error.",
    });
  }
}

async function checkIfUserBlocked(req, res) {
  const { receiver_id } = req.body;
  const { uid } = res.locals; // Assumed to be set by authentication middleware

  try {
    const existingBlockerQuery = db
      .collection("user-chat-blocks")
      .where("blocker_id", "==", uid)
      .where("blocked_id", "==", receiver_id)
      .limit(1);
    const existingBlockerSnapshot = await existingBlockerQuery.get();

    const existingBlockedQuery = db
      .collection("user-chat-blocks")
      .where("blocked_id", "==", uid)
      .where("blocker_id", "==", receiver_id)
      .limit(1);
    const existingBlockedSnapshot = await existingBlockedQuery.get();

    if (!existingBlockedSnapshot.empty) {
      const data = existingBlockedSnapshot.docs[0].data();
      return res.json(createResponse(uid, receiver_id, data.blocker_id, true));
    } else if (!existingBlockerSnapshot.empty) {
      const data = existingBlockerSnapshot.docs[0].data();
      return res.json(createResponse(uid, receiver_id, data.blocker_id, true));
    } else {
      return res.json(createResponse(uid, receiver_id, null, false));
    }
  } catch (error) {
    console.error("Error checking user block status:", error); // Use console.error if functions.logger is not available
    return res.status(500).json({
      code: 500,
      status: 0,
      message: "Internal server error",
    });
  }
}

async function getGiverChatProductList(req, res) {
  const { pageNumber = 1, pageSize = 10 } = req.query;
  const { uid } = res.locals; // The giver's user ID from the authentication middleware
  const numericPageNumber = parseInt(pageNumber, 10);
  const numericPageSize = parseInt(pageSize, 10);

  try {
    // Retrieve paginated chat metadata
    let chatMetadataQuery = db
      .collection("chats-metadata")
      .where("giver_id", "==", uid)
      .orderBy("last_activity", "desc");

    // Apply pagination offset
    if (numericPageNumber > 1) {
      const skipCount = (numericPageNumber - 1) * numericPageSize;
      chatMetadataQuery = chatMetadataQuery.offset(skipCount);
    }

    // Limit the number of results
    chatMetadataQuery = chatMetadataQuery.limit(numericPageSize);
    const metadataSnapshot = await chatMetadataQuery.get();

    // For each chat metadata, retrieve product details and calculate unseen chat count
    const productsWithChatCounts = await Promise.all(
      metadataSnapshot.docs.map(async (metaDoc) => {
        const meta = metaDoc.data();
        const productSnapshot = await db
          .collection("products")
          .doc(meta.product_id)
          .get();
        const product = productSnapshot.data() || {};
        const chatDocsQuery = db
          .collection("chats")
          .where("product_id", "==", meta.product_id);

        const chatDocsSnapshot = await chatDocsQuery.get();
        let unreadMessagesCount = 0;

        // Flatten nested map into a single array of promises
        const messageCountPromises = chatDocsSnapshot.docs.map(async (doc) => {
          const messagesSnapshot = await doc.ref
            .collection("Messages")
            .where("read", "==", false)
            .where("receiverId", "==", uid)
            .get();
          return messagesSnapshot.size; // Return the count of unread messages
        });

        // Wait for all the unread message counts
        const messageCounts = await Promise.all(messageCountPromises);
        unreadMessagesCount = messageCounts.reduce(
          (total, count) => total + count,
          0
        );

        return {
          id: meta.product_id,
          name: product.name || "",
          description: product.description || "",
          product_image: product.display_image || "",
          timestamp: meta.last_activity,
          chat_count: meta.chat_count,
          unseen_chats: unreadMessagesCount,
        };
      })
    );
    // Send the response
    res.status(200).json({
      code: 200,
      status: 1,
      data: {
        pageNumber: numericPageNumber,
        pageSize: numericPageSize,
        products: productsWithChatCounts,
      },
    });
  } catch (error) {
    functions.logger.error("Error blocking user:", error); // Log the error
    res.status(500).json({
      code: 500,
      status: 0,
      message: "Internal server error.",
    });
  }
}

async function getGiverProductChats(req, res) {
  const productId = req.params.id; // Get the product ID from the URL parameter
  const { pageNumber = 1, pageSize = 10 } = req.query;
  const numericPageNumber = parseInt(pageNumber, 10);
  const numericPageSize = parseInt(pageSize, 10);
  const { uid } = res.locals; // Giver UID from authentication middleware

  try {
    // Fetch product details
    const productRef = db.collection("products").doc(productId);
    const productSnapshot = await productRef.get();
    if (!productSnapshot.exists) {
      return res.status(404).json({
        code: 404,
        status: 0,
        message: "Product not found.",
      });
    }
    const productData = productSnapshot.data();

    // Query chats associated with the specific product for the giver
    let query = db
      .collection("chats")
      .where("product_giver", "==", uid)
      .where("product_id", "==", productId)
      .orderBy("time_stamp", "desc")
      .limit(numericPageSize);

    // Handle pagination
    if (numericPageNumber > 1) {
      const skipCount = (numericPageNumber - 1) * numericPageSize;
      query = query.offset(skipCount);
    }

    const chatsSnapshot = await query.get();
    const chatsData = await Promise.all(
      chatsSnapshot.docs.map(async (doc) => {
        const chatData = doc.data();

        // Fetch the messages to count unread messages
        const messagesSnapshot = await doc.ref
          .collection("Messages")
          .where("receiverId", "==", uid)
          .where("read", "==", false)
          .get();

        const unseenMessages = messagesSnapshot.size;

        // Get the receiver's user name from users collection
        const receiverSnapshot = await db
          .collection("users")
          .doc(chatData.product_receiver)
          .get();
        const receiverData = receiverSnapshot.data();

        return {
          chat_id: doc.id,
          user_name: receiverData ? receiverData.name : "Unknown User", // Fallback if user not found
          product_image: productData.display_image, // Use the display_image from product data
          product_name: productData.name,
          last_message: chatData.last_message,
          unseen_messages: unseenMessages,
          is_user_blocked: false,
        };
      })
    );

    res.status(200).json({
      code: 200,
      status: 1,
      data: {
        pageNumber: numericPageNumber,
        pageSize: numericPageSize,
        product: {
          name: productData.name,
          posted_at: productData.timestamp,
          image: productData.display_image,
          description: productData.description,
        },
        chats: chatsData,
      },
    });
  } catch (error) {
    functions.logger.error(error);
    res.status(500).json({
      code: 500,
      status: 0,
      message: "Error retrieving product chat data.",
    });
  }
}

async function getReceiverChatsList(req, res) {
  const { pageNumber = 1, pageSize = 10 } = req.query;
  const numericPageNumber = parseInt(pageNumber, 10);
  const numericPageSize = parseInt(pageSize, 10);
  const { uid } = res.locals; // Receiver UID from authentication middleware

  try {
    let query = db
      .collection("chats")
      .where("product_receiver", "==", uid)
      .orderBy("time_stamp", "desc")
      .limit(numericPageSize);

    // Handle pagination
    if (numericPageNumber > 1) {
      const skipCount = (numericPageNumber - 1) * numericPageSize;
      query = query.offset(skipCount);
    }

    const chatsSnapshot = await query.get();
    const chatsData = await Promise.all(
      chatsSnapshot.docs.map(async (doc) => {
        const chatData = doc.data();

        // Fetch the messages to count unread messages
        const messagesSnapshot = await db
          .collection("chats")
          .doc(doc.id)
          .collection("Messages")
          .where("receiverId", "==", uid)
          .where("read", "==", false)
          .get();

        const unseenMessages = messagesSnapshot.size;

        // Get user name of the product giver from users collection
        const giverSnapshot = await db
          .collection("users")
          .doc(chatData.product_giver)
          .get();
        const giverData = giverSnapshot.data();

        return {
          chat_id: doc.id,
          user_name: giverData ? giverData.name : null,
          product_image: chatData.product_image,
          product_name: chatData.product,
          last_message: chatData.last_message,
          unseen_messages: unseenMessages,
          is_user_blocked: false,
        };
      })
    );

    res.status(200).json({
      code: 200,
      status: 1,
      data: {
        pageNumber: numericPageNumber,
        pageSize: numericPageSize,
        chats: chatsData,
      },
    });
  } catch (error) {
    functions.logger.error(error);
    res.status(500).json({
      code: 500,
      status: 0,
      message: "Error retrieving chat data.",
    });
  }
}

async function blockUserChat(req, res) {
  const { block_user, reason } = req.body;
  const { uid } = res.locals; // Assumed to be set by authentication middleware

  // Validate request body
  if (!block_user) {
    return res.status(400).json({
      code: 400,
      status: 0,
      message: 'Bad request: "block_user" is required.',
    });
  }

  if (block_user === uid) {
    return res.status(400).json({
      code: 400,
      status: 0,
      message: "Bad request: Cannot block oneself.",
    });
  }

  try {
    // Check if the user to be blocked exists
    const userToBlockRef = db.collection("users").doc(block_user);
    const userToBlockSnap = await userToBlockRef.get();
    if (!userToBlockSnap.exists) {
      return res.status(404).json({
        code: 404,
        status: 0,
        message: "User to block doesn't exist.",
      });
    }

    // Check if a block entry already exists
    const existingBlockQuery = db
      .collection("user-chat-blocks")
      .where("blocker_id", "==", uid)
      .where("blocked_id", "==", block_user)
      .limit(1);
    const existingBlockSnapshot = await existingBlockQuery.get();

    if (!existingBlockSnapshot.empty) {
      return res.status(409).json({
        code: 409,
        status: 0,
        message: "Block entry already exists.",
      });
    }

    // Create a new block entry
    const blockRef = db.collection("user-chat-blocks").doc();
    await blockRef.set({
      blocker_id: uid,
      blocked_id: block_user,
      created_at: firestore.FieldValue.serverTimestamp(),
      reason,
    });

    // Respond with success message
    res.status(200).json({
      code: 200,
      status: 1,
      message: "User blocked successfully.",
    });
  } catch (error) {
    functions.logger.error("Error blocking user:", error); // Log the error
    res.status(500).json({
      code: 500,
      status: 0,
      message: "Internal server error when trying to block user.",
    });
  }
}

async function reportUserChat(req, res) {
  const chat_id = req.params.chat_id;
  const reason = req.body.reason;
  const { uid } = res.locals;

  // Validate request body
  if (!chat_id || !reason) {
    return res.status(400).json({
      code: 400,
      status: 0,
      message: "Invalid Request Parameters",
    });
  }

  try {
    // Check if the chat exists and the user is a participant
    const chatRef = db.collection("chats").doc(chat_id);
    const chatSnap = await chatRef.get();

    if (!chatSnap.exists) {
      return res.status(404).json({
        code: 404,
        status: 0,
        message:
          "Chat not found: The chat you are trying to report does not exist.",
      });
    }

    const chatData = chatSnap.data();
    if (chatData.sender_id !== uid && chatData.receiver_id !== uid) {
      return res.status(403).json({
        code: 403,
        status: 0,
        message: "Forbidden: You are not a participant of this chat.",
      });
    }

    //     report_submissions: Array of report submission objects. Each submission object contains:
    // submission_id: Unique identifier for the report submission.
    // submitted_by: Identifier of the user who submitted the report.
    // reason: Reason for the report (e.g., "Spam", "Harassment").
    // submitted_at: Timestamp of when the report was submitted.

    const newReportSubmission = {
      submission_id: nanoid(6),
      submitted_by: uid,
      reason: reason,
      submitted_at: admin.firestore.FieldValue.serverTimestamp(), // Sets the timestamp to the current server time
    };

    await chatRef.update({
      report_submissions: firestore.FieldValue.arrayUnion(newReportSubmission),
    });

    setTimeout(async () => {
      const evaluation_report = {
        submission_id: newReportSubmission.submission_id,
        messages: [],
        evaluation_result: "Safe",
        evaluation_details: "Details of the evaluation",
        evaluated_at: firestore.FieldValue.serverTimestamp(),
      };
      await chatRef.update({
        user_report_evaluations:
          firestore.FieldValue.arrayUnion(evaluation_report),
      });
    }, 500);

    // implement queue
    // const queueMessage = JSON.stringify({
    //   chat_id,
    //   report_id: newReportSubmission.submission_id,
    // });

    // await pubsub
    //   .topic("chat_report_evaluate")
    //   .publish(Buffer.from(queueMessage));

    return res.status(200).json({
      code: 200,
      status: 1,
      message: "chat report success.",
    });
  } catch (error) {
    functions.logger.error("Error reporting chat:", error);
    res.status(500).json({
      code: 500,
      status: 0,
      message: "Internal server error.",
    });
  }
}

async function closeUserChat(req, res) {
  const chatId = req.params.chat_id;
  const { uid } = res.locals; // UID from authentication middleware

  try {
    const chatRef = db.collection("chats").doc(chatId);
    const chatSnap = await chatRef.get();

    if (!chatSnap.exists) {
      return res.status(404).json({
        code: 404,
        status: 0,
        message: "Chat not found.",
      });
    }

    const chatData = chatSnap.data();
    if (chatData.product_giver !== uid && chatData.product_receiver !== uid) {
      return res.status(403).json({
        code: 403,
        status: 0,
        message: "Unauthorized: Only participants of the chat can close it.",
      });
    }

    let userName = "";

    if (chatData.product_giver === uid) {
      userName = chatData.sender_name;
    } else if (chatData.product_receiver === uid) {
      userName = chatData.receiver_name;
    }

    // Update the chat to indicate it's closed
    await chatRef.update({
      chat_closed: true,
      enabled: false,
      chat_closed_reason: `Chat Closed by ${userName}`,
      closed_by: uid,
      closed_at: firestore.FieldValue.serverTimestamp(),
    });

    res.status(200).json({
      code: 200,
      status: 1,
      message: "Chat closed successfully.",
    });
  } catch (error) {
    functions.logger.error("Error closing chat:", error);
    res.status(500).json({
      code: 500,
      status: 0,
      message: "Internal server error.",
    });
  }
}

async function getMyBlockedList(req, res) {
  const { pageNumber = 1, pageSize = 10 } = req.query;
  const numericPageNumber = parseInt(pageNumber, 10);
  const numericPageSize = parseInt(pageSize, 10);
  const { uid } = res.locals; // Current user's UID from authentication middleware

  // Validate the pagination parameters
  if (isNaN(numericPageNumber) || numericPageNumber < 1) {
    return res.status(400).json({
      code: 400,
      status: 0,
      message: "Invalid page number. Page number must be a positive integer.",
    });
  }

  if (isNaN(numericPageSize) || numericPageSize < 1 || numericPageSize > 100) {
    // Assume a max page size of 100
    return res.status(400).json({
      code: 400,
      status: 0,
      message:
        "Invalid page size. Page size must be a positive integer and less than or equal to 100.",
    });
  }

  try {
    let query = db
      .collection("user-chat-blocks")
      .where("blocker_id", "==", uid)
      .orderBy("created_at", "desc");

    // Pagination
    if (numericPageNumber > 1) {
      const skipCount = (numericPageNumber - 1) * numericPageSize;
      const lastVisibleSnapshot = await query.limit(skipCount).get();
      const lastVisible =
        lastVisibleSnapshot.docs[lastVisibleSnapshot.docs.length - 1];
      query = query.startAfter(lastVisible);
    }

    const blockedUsersSnapshot = await query.limit(numericPageSize).get();

    // Map through the documents to create the response data
    const blockedUsers = await Promise.all(
      blockedUsersSnapshot.docs.map(async (doc) => {
        const blockData = doc.data();
        const blockedUserRef = db.collection("users").doc(blockData.blocked_id);
        const blockedUserSnapshot = await blockedUserRef.get();
        const blockedUserData = blockedUserSnapshot.data();

        return {
          uid: blockData.blocked_id,
          name: blockedUserData ? blockedUserData.name : null,
          user_avatar: blockedUserData ? blockedUserData.avatar : null,
          timestamp: blockData.created_at,
        };
      })
    );

    res.status(200).json({
      code: 200,
      status: 1,
      data: {
        pageNumber: numericPageNumber,
        pageSize: numericPageSize,
        blockedUsers: blockedUsers,
      },
    });
  } catch (error) {
    functions.logger.error("Error retrieving blocked users:", error);
    res.status(500).json({
      code: 500,
      status: 0,
      message: "Internal server error when trying to retrieve blocked users.",
    });
  }
}

async function unBlockUserChat(req, res) {
  const { user_id } = req.body;
  const { uid } = res.locals; // UID from the authenticated user

  // Validate request body
  if (!user_id) {
    return res.status(400).json({
      code: 400,
      status: 0,
      message: 'Bad request: "user_id" is required.',
    });
  }

  try {
    // Check if the user to be unblocked exists
    const userToUnblockRef = db.collection("users").doc(user_id);
    const userToUnblockSnap = await userToUnblockRef.get();

    if (!userToUnblockSnap.exists) {
      return res.status(404).json({
        code: 404,
        status: 0,
        message: "User to unblock doesn't exist.",
      });
    }

    // Check if there's a previous block entry to remove
    const blocksQuery = db
      .collection("user-chat-blocks")
      .where("blocker_id", "==", uid)
      .where("blocked_id", "==", user_id);
    const blocksSnapshot = await blocksQuery.get();

    if (blocksSnapshot.empty) {
      return res.status(400).json({
        code: 400,
        status: 0,
        message: "No previous block found for the user.",
      });
    }

    // Firestore doesn't have a batch delete, so you must delete each document individually
    blocksSnapshot.forEach(async (blockDoc) => {
      await db.collection("user-chat-blocks").doc(blockDoc.id).delete();
    });

    // Respond with success message
    res.status(200).json({
      code: 200,
      status: 1,
      message: "User unblocked successfully.",
    });
  } catch (error) {
    functions.logger.error("Error unblocking user:", error); // Log the error
    res.status(500).json({
      code: 500,
      status: 0,
      message: "Internal server error when trying to unblock user.",
    });
  }
}

// chats handling end

// user logout function
async function logout(req, res) {
  logFunctionInit(req);

  try {
    const userRef = db.collection("users").doc(res.locals.uid);

    await userRef.update({ fcmToken: null });
    res.json({ code: 200, status: 1, response_message: "Logout Success." });
  } catch (err) {
    handleError(req, res, err);
  }
}

function handleError(req, res, err) {
  console.log(err);
  functions.logger.error({
    message: err?.message || "Error",
    uid: res?.locals?.uid || "UID",
  });

  return res.send({
    code: 500,
    status: 0,
    response_message: "Internal Server Error",
  });
}

function logFunctionInit(req) {
  if (req.headers.logging)
    info(`Requested ${req.path}`, { query_params: req.query, body: req.body });
}

function createResponse(sender_id, receiver_id, blocker_id, is_blocked) {
  const response = {
    code: 200,
    status: 1,
    data: {
      sender_id: sender_id,
      receiver_id: receiver_id,
      is_blocked: is_blocked,
    },
  };

  if (is_blocked) {
    response.data.blocked_by = blocker_id;
  }

  return response;
}

module.exports = {
  createNewUserv2,
  updateUserv2,
  updateFcmToken,
  userOnboarding,
  newUser,
  getUserProfile,
  getUserPublicProfile,
  uploadAvatar,
  getUserSocialLink,
  updateUser,
  updateUserSocialLink,
  createUserDeletionRequest,
  validateUser,
  cancelUserDeletionRequest,
  updateGeolocation,
  checkIfUserBlocked,
  // chats handling
  initiateProductChat,
  reportUserChat,
  closeUserChat,
  getGiverChatProductList,
  getGiverProductChats,
  getReceiverChatsList,
  blockUserChat,
  getMyBlockedList,
  unBlockUserChat,

  logout,
};
