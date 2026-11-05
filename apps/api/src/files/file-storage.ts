import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '../config/config.service.js';

/** The rest of the code only uses this, so moving to another store means one new class. */
export abstract class FileStorage {
  abstract save(key: string, content: Buffer): Promise<void>;
  /** Returns null when the file is gone. */
  abstract read(key: string): Promise<Buffer | null>;
  abstract remove(key: string): Promise<void>;
}

const isMissing = (error: unknown) => (error as { code?: string }).code === 'ENOENT';

@Injectable()
export class DiskFileStorage extends FileStorage {
  private readonly root: string;

  constructor(config: ConfigService) {
    super();
    this.root = resolve(config.env.UPLOAD_DIR);
  }

  async save(key: string, content: Buffer): Promise<void> {
    await mkdir(this.root, { recursive: true });
    await writeFile(join(this.root, key), content, { flag: 'wx', mode: 0o600 });
  }

  async read(key: string): Promise<Buffer | null> {
    try {
      return await readFile(join(this.root, key));
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  async remove(key: string): Promise<void> {
    await rm(join(this.root, key), { force: true });
  }
}
