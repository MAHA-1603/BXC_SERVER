import { Router } from "express";
import { getPresignedUploadUrl, getDecryptedDocumentUrl } from "../controllers/storageController";
import { uploadLimiter } from "../middleware/rateLimiter";

const router = Router();

// POST /api/storage/upload-file
router.post("/upload-file", uploadLimiter, getPresignedUploadUrl);

// POST /api/storage/get-document-url
router.post("/get-document-url", getDecryptedDocumentUrl);

export default router;
