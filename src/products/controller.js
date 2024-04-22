const formidable = require("formidable-serverless");
const geolib = require("geolib");
const firestore = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const functions = require("firebase-functions");
const firebase = require("firebase-admin");
const moment = require("moment");
const Razorpay = require("razorpay");

const { v4 } = require("uuid");
const { info } = require("firebase-functions/logger");

const { db, bucket } = require("../utils/firebase");
const { sendNotification, calculateUserRating } = require("../utils/utils");
const {
  productStatus,
  requestStatus,
  userStatus,
  feedbackType,
  productBroadcastTopic,
} = require("../utils/constants");
const {
  isRequestAllowed,
  addRequestCount,
  decreaseRequestCount,
} = require("./utils");

// razorpay instance create

const rzp_key_id = process.env.RZP_KEY_ID || "rzp_test_dtfqkGM0oeWPnY";
const rzp_key_secret = process.env.RZP_KEY_SECRET || "IPs3cz3OnRMsQr1nF5YgKE5E";

const rzpinstance = new Razorpay({
  key_id: rzp_key_id,
  key_secret: rzp_key_secret,
});

// TODO: Remove after testing this endpoint after
async function uploadFileToStorage(req, res) {
  try {
    const form = new formidable.IncomingForm();
    form.parse(req, async (err, fields, files) => {
      if (err) {
        res.json({
          code: 500,
          status: 0,
          response_message: "Error while parsing form data",
        });
      } else {
        // console.log(files, fields);

        let data = [];
        for (let key in files) {
          const file = files[key];

          var fileExt = file.name.split(".").pop();
          const filePath = `${fields.path}.${fileExt}`;

          const response = await bucket.upload(file.path, {
            gzip: true,
            destination: filePath,
            public: true,
          });

          const url = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
          data.push(url);
        }
        res.send(data.join(","));
      }
    });
  } catch (err) {
    handleError(req, res, err);
  }
}

// async function createNewProduct(req, res) {
//   try {
//     const user = await db.collection("users").doc(res.locals.uid).get();

//     if (user.data().status !== userStatus.active) {
//       return res.json({
//         code: 401,
//         status: 0,
//         response_message: "Profile verification needed to post a product.",
//       });
//     }

//     const form = new formidable.IncomingForm();
//     form.parse(req, async (err, fields, files) => {
//       if (err) {
//         return res.json({
//           code: 500,
//           status: 0,
//           response_message: "Error while parsing form data",
//         });
//       } else {
//         const {
//           name,
//           description,
//           condition,
//           used_for,
//           location_name,
//           category,
//           latitude,
//           longitude,
//           price,
//           brand,
//         } = fields;

//         const displayImage = files["display_image"];
//         const productImages = Object.values(files).filter(
//           (file) => file !== displayImage
//         );

//         if (!displayImage) {
//           return res.json({
//             code: 400,
//             status: 0,
//             response_message: "Please upload a display image",
//           });
//         }

//         if (productImages.length < 1 || productImages.length > 3) {
//           return res.json({
//             code: 400,
//             status: 0,
//             response_message: "Please upload between 1 to 3 product images",
//           });
//         }

//         if (
//           !name ||
//           !description ||
//           !condition ||
//           !used_for ||
//           !location_name ||
//           !category ||
//           !latitude ||
//           !longitude
//         ) {
//           return res.json({
//             code: 400,
//             status: 0,
//             response_message:
//               "All fields are required (name, description, condition, used_for, location_name, category, latitude, longitude)",
//           });
//         }

//         const productRef = db.collection("products").doc();
//         const productId = productRef.id;

//         let filePaths = [];
//         let fileurls = [];
//         let uploadErr = false;
//         const allFiles = [displayImage, ...productImages];

//         for (let file of allFiles) {
//           if (
//             file.type.split("/")[0] !== "image" ||
//             Math.ceil(file.size / (1024 * 1024)) > 2
//           ) {
//             uploadErr = true;
//             break;
//           }
//           const fileExt = file.name.split(".").pop();
//           const filePath = `products/${productId}/image_${file.name}.${fileExt}`;
//           const response = await bucket.upload(file.path, {
//             gzip: true,
//             destination: filePath,
//             public: true,
//           });
//           const url = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
//           fileurls.push(url);
//           filePaths.push(filePath);
//         }

//         if (uploadErr) {
//           filePaths.forEach((file) => bucket.file(file).delete());
//           return res.json({
//             code: 400,
//             status: 0,
//             response_message:
//               "Uploaded file should be an image and should be less than 2MB.",
//           });
//         }

//         const newProduct = {
//           name: name.toLowerCase(),
//           description,
//           condition,
//           used_for,
//           price: parseInt(price) || 0,
//           brand,
//           location_name,
//           category,
//           cost_saving: parseInt(price) || 0,
//           energy_saving: 0,
//           images: fileurls,
//           display_image: fileurls[0], // The display image
//           posted_by: res.locals.uid,
//           status: productStatus.active,
//           coordinates: new firebase.firestore.GeoPoint(latitude, longitude),
//           timestamp: firestore.FieldValue.serverTimestamp(),
//         };

//         await productRef.set(newProduct);
//         res.json({
//           code: 201,
//           status: 0,
//           response_message: "Your Product Successfully Posted",
//           data: { productId },
//         });
//       }
//     });
//   } catch (err) {
//     console.log(err);
//     handleError(req, res, err);
//   }
// }

async function createNewProduct(req, res) {
  try {
    const user = await db.collection("users").doc(res.locals.uid).get();

    if (user.data().status !== userStatus.active)
      return res.json({
        code: 401,
        status: 0,
        response_message: "Profile verification needed to post a product.",
      });

    const form = new formidable.IncomingForm();
    form.parse(req, async (err, fields, files) => {
      if (err) {
        res.json({
          code: 500,
          status: 0,
          response_message: "Error while parsing form data",
        });
      } else {
        var {
          name,
          description,
          condition,
          used_for,
          location_name,
          category,
          latitude,
          longitude,
          price,
          brand,
        } = fields;
        if (
          !name ||
          !description ||
          !condition ||
          !used_for ||
          !location_name ||
          !category ||
          !latitude ||
          !longitude
        ) {
          res.json({
            code: 400,
            status: 0,
            response_message:
              "All fields are required (name, description, condition, used_for, location_name, category, latitude, longitude",
          });
        } else if (Object.keys(files).length === 0) {
          res.json({
            code: 400,
            status: 0,
            response_message: "Please upload at least one file",
          });
        } else if (Object.keys(files).length > 4) {
          res.json({
            code: 400,
            status: 0,
            response_message: "Maximum of four files are allowed",
          });
        } else {
          // formatting data
          name = name.toLowerCase();
          latitude = parseFloat(latitude);
          longitude = parseFloat(longitude);
          if (!price) price = 0;
          if (!brand) brand = null;
          // const geohash = geofire.geohashForLocation([latitude, longitude]);

          try {
            const productRef = db.collection("products").doc();

            const productId = productRef.id;
            let filePaths = [];
            let fileurls = [];

            let uploadErr = false;

            for (let key in files) {
              const file = files[key];

              // check if image or not
              if (file.type.split("/")[0] !== "image") {
                uploadErr = true;
                break;
              }
              // check if file is less than 2MB
              if (Math.ceil(file.size / (1024 * 1024)) > 2) {
                uploadErr = true;
                break;
              }
              var fileExt = file.name.split(".").pop();
              const filePath = `products/${productId}/image_${key}.${fileExt}`;

              const response = await bucket.upload(file.path, {
                gzip: true,
                destination: filePath,
                public: true,
              });

              const url = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

              fileurls.push(url);
              filePaths.push(filePath);
            }

            // verify file upload errors

            if (uploadErr) {
              if (filePaths.length > 0) {
                filePaths.forEach((file) => {
                  // console.log(file);
                  bucket.file(file).delete();
                });
              }

              return res.json({
                code: 400,
                status: 0,
                response_message:
                  "Uploaded file should be image or image should be less than 2MB.",
              });
            }

            const userDoc = await db
              .collection("users")
              .doc(res.locals.uid)
              .get();

            const cost_saving = price;
            const energy_saving = 0;
            const newProduct = {
              name: name.toLowerCase(),
              description,
              condition,
              used_for,
              price: parseInt(price) || 0,
              brand,
              location_name,
              category,
              cost_saving: parseInt(cost_saving) || 0,
              energy_saving,
              images: fileurls,
              posted_by: res.locals.uid,
              status: productStatus.active,
              is_active: false,
              is_review: false,
              coordinates: new firebase.firestore.GeoPoint(latitude, longitude),
              timestamp: firestore.FieldValue.serverTimestamp(),
              updated_at: firestore.FieldValue.serverTimestamp(),
              display_image: fileurls[0],
            };

            functions.logger.log(
              `product-created-coordinates-log lat-${latitude} lng-${longitude}`
            );
            await productRef.set(newProduct);

            res.json({
              code: 201,
              status: 0,
              response_message: "Your Product Successfully Posted",
              data: { productId },
            });
          } catch (error) {
            console.log(error);
            return res.json({
              code: 500,
              status: 0,
              response_message:
                "Error while uploading files, Please try again.",
            });
          }
        }
      }
    });
  } catch (err) {
    console.log(err);
    handleError(req, res, err);
  }
}

