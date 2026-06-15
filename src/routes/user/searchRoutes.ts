import { Router } from "express";
import {
  searchProviderPostsController,
  searchSeekerPostsController,
} from "../../controllers/user/searchController";
import { authenticate } from "../../middleware/auth";
import { apiLimiter } from "../../middleware/rateLimiter";

const router = Router();

// Search Provider Posts
// GET /api/search/provider?q=aws&skill=react&location=hyderabad&level=senior&isRemote=true&page=1&limit=10
router.get("/provider", apiLimiter, authenticate, searchProviderPostsController);

// Search Seeker Posts
// GET /api/search/seeker?q=developer&skill=nodejs&location=bangalore&page=1&limit=10
router.get("/seeker", apiLimiter, authenticate, searchSeekerPostsController);

export default router;
