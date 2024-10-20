const {
  getUserProfile,
  newUser,
  updateUser,
  uploadAvatar,
  getUserSocialLink,
  updateUserSocialLink,
  updateGeolocation,
  logout,
  createNewUserv2,
  updateUserv2,
  updateFcmToken,
  userOnboarding,
  createUserDeletionRequest,
  validateUser,
  getUserPublicProfile,
} = require("./controller");
const { isAuthenticated } = require("../auth/authenticated");

function authRoutesConfig(app) {
  // user routes
  // v2
  app.post("/v2/create/user", [createNewUserv2]);
  app.post("/v2/update/user", [isAuthenticated, updateUserv2]);
  app.post("/v2/onboarding/user", [isAuthenticated, userOnboarding]);
  app.post("/v2/update/fcm-token", [isAuthenticated, updateFcmToken]);
  // v1
  app.get("/user", [isAuthenticated, getUserProfile]);
  app.post("/user", [isAuthenticated, newUser]);
  app.put("/user", [isAuthenticated, updateUser]);
  app.put("/user/profileimage", [isAuthenticated, uploadAvatar]);
  app.get("/user/public-profile/:id", [isAuthenticated, getUserPublicProfile]);
  app.get("/user/socialprofilelink", [isAuthenticated, getUserSocialLink]);
  app.put("/user/socialprofilelink", [isAuthenticated, updateUserSocialLink]);
  app.put("/user/geolocation", [isAuthenticated, updateGeolocation]);

  app.post("/user/account/delete", [
    isAuthenticated,
    createUserDeletionRequest,
  ]);
  app.get("/user/profile/validate", [isAuthenticated, validateUser]);
  app.post("/user/deletion-request/cancel", [
    isAuthenticated,
    createUserDeletionRequest,
  ]);

  app.post("/user/logout", [isAuthenticated, logout]);
}

module.exports = { authRoutesConfig };
