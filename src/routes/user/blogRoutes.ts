import express from "express";
import * as blogController from "../../controllers/user/blogController";

const router = express.Router();

router.get("/", blogController.getPublishedBlogs);
router.get("/:slug", blogController.getBlogBySlug);

export default router;
