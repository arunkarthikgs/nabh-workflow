import { randomUUID } from "crypto";
import { uploadToAzureBlob } from "./azureBlobStorageService.js";
import { uploadToGoogleCloudStorage } from "./googleCloudStorageService.js";
import { uploadToS3 } from "./s3StorageService.js";

const uploaders = {
  s3: uploadToS3,
  azure: uploadToAzureBlob,
  gcs: uploadToGoogleCloudStorage
};

export function getCloudStorageProvider() {
  return String(process.env.CLOUD_STORAGE_PROVIDER || "").trim().toLowerCase();
}

export function isCloudStorageConfigured() {
  return Boolean(uploaders[getCloudStorageProvider()]);
}

export async function uploadPdf({ documentType, pdf }) {
  const provider = getCloudStorageProvider();
  const upload = uploaders[provider];
  if (!upload) {
    throw new Error("Set CLOUD_STORAGE_PROVIDER to s3, azure, or gcs before storing PDFs.");
  }

  const datePath = new Date().toISOString().slice(0, 10).replaceAll("-", "/");
  const prefix = String(process.env.CLOUD_STORAGE_PREFIX || "nabh-documents").replace(/^\/+|\/+$/g, "");
  const key = `${prefix}/${documentType}/${datePath}/${randomUUID()}.pdf`;
  return upload({ key, pdf });
}