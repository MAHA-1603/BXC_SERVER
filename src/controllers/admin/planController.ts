// controllers/planController.ts
import { Request, Response } from "express";
import * as planService from "../../services/admin/planServices";
import { handleError } from "../../utils/errorHandler";
import { logAudit } from "../../utils/auditHelper";
import { mapCountryToEnum } from "../../utils/countries";


export const createPlan = async (req: Request, res: Response) => {
  try {
    if (req.body.country) {
      req.body.country = mapCountryToEnum(req.body.country);
    }
    const plans = await planService.createPlanService(req.body);

    // If multiple plans were created, log the first one as representative
    const primaryPlan = Array.isArray(plans) ? plans[0] : plans;

    logAudit(req, {
      action: "PLAN_CREATED",
      category: "PLAN",
      targetId: (primaryPlan as any).id,
      targetType: "Plan",
      description: `Created plan: ${(primaryPlan as any).title}${Array.isArray(plans) ? ` for ${plans.length} countries` : ''}`,
    });
    res.status(201).json({ success: true, data: plans });
  } catch (err: any) {
    console.error("Error creating plan:", err);
    const { status, body } = handleError.full(err, "Failed to create plan");
    res.status(status).json(body);
  }
};

export async function updatePlan(req: Request, res: Response) {
  try {
    const plan = await planService.updatePlan(req.params.id, req.body);
    logAudit(req, {
      action: "PLAN_UPDATED",
      category: "PLAN",
      targetId: req.params.id,
      targetType: "Plan",
      description: `Updated plan: ${plan.title}`,
      metadata: { updatedFields: Object.keys(req.body) },
    });
    res.json(plan);
  } catch (err: any) {
    const { status, body } = handleError.full(err, "Failed to update plan");
    res.status(status).json(body);
  }
}

export async function deletePlan(req: Request, res: Response) {
  try {
    await planService.deletePlan(req.params.id);
    logAudit(req, {
      action: "PLAN_DELETED",
      category: "PLAN",
      targetId: req.params.id,
      targetType: "Plan",
      description: `Deleted plan ${req.params.id}`,
    });
    res.json({ success: true });
  } catch (err: any) {
    const { status, body } = handleError.full(err, "Failed to delete plan");
    res.status(status).json(body);
  }
}

export async function getPlans(req: Request, res: Response) {
  try {
    const plans = await planService.getPlans();
    res.json(plans);
  } catch (err: any) {
    const { status, body } = handleError.full(err, "Failed to fetch plans");
    res.status(status).json(body);
  }
}



// // controllers/planController.ts
// import { Request, Response } from "express";
// import * as planService from "../../services/admin/planServices";

// export const createPlan = async (req: Request, res: Response) => {
//   try {
//     const plan = await planService.createPlanService({
//       ...req.body,
//       countryPricings: req.body.countryPricings || []  // CHANGED: Plural
//     });
//     res.status(201).json({ success: true, data: plan });
//   } catch (err: any) {
//     console.error("Error creating plan:", err);
//     res.status(400).json({ success: false, message: err.message });
//   }
// };

// export const updatePlan = async (req: Request, res: Response) => {
//   try {
//     const plan = await planService.updatePlanService(req.params.id, {
//       ...req.body,
//       addCountryPricings: req.body.addCountryPricings || [],  // CHANGED: Plural
//       removeCountries: req.body.removeCountries || []
//     });
//     res.json({ success: true, data: plan });
//   } catch (err: any) {
//     res.status(400).json({ success: false, message: err.message });
//   }
// };

// export const getAllPlans = async (req: Request, res: Response) => {
//   try {
//     const plans = await planService.getAllPlansService();
//     res.json({ success: true, data: plans });
//   } catch (err: any) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// };

// export const getPlans = async (req: Request, res: Response) => {
//   try {
//     const { countryCode = "IN" } = req.query;
//     const plans = await planService.getLocalizedPlansService(countryCode as string);
//     res.json({ success: true, data: plans });
//   } catch (err: any) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// };

// export const getPlanById = async (req: Request, res: Response) => {
//   try {
//     const plan = await planService.getPlanByIdService(req.params.id);
//     if (!plan) {
//       return res.status(404).json({ success: false, message: "Plan not found" });
//     }
//     res.json({ success: true, data: plan });
//   } catch (err: any) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// };

// export const deletePlan = async (req: Request, res: Response) => {
//   try {
//     await planService.deletePlanService(req.params.id);
//     res.json({ success: true, message: "Plan deleted successfully" });
//   } catch (err: any) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// };

