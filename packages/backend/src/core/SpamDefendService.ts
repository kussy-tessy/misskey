import { Inject, Injectable } from '@nestjs/common';
import { MiUser } from '@/models/User.js';
import type { OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { UserEntityService } from './entities/UserEntityService.js';
import { bindThis } from '@/decorators.js';
import { FederatedInstanceService } from '@/core/FederatedInstanceService.js';
import { MiNote } from '@/models/Note.js';
import Logger from '@/logger.js';
import { LoggerService } from '@/core/LoggerService.js';

export type InspectActivityArg =
  { type: 'create', mentionedUsersCount: number, text: string|null } |
  { type: 'like', targetNote: MiNote }

@Injectable()
export class SpamDefendService implements OnApplicationShutdown, OnModuleInit {
  private logger: Logger;

  private threshold = 50;
  private recentTime = 1000 * 2 * 24 * 60 * 60;

  constructor(
    private userEntityService: UserEntityService,
    private instanceService: FederatedInstanceService,
    private loggerService: LoggerService,
  ) {
    this.logger = this.loggerService.getLogger('spam-defend');
  }

  @bindThis
  public async isSpamlike(user: { id: MiUser['id'], host: MiUser['host'] }, activity: InspectActivityArg) {
    const userScore = await this.calcSuspiciousUserScore(user);
    if (userScore.score === 0) return false;

    const instanceScore = await this.calcSuspiciousInstanceScore(user.host);
    const activityScore = await this.calcSuspiciousActivity(activity);

    const score = userScore.score + instanceScore + activityScore;
    this.logger.info(`[SumScore] name: ${userScore.name}, username: ${userScore.username}, host: ${user.host}, score: ${score}`)
    return score > this.threshold;
  }

  @bindThis
  private async calcSuspiciousUserScore(user: { id: MiUser['id'], host: MiUser['host'] }): Promise<{
    name?: string|null, username?: string, score: number
  }> {
    // ローカルユーザーOK
    if (!user.host) return {score: 0};

    let score = 0
    const packedUser = await this.userEntityService.pack(user.id, null, { schema: 'UserDetailed' });

    // フォロワーのいるリモートユーザーOK
    if (packedUser.followersCount > 0) return {score: 0};

    // 初観測が2日以内
    const isRecentlyFirstObserved = Date.now() - new Date(packedUser.createdAt).getTime() < this.recentTime;

    // アバターがない
    const hasNoAvatar = packedUser.avatarUrl?.includes('identicon');

    // 名前とIDが一致
    const hasTekitoName = packedUser.name === packedUser.username || packedUser.name == null;

    // 自己紹介がない
    const hasNoDescription = packedUser.description == null || packedUser.description.length === 0;

    if (isRecentlyFirstObserved) score += 5;
    if (hasNoAvatar) score += 15;
    if (hasTekitoName) score += 10;
    if (hasNoDescription) score += 10;

    this.logger.info(`[UserScore] name: ${packedUser.name}, user: ${packedUser.username}, host: ${packedUser.host}, score: ${score}`);

    return {name: packedUser.name, username: packedUser.username, score: score};
  }

  @bindThis
  private async calcSuspiciousInstanceScore(host: string | null): Promise<number> {
    // ローカルユーザーOK
    if (!host) return 0;

    // ホワイトリストに含まれていれば調べるまでもなくOK
    const reliableInstances = ['misskey.io', 'fedibird.com', 'mkkey.net', 'p1.a9z.dev', 'himagine.club',
      'm.tkngh.jp', 'misskey-square.net', 'homoo.social'];
    if (reliableInstances.includes(host)) return 0;

    let score = 0
    const instance = await this.instanceService.fetch(host);

    // フォロワーがいるサーバーなら調べるまでもなくOK
    if (instance.followersCount > 0) return 0;

    const firstObserved = new Date(instance.firstRetrievedAt);

    // 最近初観測した
    const isFirstObservationRecent = Date.now() - firstObserved.getTime() < this.recentTime;

    // スパム騒動以降で初観測した
    const isFisrtObservationAfterSpamFestival = firstObserved.getTime() > new Date('2024/2/10').getTime();

    // 説明に日本語を含まない
    const hasNoJapaneseDescription = !instance.description?.match(/[ぁ-んァ-ヶー一-龯]/);

    if (isFirstObservationRecent) score += 5;
    if (isFisrtObservationAfterSpamFestival) score += 5;
    if (hasNoJapaneseDescription) score += 20;

    this.logger.info(`[InstanceScore] instance: ${instance.host}, score: ${score}`);

    return score;
  }

  @bindThis
  private async calcSuspiciousActivity(arg: InspectActivityArg): Promise<number> {
    let score = 0;
    if (arg.type === 'create') {
      if (arg.mentionedUsersCount === 0) {
        // メンションなし
        score += 0;
      } else if (arg.mentionedUsersCount === 1) {
        // メンション1つ
        score += 5;
      } else if (arg.mentionedUsersCount === 2) {
        // メンション2つ
        score += 10;
      } else {
        // メンションが3つ以上
        score += 20;
      }
    }

    if (arg.type === 'like') {
      if (arg.targetNote.renoteCount <= 5) {
        // リノートが5以下のノートへのリアクション
        score += 5
      }
    }

    this.logger.info(`[ActivityScore] arg: ${arg}, score: ${score}`);

    return score;
  }
}