import express from "express";
import * as blogController from "../../controllers/admin/blogController";
import { authenticate, authorizeAdmin, requirePermission } from "../../middleware/auth";

const router = express.Router();

router.use(authenticate, authorizeAdmin, requirePermission("MANAGE_BLOGS"));

router.post("/", blogController.createBlog);
router.get("/", blogController.getAllBlogs);
router.get("/:id", blogController.getBlogById);
router.put("/:id", blogController.updateBlog);
router.delete("/:id", blogController.deleteBlog);
router.patch("/:id/publish", blogController.togglePublish);

export default router;
