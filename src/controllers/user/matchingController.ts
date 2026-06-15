import { Request, Response, NextFunction } from "express";
import {
  findMatchingProvidersForSeeker,
  findMatchingSeekersForProvider,
} from "../../services/user/matchingService";

/**
 * GET /api/matching/seeker/:id/providers
 *
 * Returns ACTIVE ProviderPost records that best match the given SeekerPost.
 *
 * Query params:
 *   page  – page number  (default 1)
 *   limit – items/page   (default 10, max 50)
 */
export const getMatchingProviders = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id: seekerPostId } = req.params;
    const viewerUserId = (req as any).user?.id;

    const page  = parseInt((req.query.page  as string) || "1",  10);
    const limit = parseInt((req.query.limit as string) || "10", 10);

    const result = await findMatchingProvidersForSeeker(
      seekerPostId,
      viewerUserId,
      page,
      limit
    );

    res.status(200).json({
      success: true,
      message: "Matching provider posts fetched successfully",
      data: result,
    });
  } catch (err: any) {
    if (err.message === "Seeker post not found") {
      res.status(404).json({ success: false, message: "Seeker post not found" });
      return;
    }
    next(err);
  }
};

/**
 * GET /api/matching/provider/:id/seekers
 *
 * Returns ACTIVE SeekerPost records that best match the given ProviderPost.
 *
 * Query params:
 *   page  – page number  (default 1)
 *   limit – items/page   (default 10, max 50)
 */
export const getMatchingSeekers = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id: providerPostId } = req.params;
    const viewerUserId = (req as any).user?.id;

    const page  = parseInt((req.query.page  as string) || "1",  10);
    const limit = parseInt((req.query.limit as string) || "10", 10);

    const result = await findMatchingSeekersForProvider(
      providerPostId,
      viewerUserId,
      page,
      limit
    );

    res.status(200).json({
      success: true,
      message: "Matching seeker posts fetched successfully",
      data: result,
    });
  } catch (err: any) {
    if (err.message === "Provider post not found") {
      res.status(404).json({ success: false, message: "Provider post not found" });
      return;
    }
    next(err);
  }
};
