import express from "express";
import {
  getMyCreatedNotifications,
  getAllNotifications,
  editNotification,
  deleteNotification,
    notifyAllUsers,
    deleteAllAdminNotifications,
} from "../../controllers/admin/notificationController";

const router = express.Router();

import {authenticate, authorizeAdmin } from "../../middleware/auth";


// Routes definitions
router.post("/notifications/notify-all",  authenticate, authorizeAdmin, notifyAllUsers);
router.get("/notifications/mine", authenticate, authorizeAdmin,  getMyCreatedNotifications);
router.get("/notifications/all",authenticate, authorizeAdmin,   getAllNotifications);
router.patch("/notifications/:id", authenticate, authorizeAdmin,   editNotification);
router.delete("/notifications/delete-all", authenticate, authorizeAdmin, deleteAllAdminNotifications);
router.delete("/notifications/:id", authenticate, authorizeAdmin,  deleteNotification);

export default router;
