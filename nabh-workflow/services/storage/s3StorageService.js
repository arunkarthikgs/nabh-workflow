import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export async function uploadToS3({ key, pdf }) {
  const bucket = process.env.AWS_S3_BUCKET || process.env.CLOUD_STORAGE_BUCKET;
  if (!bucket) throw new Error("Set AWS_S3_BUCKET before using S3 storage.");

  const input = {
    Bucket: bucket,
    Key: key,
    Body: Buffer.from(pdf),
    ContentType: "application/pdf",
    ServerSideEncryption: process.env.AWS_S3_KMS_KEY_ID ? "aws:kms" : "AES256"
  };
  if (process.env.AWS_S3_KMS_KEY_ID) input.SSEKMSKeyId = process.env.AWS_S3_KMS_KEY_ID;

  const client = new S3Client({ region: process.env.AWS_REGION });
  await client.send(new PutObjectCommand(input));
  return { provider: "s3", bucket, key };
}