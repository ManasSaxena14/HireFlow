import { Controller, Get, Param, ParseUUIDPipe, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { Public } from '../common/access.js';
import { notFound } from '../common/domain-error.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { Database } from '../database/database.js';
import { FileLinks } from './file-links.js';
import { FileStorage } from './file-storage.js';

const linkSchema = z.object({
  expires: z.coerce.number().int(),
  signature: z.string().min(1).max(100),
});

@Controller('files')
export class FilesController {
  constructor(
    private readonly db: Database,
    private readonly links: FileLinks,
    private readonly storage: FileStorage,
  ) {}

  /** The signed link is the permission here, so that a normal browser download works. */
  @Get(':id')
  @Public()
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodPipe(linkSchema)) link: z.infer<typeof linkSchema>,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!this.links.isValid(id, link.expires, link.signature)) throw notFound('File');

    const file = await this.db
      .selectFrom('files')
      .select(['storageKey', 'originalName', 'mimeType'])
      .where('id', '=', id)
      .executeTakeFirst();
    const content = file && (await this.storage.read(file.storageKey));
    if (!file || !content) throw notFound('File');

    response.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(content, {
      type: file.mimeType,
      length: content.length,
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
    });
  }
}