async function getProduct(req, res) {
  logDebug(req);

  try {
    const productId = req.params.id;
    const userId = res.locals.uid;
    const productRef = db.collection("products").doc(productId);
    const productSnapshot = await productRef.get();
    if (!productSnapshot.exists) {
      return res.send({
        code: 404,
        status: 0,
        response_message: "Product not found",
      });
    }
    let product = productSnapshot.data();
    if (product.status == productStatus.deleted) {
      return res.send({
        code: 404,
        status: 0,
        response_message: "Product not found",
      });
    }
    if (product.posted_by !== userId) {
      const reportRef = db
        .collection("product_reports")
        .where("productId", "==", productId)
        .where("reportedBy", "==", userId);

      const reportSnapshot = await reportRef.get();
      // console.log(reportSnapshot.get());
      if (reportSnapshot.empty) {
        product.isReported = false;
      } else {
        product.isReported = true;
      }

      const requestRef = db
        .collection("product_requests")
        .where("productId", "==", productId)
        .where("userId", "==", userId)
        .where("status", "!=", requestStatus.cancelled);

      const requestSnapshot = await requestRef.get();
      if (requestSnapshot.empty) {
        product.isRequested = false;
        product.requestAccepted = false;
      } else {
        const status = requestSnapshot.docs[0].data().status;
        product.isRequested = true;
        product.requestAccepted = status === requestStatus.accepted;
      }
    } else {
      product.isRequested = false;
      product.requestAccepted = false;
      product.isReported = false;
    }
    const userRef = db.collection("users").doc(product.posted_by);
    const userSnapshot = await userRef.get();
    const userData = userSnapshot.data();
    const userStatsRef = db.collection("user_stats").doc(product.posted_by);
    const statsDoc = await userStatsRef.get();
    product.posted_by = {
      uid: product.posted_by,
      name: userData.name,
      user_avatar: userData.user_avatar,
      member_since: moment(new Date(userData.timestamp._seconds * 1000)).format(
        "MMM Do"
      ),
      user_stats: statsDoc.data(),
    };
    product.created_at = moment(
      new Date(product.timestamp._seconds * 1000)
    ).format("MMM Do");

    product.is_self_product = product.posted_by.uid === userId ? true : false;

    // update category id to object add name
    const categoryRef = db
      .collection("product_categories")
      .doc(product.category);
    const categorySnapshot = await categoryRef.get();
    const categoryData = categorySnapshot.data();
    product.category = { id: product.category, name: categoryData.name };

    delete product.timestamp;
    delete product.reportIds;

    return res.json({
      code: 200,
      status: 1,
      data: { id: productId, ...product },
    });
  } catch (error) {
    functions.logger.error(error);
    handleError(req, res, error);
  }
}

async function getProducts(req, res) {
  logDebug(req);

  const userId = res.locals.uid;
  // Get the user's location from the request
  const userLat = req.query.lat;
  const userLng = req.query.long;
  const data = {};

  if (!userLat || !userLng)
    return res.json({
      code: 400,
      status: 0,
      response_message: "Invalid Location Coordinates ",
    });

  try {
    const page = req.query.page || 1;
    const productsPerPage = req.query.pageSize || 10;
    const maxDistance = req.query.maxDistance || 50;
    // const searchQuery = req.query.search;
    const categoryId = req.query.category;
    const sortBy = req.query.sortBy || "latest"; // Add new query parameter `sortBy`

    if (maxDistance > 50)
      return res.json({
        code: 400,
        status: 0,
        response_message: `Max Distance for getting products is 50 Kilometers. Requested ${maxDistance} Kilometers`,
      });

    if (productsPerPage > 30)
      return res.json({
        code: 400,
        status: 0,
        response_message: `Max Page size allowed is 30,`,
      });

    var query = db
      .collection("products")
      .select(
        "name",
        "condition",
        "coordinates",
        "images",
        "location_name",
        "timestamp",
        "display_image",
        "posted_by"
      )
      .where("status", "in", [productStatus.active, productStatus.hold])
      .where("is_active", "==", true);
    // .where("posted_by", "!=", userId)
    // .orderBy("posted_by");

    if (categoryId) {
      const categories = categoryId.split(",");
      data.category = categories;
      query = query.where("category", "in", categories);
    }

    if (sortBy === "latest") {
      query = query.orderBy("timestamp", "desc");
    }
    const productsSnapshot = await query.get();

    const products = productsSnapshot.docs.map((doc) => {
      return { id: doc.id, ...doc.data() };
    });

    // Filter the products that are within the max distance
    const filteredProducts = products.filter((productDoc) => {
      const distance = geolib.getDistance(
        { latitude: userLat, longitude: userLng },
        {
          latitude: productDoc.coordinates._latitude,
          longitude: productDoc.coordinates._longitude,
        }
      );

      return distance <= maxDistance * 1000; // convert to meters
    });

    let sortedProducts = [];
    if (sortBy === "latest") {
      sortedProducts = filteredProducts.sort((a, b) => {
        return b.timestamp - a.timestamp;
      });
    } else if (sortBy === "nearest") {
      sortedProducts = filteredProducts.sort((a, b) => {
        const distanceA = geolib.getDistance(
          { latitude: userLat, longitude: userLng },
          {
            latitude: a.coordinates._latitude,
            longitude: a.coordinates._longitude,
          }
        );
        const distanceB = geolib.getDistance(
          { latitude: userLat, longitude: userLng },
          {
            latitude: b.coordinates._latitude,
            longitude: b.coordinates._longitude,
          }
        );
        return distanceA - distanceB;
      });
    }

    // Paginate the filtered products
    const startIndex = (page - 1) * productsPerPage;
    const endIndex = page * productsPerPage;
    const paginatedProducts = sortedProducts.slice(startIndex, endIndex);

    var result = [];
    paginatedProducts.map((d) => {
      var D = { ...d };

      if (D.posted_by === userId) D.is_self_product = true;
      else D.is_self_product = false;

      D.distance = geolib.getDistance(
        { latitude: userLat, longitude: userLng },
        {
          latitude: D.coordinates._latitude,
          longitude: D.coordinates._longitude,
        }
      );
      D.image = D.images[0];
      D.timestamp = D.timestamp._seconds;
      delete D.coordinates;
      delete D.images;
      result.push(D);
    });

    res.json({
      code: 200,
      status: 1,
      data: {
        page,
        ...data,
        count: result.length,
        products: result,
      },
    });
  } catch (err) {
    handleError(req, res, err);
  }
}

