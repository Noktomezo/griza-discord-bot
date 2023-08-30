import { readFileSync } from 'node:fs'
import type { ActivitiesOptions, Guild, PresenceStatusData } from 'discord.js'
import { ActivityType } from 'discord.js'
import type { Griza } from '../Griza.js'
import { isDevMode, isFileValid, sleep } from '../utils/Utils.js'

export class PresenceManager {
	private _presences: string[]

	public constructor(
		public client: Griza,
		public presenceFilePath: string
	) {
		this._presences = []
		this._fetch()
		this.client.once('ready', async () => this.setUpdateInterval(5_000))
	}

	private _fetch() {
		if (!isFileValid(this.presenceFilePath)) return

		const presenceFile = readFileSync(this.presenceFilePath, 'utf8')
		this._presences = presenceFile
			.split('\n')
			.filter(Boolean)
			.map(s => s.trim())
	}

	public update(status: PresenceStatusData, activity: ActivitiesOptions) {
		this.client.user?.setPresence({ status, activities: [activity] })
	}

	public async setUpdateInterval(interval: number = 5_000) {
		for (let i = 0; i < this._presences.length; i++) {
			const name = await this.translate(this._presences[i])
			this.update('dnd', { name, type: ActivityType.Listening })

			if (i === this._presences.length - 1) i = 0
			await sleep(interval)
		}
	}

	public async translate(str: string) {
		const guildCount = await this._getGuildCount()
		const memberCount = await this._getMemberCount()
		const channelCount = await this._getChannelCount()

		return str
			.replaceAll('{GUILDS}', guildCount.toString() + ' guilds')
			.replaceAll('{MEMBERS}', memberCount.toString() + ' members')
			.replaceAll('{CHANNELS}', channelCount.toString() + ' channels')
	}

	private async _getGuildCount() {
		if (isDevMode()) return this.client.guilds.cache.size

		const results = await this.client.cluster!.broadcastEval(c => c.guilds.cache.size)
		return results.reduce((acc, c) => acc + c, 0)
	}

	private async _getMemberCount() {
		const getMemberCount = (c: Griza) => c.guilds.cache.map(g => g.memberCount).reduce((acc, c) => acc + c, 0)

		if (isDevMode()) return getMemberCount(this.client)

		const results = await this.client.cluster!.broadcastEval(getMemberCount)
		return results.reduce((acc, c) => acc + c, 0)
	}

	private async _getChannelCount() {
		const isInVoiceChannel = (g: Guild) => Number(g.members.me?.voice.channel ? 1 : 0)
		const getChannelCount = (c: Griza) => c.guilds.cache.map(isInVoiceChannel).reduce((acc, c) => acc + c, 0)

		if (isDevMode()) return getChannelCount(this.client)

		const results = await this.client.cluster!.broadcastEval(getChannelCount)
		return results.reduce((acc, c) => acc + c, 0)
	}
}
