const {
  createNewProduct,
  getProducts,
  getProduct,
  deleteProduct,
  updateProduct,
  getProductCategories,
  addProductRequest,
  getProductRequests,
  getProductRequest,
  updateProductRequest,
  deleteProductRequest,
  getMyProductListings,
  getMyRequests,
  getRequestwithId,
  reportProduct,
  submitFeedback,
  initPayment,
  sendChatNotification,
  updatePayment,
  searchProduct,
  uploadFileToStorage,
  getRazorpayKey,
  getProductRequestDetail,
  getPaginatedProductRequests,
  verifyRequestAllowed,
} = require("./controller");
const { isAuthenticated } = require("../auth/authenticated");

function productsRoutesConfig(app) {
  // product routes

  app.post("/product/new", [createNewProduct]);
  app.get("/products", [getProducts]);
  app.get("/product/categories", [getProductCategories]);

  app.get("/product/request/verify", [verifyRequestAllowed]);

  app.post("/product/request/:productId", [addProductRequest]);
  app.get("/product/requests/:productId", [getProductRequests]);

  app.get("/product/v2/requests/product/:productId/detail", [
    getProductRequestDetail,
  ]);

  app.get("/product/v2/requests/product/:productId", [
    getPaginatedProductRequests,
  ]);
  // endpoint added for deeplinking
  app.get("/product/request/:requestId", [getProductRequest]);

  app.put("/product/request/:requestId", [updateProductRequest]);
  app.delete("/product/request/:requestId", [deleteProductRequest]);
  app.post("/product/report", [reportProduct]);
  app.get("/product/mylistings", [getMyProductListings]);
  app.get("/product/myrequests", [getMyRequests]);
  app.get("/product/myrequest/:id", [getRequestwithId]);

  app.post("/product/:productId/feedback", [submitFeedback]);

  app.get("/product/:id", [getProduct]);
  app.delete("/product/:id", [deleteProduct]);
  app.put("/product/:id", [updateProduct]);
  app.get("/products/search", [searchProduct]);

  // chats notification
  app.post("/product/chats/send-notification", [sendChatNotification]);

  // payments
  app.post("/init_payment", [initPayment]);
  app.post("/update_payment", [updatePayment]);
  app.post("/upload-image-to-storage", [uploadFileToStorage]);
  app.get("/razorpay-key", [getRazorpayKey]);
}

module.exports = { productsRoutesConfig };