async function searchProduct(req, res) {
  const userLat = req.query.lat;
  const userLng = req.query.long;
  const searchQuery = req.query.query;
  const maxDistance = req.query.maxDistance || 5000;
  const userId = res.locals.uid;

  const page = req.query.page || 1;
  const productsPerPage = req.query.pageSize || 10;

  if (maxDistance > 50)
    return res.json({
      code: 400,
      status: 0,
      response_message: `Max Distance for getting products is 50 Kilometers. Requested ${maxDistance} Kilometers`,
    });
  if (productsPerPage > 30)
    return res.json({
      code: 400,
      status: 0,
      response_message: `Max Page size allowed is 30,`,
    });

  if (!userLat || !userLng || !searchQuery)
    return res.json({
      code: 400,
      status: 0,
      response_message: "Invalid Request",
    });
  try {
    const productsRef = db.collection("products");
    const data = await productsRef
      .select(
        "name",
        "condition",
        "coordinates",
        "images",
        "location_name",
        "timestamp",
        "display_image"
      )
      .where("status", "==", productStatus.active)
      .where("posted_by", "!=", userId)
      .get()
      .then((snapshot) => {
        const products = [];
        snapshot.forEach((doc) => {
          if (
            doc.data().name.toLowerCase().includes(searchQuery.toLowerCase())
          ) {
            products.push({
              id: doc.id,
              ...doc.data(),
            });
          }
        });
        return products;
      });

    const filteredProducts = data.filter((productDoc) => {
      const distance = geolib.getDistance(
        { latitude: userLat, longitude: userLng },
        {
          latitude: productDoc.coordinates._latitude,
          longitude: productDoc.coordinates._longitude,
        }
      );

      return distance <= maxDistance * 1000; // convert to meters
    });

    const startIndex = (page - 1) * productsPerPage;
    const endIndex = page * productsPerPage;
    const paginatedProducts = filteredProducts.slice(startIndex, endIndex);

    var result = [];
    paginatedProducts.map((d) => {
      var D = { ...d };
      D.distance = geolib.getDistance(
        { latitude: userLat, longitude: userLng },
        {
          latitude: D.coordinates._latitude,
          longitude: D.coordinates._longitude,
        }
      );
      D.image = D.images[0];
      D.timestamp = D.timestamp._seconds;

      delete D.coordinates;
      delete D.images;
      result.push(D);
    });
    // return res.json({
    //   page,
    //   count: result.length,
    //   search_string: searchQuery,
    //   data: result,
    // });

    return res.json({
      code: 200,
      status: 1,
      data: {
        page,
        count: result.length,
        search_string: searchQuery,
        products: result,
      },
    });
  } catch (err) {
    handleError(req, res, err);
  }
}

async function deleteProduct(req, res) {
  logDebug(req);

  try {
    const productId = req.params.id;
    const requestedBy = res.locals.uid;

    // Get the product document
    const productRef = db.collection("products").doc(productId);
    const productSnapshot = await productRef.get();
    if (!productSnapshot.exists) {
      return res.json({
        code: 404,
        status: 0,
        response_message: "Product not found",
      });
    }

    // Check if the requested user is the one who created the product
    const productData = productSnapshot.data();
    if (productData.posted_by !== requestedBy) {
      return res.json({
        code: 401,
        status: 0,
        response_message: "You are not authorized to delete this product",
      });
    }

    if (productData.status === productStatus.deleted)
      return res.json({
        code: 404,
        status: 0,
        response_message: "Product not found",
      });

    if (productData.status !== productStatus.active)
      return res.json({
        code: 400,
        status: 0,
        response_message: "Only active products can be deleted.",
      });
    // Delete the product
    await productRef.update({ status: productStatus.deleted });

    const requestsQuery = db
      .collection("product_requests")
      .where("productId", "==", productId);

    const querySnapshot = await requestsQuery.get();
    querySnapshot.forEach(async (doc) => {
      await doc.ref.update({ status: requestStatus.productDeleted });
    });

    return res.json({
      code: 200,
      status: 1,
      response_message: "Product deleted successfully.",
    });
  } catch (err) {
    handleError(err, res);
  }
}

async function updateProduct(req, res) {
  const userId = res.locals.uid;
  const productId = req.params.id;

  logDebug(req);

  try {
    // const user = await db.collection("users").doc(res.locals.uid).get();
    const productRef = db.collection("products").doc(productId);
    const productSnapshot = await productRef.get();
    if (!productSnapshot.exists) {
      return res.send({
        code: 404,
        status: 0,
        response_message: "Product not found",
      });
    }
    let product = productSnapshot.data();
    if (product.status == productStatus.deleted)
      return res.send({
        code: 404,
        status: 0,
        response_message: "Product not found",
      });

    if (product.posted_by !== userId)
      return res.send({
        code: 401,
        status: 0,
        response_message: "Unauthorised",
      });

    const form = new formidable.IncomingForm();
    form.parse(req, async (err, fields, files) => {
      if (err) {
        console.error(err);
        return res.json({
          code: 500,
          status: 0,
          response_message: "Error parsing form data",
        });
      }

      if (
        !fields.name ||
        !fields.category ||
        !fields.condition ||
        !fields.used_for ||
        !fields.location_name ||
        !fields.latitude ||
        !fields.longitude ||
        !fields.description
      )
        return res.json({
          code: 400,
          status: 0,
          response_message: "Invalid Request",
        });
      // update product details
      const productData = {
        name: fields.name,
        category: fields.category,
        condition: fields.condition,
        used_for: fields.used_for,
        location_name: fields.location_name,
        description: fields.description,
        brand: fields.brand || null,
        price: parseInt(fields.price) || 0,
        updated_at: firestore.FieldValue.serverTimestamp(),
        display_image: "",
      };

      // convert lat long to geopoint

      productData.coordinates = new firebase.firestore.GeoPoint(
        parseFloat(fields.latitude),
        parseFloat(fields.longitude)
      );

      // ---- display image
      const isValidURL = (str) =>
        /^(https?:\/\/)?([\w\d\-_]+\.+[A-Za-z]{2,})+(\/\S*)?$/.test(str);

      // Check for the display_image field
      if (fields.display_image && typeof fields.display_image === "string") {
        functions.logger.log(
          `product-update-display-image-url ${fields.display_image}`
        );
        if (!isValidURL(fields.display_image))
          return res.status(400).json({ message: "Invalid Display Image URL" });

        productData.display_image = fields.display_image; // direct URL
      } else if (files.display_image) {
        // Handle file upload for display_image

        const displayImageFile = files.display_image;

        // check if image or not
        if (displayImageFile.type.split("/")[0] !== "image") {
          return res.json({
            code: 400,
            status: 0,
            response_message: "Invalid display_image format",
          });
        }

        // check if file is less than 2MB
        if (Math.ceil(displayImageFile.size / (1024 * 1024)) > 2) {
          return res.json({
            code: 400,
            status: 0,
            response_message: "Display image size should be less than 2MB",
          });
        }

        var fileExt = displayImageFile.name.split(".").pop();
        const filePath = `products/${productId}/image_display${Math.round(
          Math.random() * 999
        )}.${fileExt}`;

        await bucket.upload(displayImageFile.path, {
          gzip: true,
          destination: filePath,
          public: true,
        });

        const display_image_url = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

        productData.display_image = display_image_url;
      } else {
        return res
          .status(400)
          .send({ message: "Display Image field required!" });
      }

      functions.logger.log(
        `product-updated-coordinates-log lat-${fields.latitude} lng-${fields.longitude}`
      );

      // update images
      if (fields.existing_images) {
        var existingImages = fields.existing_images.replace(/\s+/g, "");
        existingImages = existingImages.split(","); // array of existing image URLs
      } else {
        var existingImages = []; // array of existing image URLs
      }
      const newImages = files; // array of new image files
      if (existingImages.length < 4) {
        let filePaths = [];
        let fileurls = [];
        let uploadErr = false;

        delete files.display_image;

        for (let key in files) {
          const file = files[key];

          // check if image or not
          if (file.type.split("/")[0] !== "image") {
            uploadErr = true;
            break;
          }
          // check if file is less than 2MB
          if (Math.ceil(file.size / (1024 * 1024)) > 2) {
            uploadErr = true;
            break;
          }
          var fileExt = file.name.split(".").pop();
          const filePath = `products/${productId}/image_product${Math.round(
            Math.random() * 999
          )}.${fileExt}`;

          const response = await bucket.upload(file.path, {
            gzip: true,
            destination: filePath,
            public: true,
          });

          const url = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

          fileurls.push(url);
          filePaths.push(filePath);
        }

        // verify file upload errors

        if (uploadErr) {
          if (filePaths.length > 0) {
            filePaths.forEach((file) => {
              // console.log(file);
              bucket.file(file).delete();
            });
          }
        }
        const updated_images = [
          productData.display_image,
          ...existingImages,
          ...fileurls,
        ];
        productData.images = updated_images;
        // productData.display_image = updated_images[0];

        if (productData.images.length < 2)
          return res.json({
            code: 400,
            status: 0,
            response_message: "Minimum 2 Images required",
          });
      }

      functions.logger.log(`product-updated-response`, productData);

      await productRef.update(productData);
      const updatedProduct = await productRef.get();

      updatedData = updatedProduct.data();
      const category = await db
        .collection("product_categories")
        .doc(updatedData.category)
        .get();

      if (!category.exists)
        return res.status(400).send({ message: "Invalid Category Update!" });

      updatedData.category = {
        id: updatedData.category,
        ...category.data(),
      };

      const user = await db
        .collection("users")
        .doc(updatedData.posted_by)
        .get();
      const userData = user.data();

      const userStats = await db
        .collection("user_stats")
        .doc(updatedData.posted_by)
        .get();
      const userStatsData = userStats.data();

      updatedData.posted_by = {
        uid: updatedData.posted_by,
        name: userData.name,
        user_avatar: userData.user_avatar,
        member_since: userData.timestamp._seconds,
        user_stats: userStatsData,
      };

      updatedData.created_at = moment(
        new Date(updatedData.timestamp._seconds * 1000)
      ).format("MMM Do");
      updatedData.updated_at = moment(
        new Date(updatedData.updated_at._seconds * 1000)
      ).format("MMM Do");

      delete updatedData.timestamp;

      // send notifications to users as product is updated

      const productRequestsRef = db.collection("product_requests");
      const snapshot = await productRequestsRef
        .where("productId", "==", productId)
        .get(); // Retrieve product requests where product ID matches

      const userIds = snapshot.docs.map((doc) => doc.data().userId);
      if (userIds.length > 0)
        sendNotification(
          userIds,
          "Product Update",
          `Product ${updatedData.name} details are updated by the giver.`,
          {
            module: "listing_details_screen",
            data: { product_id: productId },
          },
          {
            notification: {
              click_action: "listing_details_screen",
            },
          }
        );

      return res.send({
        code: 201,
        status: 0,
        response_message: "Product Updated",
        data: { id: productId, ...updatedData },
      });
    });
  } catch (err) {
    handleError(req, res, err);
  }
}

