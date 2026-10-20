import { openDB } from "idb";
import { emptyWorkspace, validate } from "./model.js";
const database = () =>
  openDB("meterlog-workspace", 1, {
    upgrade(db) {
      db.createObjectStore("state");
    },
  });
export async function read() {
  const db = await database();
  return validate(
    (await db.get("state", "workspace")) || structuredClone(emptyWorkspace),
  );
}
export async function change(action) {
  const db = await database();
  const tx = db.transaction("state", "readwrite");
  try {
    const current = validate(
      (await tx.store.get("workspace")) || structuredClone(emptyWorkspace),
    );
    const next = validate(action(current));
    await tx.store.put(next, "workspace");
    await tx.done;
    return next;
  } catch (error) {
    tx.abort();
    await tx.done.catch(() => {});
    throw error;
  }
}
export function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function photoData(file) {
  if (!file || !file.size) return null;
  if (
    file.size > 5 * 1024 * 1024 ||
    !["image/jpeg", "image/png", "image/webp"].includes(file.type)
  )
    throw new Error("Choose a JPEG, PNG, or WebP photo up to 5 MB.");
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    if (bitmap.width * bitmap.height > 20000000) throw new Error();
    const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas
      .getContext("2d")
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/webp", 0.75);
    if (!data.startsWith("data:image/webp;") || data.length > 350000)
      throw new Error();
    return data;
  } catch {
    throw new Error(
      "The photo could not be processed. Try a smaller JPEG, PNG, or WebP image.",
    );
  } finally {
    bitmap?.close();
  }
}
