import { requestUploadUrl } from "@workspace/api-client-react";

export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

export async function uploadPhoto(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files are supported.");
  }
  if (file.size > MAX_PHOTO_BYTES) {
    throw new Error("Image must be smaller than 8 MB.");
  }
  const meta = await requestUploadUrl({
    name: file.name,
    size: file.size,
    contentType: file.type,
  });
  const put = await fetch(meta.uploadURL, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });
  if (!put.ok) {
    throw new Error(`Upload failed (${put.status})`);
  }
  return meta.objectPath;
}

export function photoSrc(objectPath: string | null | undefined): string | null {
  if (!objectPath) return null;
  const path = objectPath.startsWith("/") ? objectPath : `/${objectPath}`;
  return `/api/storage${path}`;
}
