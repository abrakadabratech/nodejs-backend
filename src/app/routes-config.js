const {
  getAppSupportData,
  addPaymentLog,
  getAppBanners,
  createReport,
  getUserNotifications,
  deleteNotifications,
  markNotificationRead,
  initPayment,
  checkPaymentStatus
} = require("./controller");

const { isAuthenticated } = require("../auth/authenticated");

function appRoutesConfig(app) {
  app.get("/app/support", [getAppSupportData]);
  app.post("/app/payment/new", [isAuthenticated, addPaymentLog]);

  app.get("/app/banners", [isAuthenticated, getAppBanners]);
  app.post("/app/reports", [isAuthenticated, createReport]);

  // app notifications
  app.get("/app/user/notifications", [isAuthenticated, getUserNotifications]);
  app.put("/app/user/notifications/read", [
    isAuthenticated,
    markNotificationRead,
  ]);
  app.delete("/app/user/notifications/delete", [
    isAuthenticated,
    deleteNotifications,
  ]);


  // phonepe endpoints
 app.post("/app/payment/init",[isAuthenticated,initPayment]) 
 app.post("/app/payment/status/:txnId/:userId",[checkPaymentStatus]) 
}

module.exports = { appRoutesConfig };
