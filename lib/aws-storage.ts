import "server-only";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export const awsStorageBucket = process.env.WEEKEND_STORAGE_BUCKET;
const s3 = new S3Client({});

export async function readAwsObject(key: string): Promise<string> {
  const response = await s3.send(new GetObjectCommand({
    Bucket: awsStorageBucket,
    Key: key,
  }));
  if (!response.Body) throw new Error("Weekend storage returned an empty object.");
  return response.Body.transformToString("utf-8");
}

export async function writeAwsObject(
  key: string,
  body: string,
  contentType: string,
  overwrite: boolean,
): Promise<string> {
  await s3.send(new PutObjectCommand({
    Bucket: awsStorageBucket,
    Key: key,
    Body: body,
    ContentType: contentType,
    IfNoneMatch: overwrite ? undefined : "*",
  }));
  return `s3://${awsStorageBucket}/${key}`;
}
