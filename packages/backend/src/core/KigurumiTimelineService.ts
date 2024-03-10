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

type KigurumiTimelineOptions = {
    untilId: string | null,
    sinceId: string | null
}

@Injectable()
export class KigurumiTimelineService {
  constructor(

		@Inject(DI.redisForTimelines)
		private redisForTimelines: Redis.Redis,

		private notesRepository: NotesRepository,

    private fanoutTimelineService: FanoutTimelineService,
    private fanoutTimelineEndpointService: FanoutTimelineEndpointService,
		private queryService: QueryService,
  ) { }

  @bindThis
  public async pushTLIfKigurumi(note: MiNote) {
    if (await this.checkHitKigurumi(note)) {
      const r = this.redisForTimelines.pipeline();
      this.fanoutTimelineService.push('kigurumiTimeline', note.id, 100, r);
      r.exec();
    }
  }

  

  @bindThis
  public async get(me: MiLocalUser, options: KigurumiTimelineOptions){
    return await this.fanoutTimelineEndpointService.timeline({
      ...options,
      redisTimelines: ['kigurumiTimeline'],
      limit: 100,
      allowPartial: true,
      me: me,
      useDbFallback: true,
      excludePureRenotes: true,
      dbFallback: async (untilId, sinceId) => this.getFromDb({untilId, sinceId}, me)
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
  private async getFromDb(ps: {
		sinceId: string | null,
		untilId: string | null}, me: MiLocalUser){
      const limit = 100;
      const query = this.queryService.makePaginationQuery(this.notesRepository.createQueryBuilder('note'),
			ps.sinceId, ps.untilId)
			.andWhere('(note.visibility = \'public\')')
			.innerJoinAndSelect('note.user', 'user')
			.leftJoinAndSelect('note.reply', 'reply')
			.leftJoinAndSelect('note.renote', 'renote')
			.leftJoinAndSelect('reply.user', 'replyUser')
			.leftJoinAndSelect('renote.user', 'renoteUser');

      this.queryService.generateVisibilityQuery(query, me);
      if (me) this.queryService.generateMutedUserQuery(query, me);
      if (me) this.queryService.generateBlockedUserQuery(query, me);
      if (me) this.queryService.generateMutedUserRenotesQueryForNotes(query, me);

      // 添付ファイルを含む
      query.andWhere('note.fileIds != \'{}\'');

      // ハッシュタグにkigurumi, 着ぐるみを含む
      query.andWhere(new Brackets(qb => {
        query.where('note.tags @> :tag', {tag: '着ぐるみ'})
          .orWhere('note.tags @> :tag', {tag: 'kigurumi'})
      }));

		return await query.limit(limit).getMany();
  }
}