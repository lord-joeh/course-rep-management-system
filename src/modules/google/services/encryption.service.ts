import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";

@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly key: Buffer;
  private readonly algorithm = "aes-256-gcm";

  constructor(private readonly configService: ConfigService) {
    const rawKey =
      this.configService.get<string>("ENCRYPTION_KEY") ||
      process.env.ENCRYPTION_KEY ||
      this.configService.get<string>("JWT_ACCESS_SECRET") ||
      process.env.JWT_ACCESS_SECRET ||
      "cr_default_secure_vault_encryption_key_2026";

    // Strictly derive 32-byte (256-bit) binary key via SHA-256
    this.key = crypto.createHash("sha256").update(rawKey).digest();
  }

  /**
   * Encrypt plaintext into an authenticated AES-256-GCM string (iv:tag:ciphertext).
   */
  encrypt(plainText: string): string {
    if (!plainText) {
      return plainText;
    }

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

    const encrypted = Buffer.concat([
      cipher.update(plainText, "utf8"),
      cipher.final(),
    ]);

    const tag = cipher.getAuthTag();

    return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
  }

  /**
   * Decrypt authenticated AES-256-GCM ciphertext payload back to plaintext.
   */
  decrypt(cipherPayload: string): string {
    if (!cipherPayload) {
      return cipherPayload;
    }

    const parts = cipherPayload.split(":");
    if (parts.length !== 3) {
      throw new Error(
        'Invalid encrypted payload format. Expected "ivHex:tagHex:cipherHex"',
      );
    }

    const [ivHex, tagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const encrypted = Buffer.from(encryptedHex, "hex");

    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  }
}
