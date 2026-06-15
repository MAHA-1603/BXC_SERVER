import { Request, Response } from "express";
import { generatePresignedUploadUrl } from "../storage/r2-presigner";
import { handleError } from "../utils/errorHandler";
import { decryptDocumentUrl } from "../utils/cryptoUtils";

export const getPresignedUploadUrl = async (req: Request, res: Response) => {
  try {
    const { filetype, filename } = req.body;

    if (!filetype || !filename) {
      return res
        .status(400)
        .json({ error: "filetype and filename are required" });
    }

    const { uploadUrl, key, finalUrl } = await generatePresignedUploadUrl(
      filetype,
      filename
    );

    return res.json({ uploadUrl, key, finalUrl });
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to generate upload URL");
    return res.status(status).json(body);
  }
};

export const getDecryptedDocumentUrl = async (req: Request, res: Response) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: "token is required" });
    }

    const decryptedUrl = await decryptDocumentUrl(token);

    return res.json({ success: true, url: decryptedUrl });
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to decrypt document URL");
    return res.status(status).json(body);
  }
};