async function getProductCategories(req, res) {
  logDebug(req);

  const productCategoriesRef = db.collection("product_categories");

  const data = [];
  productCategoriesRef
    .get()
    .then((snapshot) => {
      snapshot.forEach((doc) => {
        const category = { id: doc.id, ...doc.data() };
        data.push(category);
      });
      res.json({ code: 200, status: 1, data });
    })
    .catch((err) => {
      handleError(req, res, err);
    });
}

async function addProductRequest(req, res) {
  logDebug(req);
  const app_version = parseInt(req.headers["app-version"]) || 0;

  try {
    const productId = req.params.productId;
    const userId = res.locals.uid;
    const message = req.body.message;
    const latitude = parseFloat(req.body.latitude);
    const longitude = parseFloat(req.body.longitude);

    if (app_version > 36) {
      const isAllowed = await isRequestAllowed(userId);

      if (!isAllowed) {
        return res.json({
          code: 200,
          status: 0,
          error_code: "REQUEST_LIMIT_EXCEEDED",
          response_message:
            "Oops! It looks like you've reached your daily limit of two product requests. Don't worry, you'll be able to make new requests starting again at 12:00 AM tomorrow. We appreciate your enthusiasm and thank you for using our app! See you tomorrow for more exciting products.",
        });
      }
    }

    if (!latitude || !longitude || !message)
      return res.send({
        code: 400,
        status: 0,
        response_message: "Invalid Request",
      });

    // check if product exists in products collection
    const productRef = db.collection("products").doc(productId);
    const productSnapshot = await productRef.get();
    if (!productSnapshot.exists) {
      return res.send({
        code: 404,
        status: 0,
        response_message: "Product not found",
      });
    }

    const productData = productSnapshot.data();
    if (productData.posted_by === userId)
      return res.json({
        code: 401,
        status: 0,
        response_message: "Request Not Allowed",
      });

    // todo - check here for requesting
    const requestRef = db
      .collection("product_requests")
      .where("productId", "==", productId)
      .where("userId", "==", userId)
      .where("status", "!=", requestStatus.cancelled);

    const snapshot = await requestRef.get();

    // TODO: change default request status, check if user is active/not
    if (snapshot.empty) {
      const ref = db.collection("product_requests").doc();
      await ref.set({
        userId,
        productId,
        message: message,
        status: "requested",
        coordinates: new firebase.firestore.GeoPoint(latitude, longitude),
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firestore.FieldValue.serverTimestamp(),
      });

      const productTitle =
        productData.name[0].toUpperCase() + productData.name.slice(1);

      await productRef.update({
        updated_at: firestore.FieldValue.serverTimestamp(),
      });

      if (app_version > 36) {
        await addRequestCount(userId);
      }

      sendNotification(
        [productData.posted_by],
        "New Request",
        `You got a request for ${productTitle}.`,
        {
          module: "listing_details_screen",
          data: { requestId: ref.id },
        },
        {
          notification: {
            click_action: "listing_details_screen",
          },
        }
      );
      return res.json({
        code: 200,
        status: 1,
        response_message: "Request added successfully",
        data: { product_status: productData.status },
      });
    } else {
      return res.json({
        code: 400,
        status: 0,
        response_message: "Error - Request already Exists!",
      });
    }
  } catch (error) {
    handleError(req, res, error);
  }
}

async function getProductRequests(req, res) {
  try {
    const productId = req.params.productId;
    const productRef = db.collection("products").doc(productId);
    const productSnapshot = await productRef.get();
    if (!productSnapshot.exists) {
      return res.json({
        code: 404,
        status: 0,
        response_message: "Product not found",
      });
    }
    const productData = productSnapshot.data();
    if (productData.posted_by !== res.locals.uid) {
      return res.json({
        code: 401,
        status: 0,
        response_message: "Unauthorized",
      });
    }

    const userRef = await db
      .collection("users")
      .doc(productData.posted_by)
      .get();

    const user = userRef.data();
    const updatedProductData = {
      id: productSnapshot.id,
      ...productData,
      created_at: moment(
        new Date(productData.timestamp._seconds * 1000)
      ).format("MMM Do"),
      posted_by: {
        id: productData.posted_by,
        name: user.name,
        user_avatar: user.user_avatar,
      },
    };

    // update category id to object add name
    const categoryRef = db
      .collection("product_categories")
      .doc(updatedProductData.category);

    const categorySnapshot = await categoryRef.get();
    const categoryData = categorySnapshot.data();

    updatedProductData.category = {
      id: updatedProductData.category,
      name: categoryData.name,
    };

    delete updatedProductData.timestamp;
    delete updatedProductData.product_validation;

    const requests = await Promise.all(
      (
        await db
          .collection("product_requests")
          .where("productId", "==", productId)
          .orderBy("updatedAt", "desc")
          .get()
      ).docs.map(async (doc) => {
        const requestData = doc.data();
        requestData.user = (
          await db.collection("users").doc(requestData.userId).get()
        ).data();

        const data = {
          request_id: doc.id,
          ...requestData,
          username: requestData.user.name,
          email: requestData.user.email,
          phone: requestData.user.phone,
          user_avatar: requestData.user.user_avatar,
          requested_at: moment(
            new Date(requestData.timestamp._seconds * 1000)
          ).format("MMM Do"),
        };

        const distance = geolib.getDistance(
          {
            latitude: data.coordinates._latitude,
            longitude: data.coordinates._longitude,
          },
          {
            latitude: productData.coordinates._latitude,
            longitude: productData.coordinates._longitude,
          }
        );

        data.distance = distance;

        delete data.user;
        data.timestamp = data.timestamp._seconds;
        delete data.updatedAt;
        return data;
      })
    );

    let alert;
    console.log(updatedProductData.status);
    if (updatedProductData.status === productStatus.review) {
      alert = {
        alert_message: {
          type: "warning",
          message: "Your listing is Under Review as it may violate our Policy.",
        },
      };
    } else if (updatedProductData.status === productStatus.suspended) {
      alert = {
        alert_message: {
          type: "danger",
          message: "Your listing has been suspended due to a policy violation.",
        },
      };
    }

    return res.json({
      code: 200,
      status: 1,
      ...alert,
      product: updatedProductData,
      requests,
    });
  } catch (error) {
    console.log(error);
    handleError(req, res, error);
  }
}

