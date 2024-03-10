import { FanoutTimelineService } from '@/core/FanoutTimelineService.js';
import { FanoutTimelineEndpointService } from './FanoutTimelineEndpointService.js';
import { MiNote } from '@/models/Note.js';
import { bindThis } from '@/decorators.js';
import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { DI } from '@/di-symbols.js';
import type { MiLocalUser } from '@/models/User.js';
import { QueryService } from './QueryService.js';
import type { NotesRepository } from '@/models/_.js';
import { Brackets } from 'typeorm';
import { GlobalEventService } from './GlobalEventService.js';
import Logger from '@/logger.js';
import { LoggerService } from '@/core/LoggerService.js';
import { toSingle } from '@/misc/prelude/array.js';

type KigurumiTimelineOptions = {
  untilId: string | null,
  sinceId: string | null
}

@Injectable()
export class KigurumiTimelineService {
  private logger: Logger;

  constructor(
    @Inject(DI.redisForTimelines)
    private redisForTimelines: Redis.Redis,

    @Inject(DI.notesRepository)
    private notesRepository: NotesRepository,

    private globalEventService: GlobalEventService,
    private fanoutTimelineService: FanoutTimelineService,
    private fanoutTimelineEndpointService: FanoutTimelineEndpointService,
    private queryService: QueryService,
    private loggerService: LoggerService,
  ) {
    this.logger = this.loggerService.getLogger('kigurumiStream')
  }

  @bindThis
  public async pushTLIfKigurumi(note: MiNote) {
    if (await this.checkHitKigurumi(note)) {
      const r = this.redisForTimelines.pipeline();
      this.fanoutTimelineService.push('kigurumiTimeline', note.id, 100, r);
      r.exec();

      this.globalEventService.publishKigurumiStream('note', note);
    }
  }

  @bindThis
  public async get(me: MiLocalUser, options: KigurumiTimelineOptions) {
    return await this.fanoutTimelineEndpointService.timeline({
      ...options,
      redisTimelines: ['kigurumiTimeline'],
      limit: 100,
      allowPartial: true,
      me: me,
      useDbFallback: true,
      excludePureRenotes: true,
      dbFallback: async (untilId, sinceId) => this.getFromDb({ untilId, sinceId }, me)
    })
  }

  @bindThis
  private async checkHitKigurumi(note: MiNote) {
    // 公開範囲がホーム以下のものは収載しない
    if (note.visibility === 'specified' ||
      note.visibility === 'followers' ||
      note.visibility === 'home') return false;

    const hasFile = note.fileIds.length > 0
    const hasKigurumiHashTag = note.tags.includes('kigurumi') || note.tags.includes('着ぐるみ');

    // 添付ファイルがついていてハッシュタグに#kigurumi, #着ぐるみを含むか
    return hasFile && hasKigurumiHashTag;
  }

  @bindThis
  public async getFromDb(ps: {
    sinceId: string | null,
    untilId: string | null,
    userId?: string
  }, me: MiLocalUser) {
    const limit = 100;
    const query = this.queryService.makePaginationQuery(this.notesRepository.createQueryBuilder('note'),
      ps.sinceId, ps.untilId)
      .andWhere('(note.visibility = \'public\')')
      .innerJoinAndSelect('note.user', 'user')
      .leftJoinAndSelect('note.reply', 'reply')
      .leftJoinAndSelect('note.renote', 'renote')
      .leftJoinAndSelect('reply.user', 'replyUser')
      .leftJoinAndSelect('renote.user', 'renoteUser');

    if(ps.userId){

    }
    this.queryService.generateVisibilityQuery(query, me);
    if (me) this.queryService.generateMutedUserQuery(query, me);
    if (me) this.queryService.generateBlockedUserQuery(query, me);
    if (me) this.queryService.generateMutedUserRenotesQueryForNotes(query, me);

    // 添付ファイルを含む
    query.andWhere('note.fileIds != \'{}\'');

    // ハッシュタグにkigurumi, 着ぐるみを含む
    query.where('note.tags && :tag', { tag: ['着ぐるみ', 'kigurumi'] })

    return await query.limit(limit).getMany();
  }
}