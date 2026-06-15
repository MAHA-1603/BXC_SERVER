import express from "express";
import {
  getOverview,
  getTrendingSkills,
  getSectorTrends,
  getGrowthTimeline,
} from "../../controllers/admin/adminAnalyticsController";
import { Role } from "@prisma/client";

const router = express.Router();



/**
 * @route   GET /api/admin/analytics/overview
 * @desc    Get total counts for users, posts, and applications
 * @access  Private (Admin only)
 */
router.get("/overview", getOverview);

/**
 * @route   GET /api/admin/analytics/trending-skills
 * @desc    Get most requested required/provided skills
 * @access  Private (Admin only)
 */
router.get("/trending-skills", getTrendingSkills);

/**
 * @route   GET /api/admin/analytics/sector-trends
 * @desc    Get most popular sector roles
 * @access  Private (Admin only)
 */
router.get("/sector-trends", getSectorTrends);

/**
 * @route   GET /api/admin/analytics/growth
 * @desc    Get trailing 30-day timeline charting points
 * @access  Private (Admin only)
 */
router.get("/growth", getGrowthTimeline);

export default router;
