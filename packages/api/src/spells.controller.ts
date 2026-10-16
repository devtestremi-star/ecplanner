import { BadRequestException, Controller, Get, Header, Headers, NotFoundException, Param, ParseIntPipe, Query, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { WowheadService, type SpellInfo, type SpellSummary } from './wowhead.service.js';

@Controller('spells')
export class SpellsController {
  constructor(private readonly wowhead: WowheadService) {}

  /**
   * Catalogue complet sans tooltip — 5 Ko gzip, chargé une fois au démarrage du front.
   *
   * `no-cache` ne veut pas dire « ne pas cacher » : le navigateur garde la réponse mais
   * revalide à chaque fois. Avec l'ETag, un catalogue inchangé coûte un 304 de quelques
   * octets, et un seed est pris en compte immédiatement. Un `max-age` seul faisait servir
   * un catalogue périmé pendant 24 h après un ajout de sort.
   */
  @Get('catalog')
  @Header('Cache-Control', 'public, no-cache')
  async catalog(
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<{ spells: SpellSummary[] } | undefined> {
    const etag = await this.wowhead.getCatalogEtag();
    void res.header('ETag', etag);
    if (ifNoneMatch === etag) {
      void res.status(304);
      return undefined;
    }
    return { spells: await this.wowhead.getCatalog() };
  }

  /** Le tooltip d'un sort, servi depuis la base et rafraîchi chez Wowhead si périmé. */
  @Get(':spellId/tooltip')
  @Header('Cache-Control', 'public, max-age=3600')
  async tooltip(@Param('spellId', ParseIntPipe) spellId: number): Promise<{ spellId: number; tooltipHtml: string | null }> {
    const res = await this.wowhead.getTooltip(spellId);
    if (!res) throw new NotFoundException(`Sort ${spellId} inconnu`);
    return res;
  }

  /**
   * Tout ce que la timeline doit savoir d'un sort : nom, icône, catégorie, tooltip.
   * Une run compte 18 à 32 sorts distincts — un seul appel suffit à la peupler.
   */
  @Get()
  async byIds(@Query('ids') ids?: string): Promise<{ spells: SpellInfo[] }> {
    if (!ids) throw new BadRequestException('Paramètre `ids` manquant');
    const parsed = [...new Set(ids.split(',').map((s) => Number(s.trim())))].filter(
      (n) => Number.isInteger(n) && n > 0,
    );
    if (!parsed.length) throw new BadRequestException('Aucun spellId valide');
    if (parsed.length > 200) throw new BadRequestException('200 ids au maximum');
    return { spells: await this.wowhead.getSpells(parsed) };
  }
}
