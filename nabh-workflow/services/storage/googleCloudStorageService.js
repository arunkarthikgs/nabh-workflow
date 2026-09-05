import { Storage } from "@google-cloud/storage";

export async function uploadToGoogleCloudStorage({ key, pdf }) {
  const bucket = process.env.GCS_BUCKET || process.env.CLOUD_STORAGE_BUCKET;
  if (!bucket) throw new Error("Set GCS_BUCKET before using Google Cloud Storage.");

  const storage = new Storage({ projectId: process.env.GOOGLE_CLOUD_PROJECT });
  await storage.bucket(bucket).file(key).save(Buffer.from(pdf), {
    contentType: "application/pdf",
    resumable: false
  });
  return { provider: "gcs", bucket, key };
}