/**
* This file is part of SudoBot.
* 
* Copyright (C) 2021-2022 OSN Inc.
*
* SudoBot is free software; you can redistribute it and/or modify it
* under the terms of the GNU Affero General Public License as published by 
* the Free Software Foundation, either version 3 of the License, or
* (at your option) any later version.
* 
* SudoBot is distributed in the hope that it will be useful, but
* WITHOUT ANY WARRANTY; without even the implied warranty of 
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the 
* GNU Affero General Public License for more details.
*
* You should have received a copy of the GNU Affero General Public License 
* along with SudoBot. If not, see <https://www.gnu.org/licenses/>.
*/

import { CommandInteraction, Emoji, GuildChannel, Message, TextChannel, User, Permissions, GuildMember } from 'discord.js';
import BaseCommand from '../../utils/structures/BaseCommand';
import DiscordClient from '../../client/Client';
import CommandOptions from '../../types/CommandOptions';
import InteractionOptions from '../../types/InteractionOptions';
import MessageEmbed from '../../client/MessageEmbed';
import getUser from '../../utils/getUser';
import { emoji, fetchEmoji } from '../../utils/Emoji';
import { hasPermission, shouldNotModerate } from '../../utils/util';

export default class ClearCommand extends BaseCommand {
    supportsInteractions: boolean = true;
    permissions = [Permissions.FLAGS.MANAGE_MESSAGES];

    constructor() {
        super('clear', 'moderation', []);
    }

    async run(client: DiscordClient, message: Message | CommandInteraction, options: CommandOptions | InteractionOptions) {
        if (!options.isInteraction && options.args[0] === undefined) {
            await message.reply({
                embeds: [
                    new MessageEmbed()
                    .setColor('#f14a60')
                    .setDescription('This command requires at least one argument.')
                ]
            });

            return;
        }

        let user: User | undefined | null;
        let msgCount = 0, channel: GuildChannel = message.channel! as GuildChannel;

        if (options.isInteraction) {
            if (options.options.getUser('user'))
                user = <User> options.options.getUser('user');

            console.log(user?.tag);            

            if (options.options.getChannel('channel')) {
                channel = <GuildChannel> options.options.getChannel('channel');

                if (channel.type !== 'GUILD_TEXT' && channel.type !== 'GUILD_NEWS' && channel.type !== 'GUILD_PUBLIC_THREAD' && channel.type !== 'GUILD_PRIVATE_THREAD') {
                    await message.reply({
                        content: 'Invalid channel given.'
                    });
                    
                    return;
                }
            }

            if (options.options.getInteger('count')) {
                msgCount = <number> options.options.getInteger('count');
            }
        }
        else {
            try {
                user = await getUser(client, message as Message, options);

                if (!user) {
                    throw new Error();
                }
            }
            catch (e) {
                console.log(e);
                
                await message.reply({
                    embeds: [
                        new MessageEmbed()
                        .setColor('#f14a60')
                        .setDescription('Invalid user given.')
                    ]
                });
    
                return;
            }
        }
        
        if (msgCount === 0 && !user) {
            await message.reply({
                embeds: [
                    new MessageEmbed()
                    .setColor('#f14a60')
                    .setDescription('You have to specify either the message count or the user.')
                ]
            });

            return;
        }

        let member: GuildMember | undefined, hasMutedRole = false;

        if (user) {
        	try {
        		const _member = await message.guild?.members.fetch(user.id);

				if (_member && !(await hasPermission(client, _member, message, null, "You don't have permission to clear messages from this user.")))
					return;

        		if (_member && shouldNotModerate(client, _member)) {
        			await message.reply({
      					embeds: [
        					{ description: "Cannot clear messages from this user: Operation not permitted" }
        				]
        			});
        			
        			return;
        		}

                member = _member;
                hasMutedRole = _member?.roles.cache.has(client.config.props[message.guild!.id].mute_role) ?? false;

                if (!hasMutedRole)
                    await _member?.roles.add(client.config.props[message.guild!.id].mute_role);

        	}
        	catch (e) {
        		console.log(e);
        	}
        }

        let count = 0;
        (global as any).deletingMessages = true;

        if (message instanceof Message)
            await message.react(emoji('loading')!);
        else 
            await message.deferReply({ ephemeral: true });

        if (msgCount === 0 && user) {
            console.log(user?.tag);
            
            let fetched;

            do {
                fetched = await (channel as TextChannel).messages.fetch({ limit: 100 });
                fetched = await fetched.filter(m => m.author.id === user!.id && m.id !== message!.id && (Date.now() - m.createdTimestamp) <= (2 * 7 * 24 * 60 * 60 * 1000));
                await (channel as TextChannel).bulkDelete(fetched);
                count += fetched.size;
                
                await new Promise(r => setTimeout(r, 900));
            }
            while (fetched.size >= 2);
        }
        else {
            let fetched = 0;
            let safeLimit = 0, safeLimit2 = 0;

            do {
                if (count >= msgCount || safeLimit >= 50) {
                    break;
                }

                try {
                    const data = await (channel as TextChannel).messages.fetch({ limit: 100 });

                    fetched = 0;

                    for await (const [, m] of data.entries()) {
                        try {
                            if (count >= msgCount || safeLimit2 > 200) {
                                break;
                            }

                            if (user && m.author?.id !== user?.id) {
                                continue;
                            }

                            if (message!.id === m.id || (Date.now() - m.createdTimestamp) > (2 * 7 * 24 * 60 * 60 * 1000))
                                continue;

                            if (m.deletable) {
                                console.log('here', user?.tag);
                                
                                await m.delete();

                                fetched++;
                                count++;
                                safeLimit2++;
                            }

                            if (count % 10 === 0) {
                                await new Promise(r => setTimeout(r, 1100));
                            }
                        }
                        catch(e) {
                            console.log(e);
                            safeLimit2 += 100;
                        }
                    }
                }
                catch(e) {
                    console.log(e);
                    
                    break;
                }

                safeLimit++;
            }
            while (fetched >= 2);
        }

        const reply = await message.channel?.send({
            embeds: [
                new MessageEmbed()
                .setColor('GREEN')
                .setDescription((await fetchEmoji('check') as Emoji).toString() + " Deleted " + count + " message(s)" + (user ? " from user " + user.tag : ''))
            ]
        });
        
        try {
            if (hasMutedRole)
                await member?.roles.remove(client.config.props[message.guild!.id].mute_role);
        }
        catch (e) {
            console.error(e);
        }

        if (message instanceof CommandInteraction) {
            await message.editReply({ content: "Operation completed." });
        }

        if (message instanceof Message)
            await message.react(emoji('check')!);

        setTimeout(async () => {
            try {
                if (message instanceof Message)
                    await message.delete();
            }
            catch (e) {
                console.log(e);                
            }
            
            try {
                await reply!.delete();
            }
            catch (e) {
                console.log(e);                
            }
        }, 5500);

        (global as any).deletingMessages = false;
    }
}
