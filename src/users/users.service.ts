import {
  Injectable,
  NotFoundException,
  // BadRequestException, // [NONAKTIF-R2] dipakai deleteAvatar
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
// import { StorageService } from '../storage/storage.service'; // [NONAKTIF-R2]

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    // private storage: StorageService, // [NONAKTIF-R2]
  ) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        phoneNo: true,
        city: true,
        role: true,
        avatarUrl: true,
        isEmailVerified: true,
        createdAt: true,
      },
    });
    if (!user) throw new NotFoundException('User tidak ditemukan');
    return user;
  }

  /* [NONAKTIF-R2] mulai — upload/hapus avatar butuh object storage
  async uploadAvatar(userId: string, buffer: Buffer, mimetype: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    });
    if (!user) throw new NotFoundException('User tidak ditemukan');

    const oldKey = this.storage.extractKeyFromUrl(user.avatarUrl);
    const { url } = await this.storage.uploadImage({
      buffer,
      mimetype,
      folder: 'avatars',
      oldKey,
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: url },
    });

    return { message: 'Avatar berhasil diupload', avatarUrl: url };
  }

  async deleteAvatar(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    });
    if (!user) throw new NotFoundException('User tidak ditemukan');
    if (!user.avatarUrl) {
      throw new BadRequestException('User tidak memiliki avatar');
    }

    const key = this.storage.extractKeyFromUrl(user.avatarUrl);
    if (key) await this.storage.deleteImage(key);

    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: null },
    });

    return { message: 'Avatar berhasil dihapus' };
  }
  [NONAKTIF-R2] selesai */
}
