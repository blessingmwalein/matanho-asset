import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Global, Injectable, Logger, Module, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Document byte storage. Three clearly separated adapters selected by STORAGE_DRIVER:
 *   local → files under LOCAL_STORAGE_DIR (development only; ephemeral on most hosts)
 *   s3    → private S3-compatible bucket (never public; downloads are streamed through the API)
 *   db    → bytes in PostgreSQL (DocumentBlob): fallback so files survive on hosts without S3
 * The DocumentVersion row records which driver holds the bytes, so drivers can be mixed over time.
 */
export type StorageDriver = 'local' | 's3' | 'db';

export interface StorageAdapter {
  readonly driver: StorageDriver;
  put(key: string, data: Buffer, mimeType: string, versionId: string): Promise<void>;
  get(key: string, versionId: string): Promise<Buffer>;
}

class LocalStorageAdapter implements StorageAdapter {
  readonly driver = 'local' as const;
  private readonly root = path.resolve(process.cwd(), env.LOCAL_STORAGE_DIR);

  private resolve(key: string) {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root)) throw new Error('Invalid storage key'); // path traversal guard
    return full;
  }
  async put(key: string, data: Buffer) {
    const full = this.resolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
  }
  async get(key: string) {
    try {
      return await fs.readFile(this.resolve(key));
    } catch {
      throw new NotFoundException('Stored file is missing from local storage (was the .storage folder cleared?)');
    }
  }
}

class S3StorageAdapter implements StorageAdapter {
  readonly driver = 's3' as const;
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    if (!env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
      throw new Error('STORAGE_DRIVER=s3 requires S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY');
    }
    this.bucket = env.S3_BUCKET;
    this.client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT || undefined,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
    });
  }
  async put(key: string, data: Buffer, mimeType: string) {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, ContentType: mimeType }));
  }
  async get(key: string) {
    const out = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const bytes = await out.Body?.transformToByteArray();
    if (!bytes) throw new NotFoundException('Stored object not found');
    return Buffer.from(bytes);
  }
}

class DbStorageAdapter implements StorageAdapter {
  readonly driver = 'db' as const;
  constructor(private readonly prisma: PrismaService) {}
  async put(_key: string, data: Buffer, _mime: string, versionId: string) {
    const bytes = new Uint8Array(data); // copy into an ArrayBuffer-backed array (Prisma Bytes type)
    await this.prisma.documentBlob.upsert({
      where: { versionId },
      create: { versionId, data: bytes },
      update: { data: bytes },
    });
  }
  async get(_key: string, versionId: string) {
    const blob = await this.prisma.documentBlob.findUnique({ where: { versionId } });
    if (!blob) throw new NotFoundException('Stored file not found');
    return Buffer.from(blob.data);
  }
}

@Injectable()
export class StorageService {
  private readonly log = new Logger('Storage');
  private readonly adapters = new Map<StorageDriver, StorageAdapter>();
  readonly activeDriver: StorageDriver;

  constructor(private readonly prisma: PrismaService) {
    this.activeDriver = env.STORAGE_DRIVER;
    this.log.log(`Document storage driver: ${this.activeDriver}`);
    this.adapterFor(this.activeDriver); // fail fast on misconfiguration
  }

  adapterFor(driver: StorageDriver): StorageAdapter {
    let a = this.adapters.get(driver);
    if (!a) {
      a = driver === 's3' ? new S3StorageAdapter() : driver === 'db' ? new DbStorageAdapter(this.prisma) : new LocalStorageAdapter();
      this.adapters.set(driver, a);
    }
    return a;
  }

  get active(): StorageAdapter {
    return this.adapterFor(this.activeDriver);
  }
}

@Global()
@Module({ providers: [StorageService], exports: [StorageService] })
export class StorageModule {}