async function getProductRequestDetail(req, res) {
  try {
    const productId = req.params.productId;
    const productRef = db.collection("products").doc(productId);
    const productSnapshot = await productRef.get();

    if (!productSnapshot.exists) {
      return res.json({
        code: 404,
        status: 0,
        response_message: "Product not found",
      });
    }

    const productData = productSnapshot.data();

    if (productData.posted_by !== res.locals.uid) {
      return res.json({
        code: 401,
        status: 0,
        response_message: "Unauthorized",
      });
    }

    const userRef = await db
      .collection("users")
      .doc(productData.posted_by)
      .get();
    const user = userRef.data();

    const updatedProductData = {
      id: productSnapshot.id,
      ...productData,
      created_at: moment(
        new Date(productData.timestamp._seconds * 1000)
      ).format("MMM Do"),
      posted_by: {
        id: productData.posted_by,
        name: user.name,
        user_avatar: user.user_avatar,
      },
    };

    const categoryRef = db
      .collection("product_categories")
      .doc(updatedProductData.category);
    const categorySnapshot = await categoryRef.get();
    const categoryData = categorySnapshot.data();

    updatedProductData.category = {
      id: updatedProductData.category,
      name: categoryData.name,
    };

    delete updatedProductData.timestamp;
    delete updatedProductData.product_validation;

    let alert = getAlertMessage(updatedProductData.status); // New function to handle alert messages
    const total_requests = (
      await db
        .collection("product_requests")
        .where("productId", "==", productId)
        .get()
    ).size;

    return res.json({
      code: 200,
      status: 1,
      ...alert,
      product: updatedProductData,
      total_requests,
    });
  } catch (error) {
    console.log(error);
    handleError(req, res, error);
  }
}

async function getPaginatedProductRequests(req, res) {
  try {
    const productId = req.params.productId;
    const pageSize = parseInt(req.query.pageSize, 10) || 10; // Default page size
    const pageNumber = parseInt(req.query.pageNumber, 10) || 1; // Default to first page

    const productRef = db.collection("products").doc(productId);
    const productSnapshot = await productRef.get();

    if (!productSnapshot.exists) {
      return res.json({
        code: 404,
        status: 0,
        response_message: "Product not found",
      });
    }

    const productData = productSnapshot.data();

    // Get total count of product requests for this product
    const totalCount = (
      await db
        .collection("product_requests")
        .where("productId", "==", productId)
        .get()
    ).size;
    const totalPages = Math.ceil(totalCount / pageSize);

    // Pagination logic
    let requestsQuery = db
      .collection("product_requests")
      .where("productId", "==", productId)
      .orderBy("updatedAt", "desc")
      .limit(pageSize)
      .offset((pageNumber - 1) * pageSize); // Skip documents from previous pages

    // Fetching the requests
    const requestSnapshots = await requestsQuery.get();
    const requests = await Promise.all(
      requestSnapshots.docs.map(async (doc) => {
        const requestData = doc.data();
        requestData.user = (
          await db.collection("users").doc(requestData.userId).get()
        ).data();

        const data = {
          request_id: doc.id,
          ...requestData,
          username: requestData.user.name,
          email: requestData.user.email,
          phone: requestData.user.phone,
          user_avatar: requestData.user.user_avatar,
          requested_at: moment(
            new Date(requestData.timestamp.seconds * 1000)
          ).format("MMM Do"),
        };

        const distance = geolib.getDistance(
          {
            latitude: requestData.coordinates._latitude,
            longitude: requestData.coordinates._longitude,
          },
          {
            latitude: productData.coordinates._latitude,
            longitude: productData.coordinates._longitude,
          }
        );

        data.distance = distance;

        delete data.user;
        data.timestamp = requestData.timestamp.seconds;
        delete data.updatedAt;
        return data;
      })
    );

    return res.json({
      code: 200,
      status: 1,
      requests,
      pageSize,
      pageNumber,
    });
  } catch (error) {
    console.log(error);
    handleError(req, res, error);
  }
}

// endpoint requested by venkat for deeplinking purpose
async function getProductRequest(req, res) {
  logDebug(req);

  try {
    const requestId = req.params.requestId;
    const requestRef = db.collection("product_requests").doc(requestId);
    const requestSnapshot = await requestRef.get();
    if (!requestSnapshot.exists) {
      return res.json({
        code: 404,
        status: 0,
        response_message: "Request not found",
      });
    }
    const requestData = requestSnapshot.data();
    if (requestData.status === requestStatus.productDeleted) {
      return res.json({
        code: 401,
        status: 0,
        response_message: "Request Not Found",
      });
    }

    const userRef = await db.collection("users").doc(requestData.userId).get();
    const user = userRef.data();

    const productRef = await db
      .collection("products")
      .doc(requestData.productId)
      .get();

    const product = productRef.data();
    // update category id to object add name
    const categoryRef = db
      .collection("product_categories")
      .doc(product.category);

    const categorySnapshot = await categoryRef.get();
    const categoryData = categorySnapshot.data();

    product.category = {
      id: product.category,
      name: categoryData.name,
    };

    // For product object
    safeDelete(product, "timestamp");
    safeDelete(product, "coordinates");
    safeDelete(product, "price");

    // For user object
    safeDelete(user, "fcmToken");
    safeDelete(user, "timestamp");
    safeDelete(user, "status");
    safeDelete(user, "social_link");
    safeDelete(user, "social_link_type");
    // Assuming 'social_link_type' is duplicated by mistake, so removing only one instance.
    safeDelete(user, "role");
    safeDelete(user, "location");

    // For requestData object
    safeDelete(requestData, "productId");
    safeDelete(requestData, "updatedAt");

    const updatedProductData = {
      request_id: requestId,
      product: {
        product_id: productRef.id,
        ...product,
      },
      receiver_info: { ...user },
      request: { ...requestData },
    };

    return res.json({
      code: 200,
      status: 1,
      data: updatedProductData,
    });
  } catch (error) {
    console.log(error);
    handleError(req, res, error);
  }
}

