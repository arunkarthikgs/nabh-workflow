import { BlobServiceClient } from "@azure/storage-blob";

export async function uploadToAzureBlob({ key, pdf }) {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const container = process.env.AZURE_STORAGE_CONTAINER || process.env.CLOUD_STORAGE_CONTAINER;
  if (!connectionString || !container) {
    throw new Error("Set AZURE_STORAGE_CONNECTION_STRING and AZURE_STORAGE_CONTAINER before using Azure storage.");
  }

  const containerClient = BlobServiceClient.fromConnectionString(connectionString).getContainerClient(container);
  await containerClient.createIfNotExists();
  await containerClient.getBlockBlobClient(key).uploadData(Buffer.from(pdf), {
    blobHTTPHeaders: { blobContentType: "application/pdf" }
  });
  return { provider: "azure", container, key };
}