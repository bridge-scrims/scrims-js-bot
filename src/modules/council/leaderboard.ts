import { EmbedBuilder, Guild, inlineCode, userMention } from "discord.js"
import { BotMessage, BotModule, Config, MessageOptionsBuilder, PositionRole, ScrimsBot, Vouch } from "lib"

import { Positions, RANKS } from "@Constants"

for (const rank of Object.values(RANKS)) {
    BotMessage({
        name: `${rank} Council Leaderboard`,
        permissions: { positionLevel: Positions.Staff },
        async builder(builder, member) {
            return LeaderboardFeature.getInstance().buildMessage(member.guild!, rank)
        },
    })

    Config.declareType(`${rank} Council Leaderboard Message`)
}

export class LeaderboardFeature extends BotModule {
    protected async onReady() {
        setInterval(() => this.update().catch(console.error), 60 * 1000)
        this.bot.on("initialized", () => this.update().catch(console.error))
    }

    async update() {
        await Promise.all(
            Object.values(RANKS).map((rank) =>
                Promise.all(
                    this.bot.getConfig(`${rank} Council Leaderboard Message`).map(async (entry) => {
                        const [channelId, messageId] = entry.value.split("-")
                        if (!channelId || !messageId) return
                        const channel = await this.bot.channels.fetch(channelId)
                        if (!channel?.isTextBased()) return
                        const message = await channel.messages.fetch(messageId).catch(() => null)
                        if (!message) return
                        const updated = await this.buildMessage(message.guild!, rank)
                        if (message.embeds?.[0]?.description !== (updated.embeds[0] as any).description)
                            await message
                                .edit(updated)
                                .catch((err: unknown) =>
                                    console.error(`Council Leaderboard Update Failed: ${err}`),
                                )
                    }),
                ).catch(console.error),
            ),
        )
    }

    async buildMessage(guild: Guild, role: string) {
        const embed = new EmbedBuilder().setTitle(`${role} Council Leaderboard`)

        const council = ScrimsBot.INSTANCE?.host?.members?.cache.filter(
            (m) => ScrimsBot.INSTANCE?.permissions.hasPosition(m, `${role} Council`),
        )

        const councilRole = PositionRole.getRoles(`${role} Council`, guild.id)[0]
        if (councilRole) embed.setColor(councilRole.color)

        const vouches = await Vouch.find({ position: role })
        const councilVouches: Record<string, Vouch[]> = {}
        const councilVouchesPositive: Record<string, Vouch[]> = {}
        const councilVouchesNegative: Record<string, Vouch[]> = {}
        for (const vouch of vouches) {
            const key = vouch.executorId
            if (councilVouches[key]?.push(vouch) === undefined) {
                councilVouches[key] = [vouch]
            }

            if (vouch.isPositive()) {
                if (councilVouchesPositive[key]?.push(vouch) === undefined) {
                    councilVouchesPositive[key] = [vouch]
                }
            } else {
                if (councilVouchesNegative[key]?.push(vouch) === undefined) {
                    councilVouchesNegative[key] = [vouch]
                }
            }
        }

        const getLength = (id: string, map: Record<string, unknown[]>) => map[id]?.length ?? 0

        embed.setDescription(
            council
                ?.sort((a, b) => getLength(b.id, councilVouches) - getLength(a.id, councilVouches))
                .map((council) => {
                    return (
                        inlineCode("•") +
                        " " +
                        userMention(council.id) +
                        " | " +
                        `✅ ${getLength(council.id, councilVouchesPositive)}` +
                        " | " +
                        `⛔ ${getLength(council.id, councilVouchesNegative)}`
                    )
                })
                .join("\n") || "None",
        )

        if (council?.size) embed.setFooter({ text: "Discord | Vouches | Devouches" })

        return new MessageOptionsBuilder().addEmbeds(embed)
    }
}

export default LeaderboardFeature.getInstance()
