import { Router } from "express";
import * as addOnController from "../../controllers/admin/addonController";
import { authenticate, authorizeAdmin } from "../../middleware/auth";
const router = Router();

// Admin APIs
router.post(
  "/addons",
  authenticate,
  authorizeAdmin,
  addOnController.createAddOn
);
router.patch(
  "/addons/:id",
  authenticate,
  authorizeAdmin,
  addOnController.updateAddOn
);
router.delete(
  "/addons/:id",
  authenticate,
  authorizeAdmin,
  addOnController.deleteAddOn
);
router.get("/addons", authenticate, addOnController.getAddOns);

export default router;
