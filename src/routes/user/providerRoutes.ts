import { Router } from "express";
import {
  createPostController,
  getPostsByIdController,
  updatePostController,
   getMyProviderPosts,
  deletePostController,
} from "../../controllers/user/providerPostcontroller";
import { boostPostController, refreshPostController } from "../../controllers/user/postActionController";
import { authenticate } from "../../middleware/auth";
import { apiLimiter } from "../../middleware/rateLimiter";

const router = Router();

router.post("/create", authenticate, createPostController);
router.get("/myPosts",apiLimiter, authenticate, getMyProviderPosts);
router.get("/getby/:id", authenticate, getPostsByIdController);
router.put("/update/:id", authenticate, updatePostController);
router.delete("/delete/:id", authenticate, deletePostController);

router.post("/boost/:id", authenticate, boostPostController);
router.post("/refresh/:id", authenticate, refreshPostController);



export default router;
