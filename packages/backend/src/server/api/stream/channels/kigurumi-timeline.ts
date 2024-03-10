/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { isUserRelated } from '@/misc/is-user-related.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { bindThis } from '@/decorators.js';
import type { GlobalEvents } from '@/core/GlobalEventService.js';
import Channel, { type MiChannelService } from '../channel.js';

class KigurumiChannel extends Channel {
	public readonly chName = 'kigurumi';
	public static shouldShare = false;
	public static requireCredential = true as const;
	public static kind = 'read:account';
	// private antennaId: string;

	constructor(
		private noteEntityService: NoteEntityService,

		id: string,
		connection: Channel['connection'],
	) {
		super(id, connection);
		//this.onEvent = this.onEvent.bind(this);
	}

	@bindThis
	public async init(params: any) {
		// this.antennaId = params.antennaId as string;

		// Subscribe stream
		this.subscriber.on(`kigurumiStream`, this.onEvent);
	}

	@bindThis
	private async onEvent(data: GlobalEvents['kigurumi']['payload']) {
		if (data.type === 'note') {
			const note = await this.noteEntityService.pack(data.body.id, this.user, { detail: true });

			// 流れてきたNoteがミュートしているユーザーが関わるものだったら無視する
			if (isUserRelated(note, this.userIdsWhoMeMuting)) return;
			// 流れてきたNoteがブロックされているユーザーが関わるものだったら無視する
			if (isUserRelated(note, this.userIdsWhoBlockingMe)) return;

			if (note.renote && !note.text && isUserRelated(note, this.userIdsWhoMeMutingRenotes)) return;

			this.connection.cacheNote(note);

			this.send('note', note);
		} else {
			this.send(data.type, data.body);
		}
	}

	@bindThis
	public dispose() {
		// Unsubscribe events
		this.subscriber.off(`kigurumiStream`, this.onEvent);
	}
}

@Injectable()
export class KigurumiTimelineChannelService implements MiChannelService<true> {
	public readonly shouldShare = KigurumiChannel.shouldShare;
	public readonly requireCredential = KigurumiChannel.requireCredential;
	public readonly kind = KigurumiChannel.kind;

	constructor(
		private noteEntityService: NoteEntityService,
	) {
	}

	@bindThis
	public create(id: string, connection: Channel['connection']): KigurumiChannel {
		return new KigurumiChannel(
			this.noteEntityService,
			id,
			connection,
		);
	}
}
