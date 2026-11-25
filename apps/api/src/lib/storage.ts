import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export interface Storage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

function fsStorage(): Storage {
  const root = path.resolve(process.cwd(), process.env.FS_STORAGE_DIR || "./.data/files");
  const full = (key: string) => {
    const p = path.resolve(root, key);
    if (!p.startsWith(root)) throw new Error("Invalid key");
    return p;
  };
  return {
    async put(key, body) {
      const p = full(key);
      await mkdir(path.dirname(p), { recursive: true });
      await writeFile(p, body);
    },
    get: (key) => readFile(full(key)),
    remove: (key) => rm(full(key), { force: true }),
  };
}

function s3Storage(): Storage {
  const bucket = process.env.S3_BUCKET || "sierra-files";
  const client = new S3Client({
    region: process.env.S3_REGION || "eu-central-1",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: process.env.S3_ACCESS_KEY_ID
      ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "" }
      : undefined,
  });
  return {
    async put(key, body, contentType) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
    },
    async get(key) {
      const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      return Buffer.from(await res.Body!.transformToByteArray());
    },
    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}

export const storageDriver = process.env.STORAGE_DRIVER === "s3" ? "s3" : "fs";
export const storage: Storage = storageDriver === "s3" ? s3Storage() : fsStorage();
