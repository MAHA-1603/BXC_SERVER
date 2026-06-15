import { Router } from "express";
import * as controller from "../../controllers/user/seekerPostController";
import { boostPostController, refreshPostController } from "../../controllers/user/postActionController";
import { authenticate } from "../../middleware/auth";
import { apiLimiter } from "../../middleware/rateLimiter";

const router = Router();

router.post("/create", authenticate, controller.createPost);
router.get("/myposts",apiLimiter, authenticate, controller.getMyPosts);
router.get("/getby/:id", authenticate, controller.getPostById);
router.put("/update/:id", authenticate, controller.updatePost);
router.delete("/delete/:id", authenticate, controller.deletePost);

router.post("/boost/:id", authenticate, boostPostController);
router.post("/refresh/:id", authenticate, refreshPostController);

export default router;
