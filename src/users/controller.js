const formidable = require("formidable-serverless");
const { getStorage, ref, getDownloadURL } = require("firebase-admin/storage");
var validator = require("validator");
const functions = require("firebase-functions");
const firebase = require("firebase-admin");
const firestore = require("firebase-admin/firestore");
const { info } = require("firebase-functions/logger");
const { getMessaging } = require("firebase-admin/messaging");

const { db, bucket } = require("../utils/firebase");
const {
  userStatus,
  userRoles,
  productBroadcastTopic,
} = require("../utils/constants");
const admin = require("firebase-admin");
const { maskEmail, maskPhoneNumber } = require("../utils/utils");
const { v4: uuidv4 } = require("uuid");

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

module.exports = {
  createNewUserv2,
  updateUserv2,
  updateFcmToken,
  userOnboarding,
  newUser,
  getUserProfile,
  uploadAvatar,
  getUserSocialLink,
  updateUser,
  updateUserSocialLink,
  createUserDeletionRequest,
  validateUser,
  cancelUserDeletionRequest,
  updateGeolocation,
  logout,
};
