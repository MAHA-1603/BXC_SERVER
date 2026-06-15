import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client } from "../config/r2-client";
import { v4 as uuidv4 } from "uuid";

const allowedTypes = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export async function generatePresignedUploadUrl(
  filetype: string,
  filename: string
) {
  if (!allowedTypes.includes(filetype)) {
    throw new Error("File type not allowed");
  }

  const safeFilename = filename
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .toLowerCase();

  const key = filetype.startsWith("image/")
    ? `profile-images/${uuidv4()}-${safeFilename}`
    : `user-pdfs/${uuidv4()}-${safeFilename}`;

  const putCommand = new PutObjectCommand({
    Bucket: process.env.CLOUDFLARE_BUCKET!,
    Key: key,
    ContentType: filetype,
  });

  const uploadUrl = await getSignedUrl(s3Client, putCommand, {
    expiresIn: 3600, // 1 hour
  });

  const finalUrl = `${process.env.R2_PUBLIC_DOMAIN}/${key}`;

  return {
    uploadUrl,   // frontend PUTs file here
    key,         // optional
    finalUrl,    // store this in DB
  };
}

export async function generatePresignedGetUrl(key: string) {
  const getCommand = new GetObjectCommand({
    Bucket: process.env.CLOUDFLARE_BUCKET!,
    Key: key,
  });

  const url = await getSignedUrl(s3Client, getCommand, {
    expiresIn: 604800, // 7 days
  });

  return url;
}