async function verifyRequestAllowed(req, res) {
  const app_version = parseInt(req.headers["app-version"]) || 0;
  console.log(req.headers);
  try {
    if (app_version < 36) {
      const response = {
        user_id: res.locals.uid,
        timestamp: new Date().toISOString(),
        request_allowed: true,
        test:1
      };
      return res.json(response);
    }
    const isAllowed = await isRequestAllowed(res.locals.uid);

    const response = {
      user_id: res.locals.uid,
      timestamp: new Date().toISOString(),
      request_allowed: isAllowed,
    };
    
    if (!isAllowed) {
      (response["error_code"] = "REQUEST_LIMIT_EXCEEDED"),
        (response["user_message"] =
          "Oops! It looks like you've reached your daily limit of two product requests. Don't worry, you'll be able to make new requests starting again at 12:00 AM tomorrow. We appreciate your enthusiasm and thank you for using our app! See you tomorrow for more exciting products.");
    }
    res.json(response);
  } catch (err) {
    console.log(err);
    res.status(500).json({
      error: "Internal Server Error",
    });
  }
}
async function updateProductRequest(req, res) {
  const userId = res.locals.uid;
  const requestId = req.params.requestId;
  const status = req.query.status;
  const availableStatuses = Object.values(requestStatus);

  // notifications
  const acceptedUsers = [];
  const rejectedUsers = [];
  const cancelledUsers = [];

  if (!availableStatuses.includes(status)) {
    return res.json({
      code: 401,
      status: 0,
      response_message: "Invalid Status",
    });
  }

  try {
    const productRequestRef = db.collection("product_requests").doc(requestId);

    const productRequestSnapshot = await productRequestRef.get();

    if (!productRequestSnapshot.exists) {
      return res.json({
        code: 404,
        status: 0,
        response_message: "Product request not found",
      });
    }

    const productRequestData = productRequestSnapshot.data();
    if (productRequestData.status === requestStatus.cancelled)
      return res.json({
        code: 404,
        status: 0,
        response_message: "Product request not found",
      });

    const productRef = db
      .collection("products")
      .doc(productRequestData.productId);
    const productSnapshot = await productRef.get();

    if (!productSnapshot.exists) {
      return res.json({
        code: 401,
        status: 0,
        response_message: "Product not found",
      });
    }

    // check if the same status exists in request doc
    if (productRequestData.status === status)
      return res.json({
        code: 400,
        status: 0,
        response_message: "Already updated the request",
      });

    const productData = productSnapshot.data();

    const chatsRef = db.collection("chats");

    // chat node
    const chatnodeQuery = await chatsRef
      .where("product_id", "==", productRequestData.productId)
      .where("product_receiver", "==", productRequestData.userId)
      .get();

    let chatNodeRef = null;
    if (!chatnodeQuery.empty) {
      // console.log("No matching chat node found.");
      chatNodeRef = chatnodeQuery.docs[0].ref;
    }

    switch (status) {
      case requestStatus.accepted:
        if (productData.posted_by !== userId) {
          return res.json({
            code: 401,
            status: 0,
            response_message: "Not allowed to update status",
          });
        }
        // if one request is accepted then all other requests for that product will be changed to rejected.

        // accepted
        await db.collection("product_requests").doc(requestId).update({
          status: requestStatus.accepted,
          updatedAt: firestore.FieldValue.serverTimestamp(),
          isReceived: false,
          isDelivered: false,
        });

        acceptedUsers.push(productRequestData.userId);

        // update product status to given
        await db
          .collection("products")
          .doc(productRequestData.productId)
          .update({ status: productStatus.hold });
        break;

      case requestStatus.rejected:
        if (productData.posted_by !== userId) {
          return res.json({
            code: 401,
            status: 0,
            response_message: "Not allowed to update status",
          });
        }

        // rejected
        await db.collection("product_requests").doc(requestId).update({
          status: requestStatus.rejected,
          updatedAt: firestore.FieldValue.serverTimestamp(),
        });

        // disable chat node
        if (chatNodeRef !== null) {
          await chatNodeRef.update({ enabled: false });
        }

        rejectedUsers.push(productRequestData.userId);

        break;

      case requestStatus.cancelled:
        if (productData.posted_by !== userId) {
          return res.json({
            code: 401,
            status: 0,
            response_message: "Not allowed to update status",
          });
        }

        await db.collection("product_requests").doc(requestId).update({
          status: requestStatus.cancelled,
          updatedAt: firestore.FieldValue.serverTimestamp(),
          isReceived: false,
          isDelivered: false,
        });

        await db
          .collection("products")
          .doc(productRequestData.productId)
          .update({ status: productStatus.active });

        // disable chat node
        if (chatNodeRef !== null) {
          await chatNodeRef.update({ enabled: false });
        }
        cancelledUsers.push(productRequestData.userId);
        break;

      case requestStatus.requested:
        return res.json({
          code: 401,
          status: 0,
          response_message: "Invalid Status to update",
        });

      case requestStatus.received:
        if (userId !== productRequestData.userId) {
          return res.json({
            code: 401,
            status: 0,
            response_message: "Not allowed to update status",
          });
        }
        // received
        await db.collection("product_requests").doc(requestId).update({
          status: requestStatus.received,
          updatedAt: firestore.FieldValue.serverTimestamp(),
          isReceived: true,
        });

        await db
          .collection("user_stats")
          .doc(productRequestData.userId)
          .update({
            received: firestore.FieldValue.increment(1),
          });

        // send notification
        sendNotification(
          [productData.posted_by],
          "Request Update",
          `Your ${productData.name} has been marked as received. Please proceed to mark as delivered.`,
          {
            module: "request_details_screen",
            data: { requestId },
          },
          {
            notification: {
              click_action: "request_details_screen",
            },
          }
        );
        break;
      case requestStatus.delivered:
        if (userId !== productData.posted_by) {
          return res.json({
            code: 401,
            status: 0,
            response_message: "Not allowed to update status",
          });
        }
        // delivered
        await db
          .collection("products")
          .doc(productRequestData.productId)
          .update({ status: productStatus.given });

        await db.collection("product_requests").doc(requestId).update({
          status: requestStatus.delivered,
          updatedAt: firestore.FieldValue.serverTimestamp(),
          isDelivered: true,
        });

        // update user stats after transaction is completed
        await db
          .collection("user_stats")
          .doc(productData.posted_by)
          .update({
            given: firestore.FieldValue.increment(1),
            cost_saving: firestore.FieldValue.increment(productData.price),
            // energy_saving: firestore.FieldValue.increment(
            //   productData.energy_saving
            // ),
          });

        // reject all other requests as the request is delivered
        await db
          .collection("product_requests")
          .where("productId", "==", productRequestData.productId)
          .where("status", "==", requestStatus.requested)
          .where(firestore.FieldPath.documentId(), "!=", requestId)
          .get()
          .then((querySnapshot) => {
            querySnapshot.forEach((doc) => {
              rejectedUsers.push(doc.data().userId);
              doc.ref.update({ status: requestStatus.rejected });
            });
          });

        // send notification as delivered
        sendNotification(
          [productRequestData.userId],
          "Request Update",
          ` The product ${productData.name} has been marked as delivered by the giver. Please proceed to mark as received.`,
          {
            module: "request_details_screen",
            data: { requestId },
          },
          {
            notification: {
              click_action: "request_details_screen",
            },
          }
        );
        break;
      default:
        return res.json({
          code: 400,
          status: 0,
          response_message: "Invalid status to update",
        });
    }

    // send notifications
    if (acceptedUsers.length > 0)
      sendNotification(
        acceptedUsers,
        "Request Update",
        `your request for ${productData.name} has been accepted by the giver.`,
        {
          module: "request_details_screen",
          data: { requestId },
        },
        {
          notification: {
            click_action: "request_details_screen",
          },
        }
      );
    if (rejectedUsers.length > 0)
      sendNotification(
        rejectedUsers,
        "Request Update",
        `your request for ${productData.name} has been rejected by the giver.`,
        {
          module: "request_details_screen",
          data: { requestId },
        },
        {
          notification: {
            click_action: "request_details_screen",
          },
        }
      );

    if (cancelledUsers.length > 0)
      sendNotification(
        cancelledUsers,
        "Request Update",
        `The acceptance for ${productData.name} has been cancelled by the giver.`,
        {
          module: "request_details_screen",
          data: { requestId },
        },
        {
          notification: {
            click_action: "request_details_screen",
          },
        }
      );
    return res.json({
      code: 200,
      status: 1,
      response_message: "Status Updated",
      data: {
        request_status: status,
      },
    });
  } catch (error) {
    handleError(req, res, error);
  }
}

async function deleteProductRequest(req, res) {
  logDebug(req);

  try {
    const userId = res.locals.uid;
    const productRequestId = req.params.requestId;

    // Get the product request from Firestore
    const doc = await db
      .collection("product_requests")
      .doc(productRequestId)
      .get();

    if (!doc.exists) {
      return res.json({
        code: 400,
        status: 0,
        response_message: "Request Not Found",
      });
    }

    // Get the user who created the product request
    const requestUserId = doc.data().userId;

    // Check if the authenticated user is the request's creator
    if (userId === requestUserId) {
      // Delete the product request
      await db.doc(`product_requests/${productRequestId}`).update({
        status: requestStatus.cancelled,
      });

      await decreaseRequestCount(userId);

      return res.json({
        code: 200,
        status: 1,
        response_message: "Product request deleted successfully.",
      });
    } else {
      return res.json({
        code: 401,
        status: 0,
        response_message: "Unauthorized to delete this product request.",
      });
    }
  } catch (err) {
    handleError(req, res, err);
  }
}

