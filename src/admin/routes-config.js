const { verifyAdminAuth } = require("../auth/utils");
const { uploadFileToStorage } = require("../products/controller");
const {
  userLogin,
  getProfile,
  getDashboard,
  getUsers,
  getUserDetail,
  broadcastAppNotification,
  exportUsersCsv,
  getProducts,
  getProductDetail,
  updateProductStatus,
} = require("./controller");

function adminRoutesConfig(app) {
  app.post("/admin/user/login", [userLogin]);
  app.get("/admin/user/profile", [verifyAdminAuth, getProfile]);
  app.get("/admin/app/dashbard", [verifyAdminAuth, getDashboard]);

  // users
  app.get("/admin/app/users", [verifyAdminAuth, getUsers]);
  app.get("/admin/app/users/:userId", [verifyAdminAuth, getUserDetail]);
  app.post("/admin/app/broadcast-notification", [
    verifyAdminAuth,
    broadcastAppNotification,
  ]);
  app.get("/admin/users/export", [verifyAdminAuth, exportUsersCsv]);

  // products
  app.get("/admin/products", [verifyAdminAuth, getProducts]);
  app.get("/admin/product/:productId", [verifyAdminAuth, getProductDetail]);
  app.put("/admin/product/:productId/toggle-status", [
    verifyAdminAuth,
    updateProductStatus,
  ]);

  app.post("/admin/upload/file",[uploadFileToStorage])
}

module.exports = { adminRoutesConfig };
