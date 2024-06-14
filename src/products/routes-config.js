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

  app.post("/product/new", [isAuthenticated, createNewProduct]);
  app.get("/products", [isAuthenticated, getProducts]);
  app.get("/product/categories", [isAuthenticated, getProductCategories]);

  app.get("/product/request/verify", [isAuthenticated, verifyRequestAllowed]);

  app.post("/product/request/:productId", [isAuthenticated, addProductRequest]);
  app.get("/product/requests/:productId", [
    isAuthenticated,
    getProductRequests,
  ]);

  app.get("/product/v2/requests/product/:productId/detail", [
    isAuthenticated,
    getProductRequestDetail,
  ]);

  app.get("/product/v2/requests/product/:productId", [
    isAuthenticated,
    getPaginatedProductRequests,
  ]);
  // endpoint added for deeplinking
  app.get("/product/request/:requestId", [isAuthenticated, getProductRequest]);

  app.put("/product/request/:requestId", [
    isAuthenticated,
    updateProductRequest,
  ]);
  app.delete("/product/request/:requestId", [
    isAuthenticated,
    deleteProductRequest,
  ]);
  app.post("/product/report", [isAuthenticated, reportProduct]);
  app.get("/product/mylistings", [isAuthenticated, getMyProductListings]);
  app.get("/product/myrequests", [isAuthenticated, getMyRequests]);
  app.get("/product/myrequest/:id", [isAuthenticated, getRequestwithId]);

  app.post("/product/:productId/feedback", [isAuthenticated, submitFeedback]);

  app.get("/product/:id", [isAuthenticated, getProduct]);
  app.delete("/product/:id", [isAuthenticated, deleteProduct]);
  app.put("/product/:id", [isAuthenticated, updateProduct]);
  app.get("/products/search", [isAuthenticated, searchProduct]);

  // chats notification
  app.post("/product/chats/send-notification", [
    isAuthenticated,
    sendChatNotification,
  ]);

  // payments
  app.post("/init_payment", [isAuthenticated, initPayment]);
  app.post("/update_payment", [isAuthenticated, updatePayment]);
  app.post("/upload-image-to-storage", [uploadFileToStorage]);
  app.get("/razorpay-key", [isAuthenticated, getRazorpayKey]);
}

module.exports = { productsRoutesConfig };
