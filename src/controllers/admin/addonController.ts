// controllers/planController.ts
import { Request, Response } from "express";
import * as addonService from "../../services/admin/addonService";
import { handleError } from "../../utils/errorHandler";
import { logAudit } from "../../utils/auditHelper";

export async function createAddOn(req: Request, res: Response) {
  try {
    const addons = await addonService.createAddon(req.body);
    const mainAddon = addons[0];
    logAudit(req, {
      action: "ADDON_CREATED",
      category: "ADDON",
      targetId: mainAddon.id,
      targetType: "AddOn",
      description: `Created add-on: ${mainAddon.title} (${addons.length} variants)`,
      metadata: { addonIds: addons.map(a => a.id) }
    });
    res.status(201).json(addons);
  } catch (err: any) {
    const { status, body } = handleError.full(err, "Failed to create addon");
    res.status(status).json(body);
  }
}

export async function updateAddOn(req: Request, res: Response) {
  try {
    const addon = await addonService.updateAddOn(req.params.id, req.body);
    logAudit(req, {
      action: "ADDON_UPDATED",
      category: "ADDON",
      targetId: req.params.id,
      targetType: "AddOn",
      description: `Updated add-on: ${addon.title}`,
      metadata: { updatedFields: Object.keys(req.body) },
    });
    res.json(addon);
  } catch (err: any) {
    const { status, body } = handleError.full(err, "Failed to update addon");
    res.status(status).json(body);
  }
}

export async function deleteAddOn(req: Request, res: Response) {
  try {
    await addonService.deleteAddon(req.params.id);
    logAudit(req, {
      action: "ADDON_DELETED",
      category: "ADDON",
      targetId: req.params.id,
      targetType: "AddOn",
      description: `Deleted add-on ${req.params.id}`,
    });
    res.json({ success: true });
  } catch (err: any) {
    const { status, body } = handleError.full(err, "Failed to delete addon");
    res.status(status).json(body);
  }
}

export async function getAddOns(req: Request, res: Response) {
  try {
    const plans = await addonService.getAddons();
    res.json(plans);
  } catch (err: any) {
    const { status, body } = handleError.full(err, "Failed to fetch addons");
    res.status(status).json(body);
  }
}