async function getMyProductListings(req, res) {
  logDebug(req);

  let data = [];
  try {
    const userId = res.locals.uid;
    const productsRef = db.collection("products");
    const productRequestsRef = db.collection("product_requests");
    const snapshot = await productsRef
      .where("posted_by", "==", userId)
      .where("status", "!=", productStatus.deleted)
      .get();
    const products = snapshot.docs.map((doc) => {
      return { id: doc.id, ...doc.data() };
    });

    for (const product of products) {
      const requestSnapshot = await productRequestsRef
        .where("productId", "==", product.id)
        .get();

      var e = {
        id: product.id,
        name: product.name,
        image: product.images[0],
        status: product.status,
        created_at: moment(new Date(product.timestamp._seconds * 1000)).format(
          "MMM Do"
        ),
        timestamp: product.timestamp._seconds,
        // timestamp: product.updated_at._seconds,
        updated_at_timestamp: product.updated_at._seconds,
        updated_at: moment(new Date(product.updated_at._seconds * 1000)).format(
          "MMM Do"
        ),
        responses: requestSnapshot.size,
        // display_image: product.display_image,
      };
      data.push(e);
    }

    // sort lastes by timestamp
    data.sort((a, b) => b.updated_at_timestamp - a.updated_at_timestamp);

    // sort by given status
    data.sort((a, b) => {
      if (
        a.status === productStatus.given &&
        b.status !== productStatus.given
      ) {
        return 1;
      } else if (
        b.status === productStatus.given &&
        a.status !== productStatus.given
      ) {
        return -1;
      } else if (
        a.status === productStatus.given &&
        b.status === productStatus.given
      ) {
        return b.updated_at_timestamp - a.updated_at_timestamp;
      }
      return 0;
    });

    res.json({ code: 200, status: 1, data });
  } catch (error) {
    console.log(error);
    handleError(req, res, error);
  }
}

async function getMyRequests(req, res) {
  logDebug(req);

  try {
    const userId = res.locals.uid;
    const requestsRef = db.collection("product_requests");
    const querySnapshot = await requestsRef.where("userId", "==", userId).get();

    let requests = querySnapshot.docs.map((doc) => {
      return {
        id: doc.id,
        ...doc.data(),
      };
    });

    requests = await Promise.all(
      requests.map(async (request) => {
        const productRef = db.collection("products").doc(request.productId);
        const product = await productRef.get();
        const productData = product.data();
        request.product = {
          id: request.productId,
          name: productData.name,
          image: productData.images[0],
          display_image: productData.display_image,
        };
        request.requested_at = moment(
          new Date(request.timestamp._seconds * 1000)
        ).format("MMM Do");

        delete request.userId;
        delete request.productId;
        delete request.timestamp;

        return request;
      })
    );

    const statusOrder = {
      received: 1,
      delivered: 2,
    };

    requests.sort((a, b) => {
      const statusOrder = {
        delivered: 1,
        received: 1,
        "product deleted": 1,
      };

      const aStatusPriority = statusOrder[a.status] || 0;
      const bStatusPriority = statusOrder[b.status] || 0;

      if (aStatusPriority === 0 && bStatusPriority !== 0) {
        return -1; // a should come before b
      } else if (aStatusPriority !== 0 && bStatusPriority === 0) {
        return 1; // a should come after b
      }

      return b.updatedAt._seconds - a.updatedAt._seconds;
    });

    // console.log(requests.length);
    res.json({ code: 200, status: 1, data: requests });
  } catch (error) {
    handleError(req, res, error);
  }
}

async function getRequestwithId(req, res) {
  logDebug(req);

  try {
    const requestId = req.params.id;
    const requestDoc = await db
      .collection("product_requests")
      .doc(requestId)
      .get();

    if (!requestDoc.exists)
      return res.send({
        code: 404,
        status: 0,
        response_message: "Request not found.",
      });

    // TODO : check if requested user is equal to the user created product request
    const requestData = requestDoc.data();
    const productId = requestData.productId;
    const productDoc = await db.collection("products").doc(productId).get();
    const productData = productDoc.data();

    const userId = productData.posted_by;
    const userDoc = await db.collection("users").doc(userId).get();
    const userData = userDoc.data();

    const categoryRef = db
      .collection("product_categories")
      .doc(productData.category);
    const categorySnapshot = await categoryRef.get();
    const categoryData = categorySnapshot.data();
    productData.category = {
      id: productData.category,
      name: categoryData.name,
    };

    // clear unwanted product data from response
    delete productData.timestamp;
    delete productData.coordinates;
    delete productData.timestamp;
    delete productData.posted_by;

    userData.id = userId;
    // userData.fcm_token = userData.fcmToken;
    // clear unwanted user data from response

    delete userData.fcmToken;
    delete userData.role;
    delete userData.social_link;
    delete userData.social_link_type;
    delete userData.status;
    delete userData.timestamp;
    delete userData.location;

    res.send({
      code: 200,
      status: 1,
      data: {
        request_id: requestId,
        ...productData,
        posted_by: userData,
        request_status: requestData.status,
        product_id: requestData.productId,
        request_message: requestData.message,
        isReceived: requestData.isReceived,
        isDelivered: requestData.isDelivered,
      },
    });
  } catch (error) {
    handleError(req, res, error);
  }
}

async function reportProduct(req, res) {
  logDebug(req);

  const { type, message, productId } = req.body;
  if (!type || !message || !productId)
    return res.json({
      code: 400,
      status: 0,
      response_message: "Invalid Request",
    });
  const reportedBy = res.locals.uid;
  try {
    // Check if the product exists
    const productRef = db.collection("products").doc(productId);
    const productSnapshot = await productRef.get();
    if (!productSnapshot.exists) {
      return res.json({
        code: 404,
        status: 0,
        response_message: "Product not found",
      });
    }

    // Check if the reporting user is not the user who created the product
    const productData = productSnapshot.data();
    if (productData.posted_by === reportedBy) {
      return res.json({
        code: 400,
        status: 0,
        response_message: "Cannot report your own product",
      });
    }

    const reportExistsRef = db
      .collection("product_reports")
      .where("productId", "==", productId)
      .where("reportedBy", "==", reportedBy);

    const snapshot = await reportExistsRef.get();

    if (!snapshot.empty) {
      return res.json({
        code: 400,
        status: 0,
        response_message: "Already reported this product.",
      });
    }

    const report = {
      type,
      message,
      reportedBy,
      productId,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    };

    // Add the report to the product_reports collection
    const reportRef = db.collection(`product_reports`).doc();
    await reportRef.set(report);

    // Add the report id to the product's reportIds array
    // TODO: do i need to add report ids to that product document?
    // await productRef.update({
    //   reportIds: firebase.firestore.FieldValue.arrayUnion(reportRef.id),
    // });

    return res.json({
      code: 201,
      status: 1,
      response_message: "Report added successfully",
    });
  } catch (err) {
    handleError(req, res, err);
  }
}

