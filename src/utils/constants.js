const productStatus = {
  active: "active",
  hold: "hold",
  pending: "pending",
  review: "under review",
  suspended: "suspended",
  deleted: "deleted",
  given: "given",
};

const userStatus = {
  not_verified: "not verified",
  active: "active",
  pending: "pending",
  suspended: "suspended",
  declined: "declined",
};

const requestStatus = {
  requested: "requested",
  accepted: "accepted",
  rejected: "rejected",
  cancelled: "cancelled",
  received: "received",
  delivered: "delivered",
  productDeleted: "product deleted",
};

const feedbackType = {
  giver: "giver",
  reciever: "reciever",
};

const userRoles = {
  user: "user",
  admin: "admin",
};

const adminAuthJwtKey = "admin-secret-key:)";
const productBroadcastTopic = "new-product-broadcast";

const allUsersBroadcastTopic = "all-users-broadcast";

module.exports = {
  productStatus,
  userStatus,
  requestStatus,
  feedbackType,
  userRoles,
  adminAuthJwtKey,
  productBroadcastTopic,
  allUsersBroadcastTopic,
};
