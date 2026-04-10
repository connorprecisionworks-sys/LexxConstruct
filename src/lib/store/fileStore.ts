/**
 * LEXX — File Storage (V1: local disk)
 *
 * Saves uploaded document files to /data/uploads/
 *
 * SWAP GUIDE for V2:
 * Replace the save/read functions with S3, Supabase Storage,
 * or Vercel Blob calls. The API routes don't change.
 */

import fs from "fs";
import path from "path";

const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

export function saveFile(storageKey: string, buffer: Buffer): void {
  ensureUploadDir();
  const filePath = path.join(UPLOAD_DIR, storageKey);
  fs.writeFileSync(filePath, buffer);
}

export function readFile(storageKey: string): Buffer {
  const filePath = path.join(UPLOAD_DIR, storageKey);
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${storageKey}`);
  }
  return fs.readFileSync(filePath);
}

export function deleteFile(storageKey: string): void {
  const filePath = path.join(UPLOAD_DIR, storageKey);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}