async function submitFeedback(req, res) {
  const { feedback_type } = req.body;
  const submitted_by = res.locals.uid;
  const productId = req.params.productId;

  if (!feedback_type)
    return res.json({
      code: 400,
      status: 0,
      response_message: "Invalid Request",
    });

  if (feedback_type === feedbackType.giver) {
    const {
      pickup_convenience,
      receiver_reliability,
      pick_up_timeliness,
      feedback_text,
      submitted_for,
    } = req.body;

    if (pickup_convenience <= 1 || pickup_convenience > 5) {
      return res.status(400).send({ error: "Invalid pickup_convenience" });
    }
    if (receiver_reliability <= 1 || receiver_reliability > 5) {
      return res.status(400).send({ error: "Invalid receiver_reliability" });
    }
    if (pick_up_timeliness <= 1 || pick_up_timeliness > 5) {
      return res.status(400).send({ error: "Invalid pick_up_timeliness" });
    }

    if (!submitted_for)
      return res.json({
        code: 400,
        status: 0,
        response_message: "Invalid Request",
      });

    const user_rating = Math.floor(
      (parseInt(pickup_convenience) +
        parseInt(receiver_reliability) +
        parseInt(pick_up_timeliness)) /
        3
    );

    await db.collection("feedbacks").add({
      feedbackType: feedbackType.giver,
      submittedAt: firestore.FieldValue.serverTimestamp(),
      productId,
      pickup_convenience,
      receiver_reliability,
      pick_up_timeliness,
      user_rating,
      feedback_text,
      submitted_by,
      submitted_for,
    });

    calculateUserRating(submitted_for, user_rating);

    return res.json({
      code: 201,
      status: 1,
      response: "Thank you for your feedback.",
    });
  }

  if (feedback_type === feedbackType.reciever) {
    const {
      delivery_convenience,
      giver_responsiveness,
      product_satisfaction,
      feedback_text,
      submitted_for,
    } = req.body;

    if (delivery_convenience <= 1 || delivery_convenience > 5) {
      return res.status(400).send({ error: "Invalid pickup_convenience" });
    }
    if (giver_responsiveness <= 1 || giver_responsiveness > 5) {
      return res.status(400).send({ error: "Invalid receiver_reliability" });
    }
    if (product_satisfaction <= 1 || product_satisfaction > 5) {
      return res.status(400).send({ error: "Invalid pick_up_timeliness" });
    }
    if (!submitted_for || !feedback_text)
      return res.json({
        code: 400,
        status: 0,
        response_message: "Invalid Request",
      });
    const user_rating = Math.floor(
      (parseInt(delivery_convenience) +
        parseInt(giver_responsiveness) +
        parseInt(product_satisfaction)) /
        3
    );

    await db.collection("feedbacks").add({
      feedbackType: feedbackType.reciever,
      submittedAt: firestore.FieldValue.serverTimestamp(),
      productId,
      delivery_convenience,
      giver_responsiveness,
      product_satisfaction,
      user_rating,
      feedback_text,
      submitted_by,
      submitted_for,
    });
    calculateUserRating(submitted_for, user_rating);

    return res.json({
      code: 201,
      status: 1,
      response: "Thank you for your feedback.",
    });
  }

  return res.json({
    code: 400,
    status: 0,
    response_message: "Invalid Request",
  });
}

async function sendChatNotification(req, res) {
  const receiverId = req.body.receiverId;
  const message = req.body.message;
  const chatNode = req.body.chatNode;
  const senderId = res.locals.uid;

  if (!receiverId || !message)
    return res.json({
      code: 400,
      status: 0,
      response_message: "Invalid Request",
    });

  try {
    // Get the FCM token of the receiver
    const receiverRef = db.collection("users").doc(receiverId);
    const receiverSnapshot = await receiverRef.get();
    const receiver = receiverSnapshot.data();
    const fcmToken = receiver.fcmToken;
    if (!fcmToken)
      return res.send({
        code: 200,
        status: 0,
        response_message: "User FCM Token Not registered",
      });

    // Get the user details of the sender
    const senderRef = db.collection("users").doc(senderId);
    const senderSnapshot = await senderRef.get();
    const sender = senderSnapshot.data();
    const senderName = sender.name;

    const notificationRef = db.collection("notifications").doc();

    // Send FCM notification to the receiver
    const payload = {
      notification: {
        title: `Message from ${senderName}`,
        body: message,
      },
      token: fcmToken,
      data: {
        title: `Message from ${senderName}`,
        body: `You've got a message from ${senderName}, click to view.`,
        module: "chat_details",
        data: JSON.stringify({ chatNode, notificationDoc: notificationRef.id }),
      },
      android: {
        notification: {
          click_action: "chat_details",
        },
      },
    };

    getMessaging()
      .send(payload)
      .then(async (response) => {
        // Response is a message ID string.

        const notification = {
          docId: notificationRef.id,
          userId: receiverId,
          title: payload.data.title,
          body: payload.data.body,
          module: payload.data.module,
          data: JSON.parse(payload.data.data),
          timestamp: firestore.FieldValue.serverTimestamp(),
          deleted: false,
        };

        await notificationRef.set(notification);

        res.json({
          code: 200,
          status: 1,
          response_message: "Notification sent successfully",
        });
      })
      .catch((error) => {
        handleError(req, res, error);
      });
  } catch (error) {
    handleError(req, res, error);
  }
}

// payments
async function initPayment(req, res) {
  var amount = req.body.amount;
  const currency = req.body.currency || "INR";
  const productId = req.body.productId;

  if (!amount || !productId)
    return res.json({
      code: 400,
      status: 0,
      message: "Invalid Request",
    });

  amount = amount * 100;
  // console.log(amount);

  try {
    const options = {
      amount,
      currency,
      receipt: v4(),
      payment_capture: "0",
    };

    const order = await rzpinstance.orders.create(options);

    // info("razorpay payment initialize", { order });

    const orderId = order.id;
    const userId = res.locals.uid;

    amount = amount / 100;

    await db.collection("payments").add({
      orderId,
      userId,
      productId,
      amount,
      status: order.status,
      createdAt: firestore.FieldValue.serverTimestamp(),
    });

    res.json({
      code: 200,
      status: 1,
      response_message: "Transaction Initiated",
      data: {
        orderId,
        amount,
      },
    });
  } catch (error) {
    // console.log(error);
    handleError(req, res, error);
  }
}

async function updatePayment(req, res) {
  try {
    const transactionId = req.body.transactionId;
    const orderId = req.body.orderId;
    const status = req.body.status;

    if (!transactionId || !orderId)
      return res.json({
        code: 400,
        status: 0,
        response_message: "Invalid request",
      });

    const payment = await rzpinstance.payments.fetch(transactionId);
    const paymentStatus = payment.status;

    // console.log(payment);
    // if (orderId !== payment.orderId)
    //   return res.json({
    //     code: 400,
    //     status: 0,
    //     response_message: "Payment Error: Order Id Mismatch",
    //   });

    const snapshot = await db
      .collection("payments")
      .where("orderId", "==", orderId)
      .get();

    snapshot.forEach(async (doc) => {
      await doc.ref.update({
        transactionId,
        statusFromClient: status,
        statusFromGateway: paymentStatus,
        updatedAt: firestore.FieldValue.serverTimestamp(),
        details: payment,
      });
    });

    res.json({
      code: 200,
      status: 1,
      data: {
        payment_status: paymentStatus,
        order_id: orderId,
        transaction_id: transactionId,
      },
    });
  } catch (error) {
    handleError(req, res, error);
  }
}

async function getRazorpayKey(req, res) {
  return res.json({
    code: 200,
    status: 1,
    data: {
      RAZORPAY_KEY_ID: rzp_key_id,
    },
  });
}

function handleError(req, res, err) {
  // functions.logger.error({ err, req });
  console.log(err);
  return res.json({
    code: 500,
    status: 0,
    response_message: "Unable to process the request.",
  });
}

function logDebug(req) {
  if (req.headers.logging)
    info(`Requested ${req.path}`, { query_params: req.query, body: req.body });
}

function getAlertMessage(status) {
  switch (status) {
    case productStatus.review:
      return {
        alert_message: {
          type: "warning",
          message: "Your listing is Under Review as it may violate our Policy.",
        },
      };
    case productStatus.suspended:
      return {
        alert_message: {
          type: "danger",
          message: "Your listing has been suspended due to a policy violation.",
        },
      };
    default:
      return {};
  }
}

function safeDelete(obj, prop) {
  if (obj && Object.hasOwnProperty.call(obj, prop)) {
    delete obj[prop];
  }
}
module.exports = {
  uploadFileToStorage,
  createNewProduct,
  getProducts,
  searchProduct,
  getProduct,
  deleteProduct,
  updateProduct,
  getProductCategories,
  addProductRequest,
  getProductRequests,
  getProductRequest,
  getProductRequestDetail,
  getPaginatedProductRequests,
  updateProductRequest,
  verifyRequestAllowed,
  deleteProductRequest,
  getMyProductListings,
  getMyRequests,
  getRequestwithId,
  reportProduct,
  submitFeedback,
  sendChatNotification,
  initPayment,
  updatePayment,
  getRazorpayKey,
};
