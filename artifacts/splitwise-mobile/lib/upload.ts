import { requestUploadUrl } from "@workspace/api-client-react";

export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

const domain = process.env.EXPO_PUBLIC_DOMAIN;
const BASE_URL = domain ? `https://${domain}` : "";

export async function uploadPhotoFromUri(
  uri: string,
  contentType: string,
  fileName?: string,
): Promise<string> {
  const res = await fetch(uri);
  if (!res.ok) throw new Error("Could not read selected image.");
  const blob = await res.blob();
  if (blob.size > MAX_PHOTO_BYTES) {
    throw new Error("Image must be smaller than 8 MB.");
  }
  const name = fileName ?? uri.split("/").pop() ?? "photo.jpg";
  const meta = await requestUploadUrl({
    name,
    size: blob.size,
    contentType,
  });
  const put = await fetch(meta.uploadURL, {
    method: "PUT",
    body: blob,
    headers: { "Content-Type": contentType },
  });
  if (!put.ok) {
    throw new Error(`Upload failed (${put.status})`);
  }
  return meta.objectPath;
}

export function photoUri(objectPath: string | null | undefined): string | null {
  if (!objectPath) return null;
  const path = objectPath.startsWith("/") ? objectPath : `/${objectPath}`;
  return `${BASE_URL}/api/storage${path}`;
}
