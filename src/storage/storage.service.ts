import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import * as sharp from 'sharp';

type ImageFolder = 'banners' | 'avatars';

interface UploadImageOptions {
  buffer: Buffer;
  mimetype: string;
  folder: ImageFolder;
  oldKey?: string | null;
}

@Injectable()
export class StorageService {
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;

  constructor(private config: ConfigService) {
    this.s3 = new S3Client({
      endpoint: config.get<string>('STORAGE_ENDPOINT'),
      region: config.get<string>('STORAGE_REGION') ?? 'us-east-1',
      credentials: {
        accessKeyId: config.get<string>('STORAGE_ACCESS_KEY')!,
        secretAccessKey: config.get<string>('STORAGE_SECRET_KEY')!,
      },
      forcePathStyle: true,
    });
    this.bucket = config.get<string>('STORAGE_BUCKET')!;
    this.publicUrl = config.get<string>('STORAGE_PUBLIC_URL')!;
  }

  async uploadImage(
    opts: UploadImageOptions,
  ): Promise<{ url: string; key: string }> {
    const { buffer, mimetype, folder, oldKey } = opts;

    let meta: sharp.Metadata;
    try {
      meta = await sharp(buffer).metadata();
    } catch {
      throw new BadRequestException('File bukan gambar yang valid');
    }

    const allowedFormats = ['jpeg', 'png', 'webp', 'jpg'];
    if (!allowedFormats.includes(meta.format ?? '')) {
      throw new BadRequestException(
        'Hanya file JPEG, JPG, PNG, atau WebP yang diizinkan',
      );
    }

    const processed = await this.processImage(buffer, folder);
    const key = `${folder}/${crypto.randomUUID()}.webp`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: processed,
        ContentType: 'image/webp',
      }),
    );

    if (oldKey) {
      await this.deleteImage(oldKey).catch(() => null);
    }

    return { url: `${this.publicUrl}/${key}`, key };
  }

  async deleteImage(key: string): Promise<void> {
    await this.s3.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  extractKeyFromUrl(url: string | null): string | null {
    if (!url) return null;
    const prefix = `${this.publicUrl}/`;
    if (!url.startsWith(prefix)) return null;
    return url.slice(prefix.length);
  }

  private async processImage(
    buffer: Buffer,
    folder: ImageFolder,
  ): Promise<Buffer> {
    const base = sharp(buffer);
    if (folder === 'banners') {
      return base
        .resize(1200, 630, { fit: 'cover' })
        .webp({ quality: 85 })
        .toBuffer();
    }
    return base
      .resize(400, 400, { fit: 'cover' })
      .webp({ quality: 90 })
      .toBuffer();
  }
}
