import express from "express";
import {
  getNotifications,
  markAsRead,
  markAllRead,
  deleteNotification,
  deleteAllUserNotifications,
} from "../../controllers/notification/userNotiController";
import { authenticate , authorizeAdmin} from "../../middleware/auth";

const router = express.Router();

router.get("/all", authenticate, getNotifications);
router.patch("/:id/read", authenticate, markAsRead);
router.put("/mark-all-read", authenticate, markAllRead);
// Delete one notification
router.delete("/:id/delete", authenticate, deleteNotification);

// Delete all notifications
router.delete("/delete-all", authenticate, deleteAllUserNotifications);

export default router;
