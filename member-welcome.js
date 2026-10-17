import {Events,EmbedBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle,PermissionFlagsBits,ChannelType} from 'discord.js';
import {brandPayload} from './branding.js';
export const WELCOME_CHANNEL_ID='1522093056944242780';
export const JOIN_ROLE_ID='1522093054377328731';
const installed=new WeakSet();
export function createMemberWelcome({guildId,frontendUrl,logger=console}){
 const recent=new Map();
 return async function memberWelcome(member){
  if(member.guild.id!==guildId||member.user.bot)return {skipped:true};
  const key=member.id+':'+member.joinedTimestamp;
  if(recent.has(key))return {skipped:true};
  const now=Date.now();recent.set(key,now);
  for(const [id,at] of recent)if(now-at>60000)recent.delete(id);
  const result={role:false,welcome:false};
  // Failure in role permissions must not suppress the welcome, or vice versa.
  try{
   if(member.roles.cache.has(JOIN_ROLE_ID))result.role=true;
   else{
    const me=member.guild.members.me||await member.guild.members.fetchMe();
    const role=await member.guild.roles.fetch(JOIN_ROLE_ID);
    if(!role)throw Error('Join role was not found');
    if(!me.permissions.has(PermissionFlagsBits.ManageRoles))throw Error('Bot needs Manage Roles');
    if(!role.editable)throw Error('Move the bot role above '+JOIN_ROLE_ID+'; the join role must be manageable');
    await member.roles.add(role,'NEXUS automatic member join role');result.role=true;
   }
  }catch(error){logger.error('[NEXUS auto-role]',member.id,error.message);}
  try{
   const channel=await member.guild.channels.fetch(WELCOME_CHANNEL_ID);
   if(!channel||![ChannelType.GuildText,ChannelType.GuildAnnouncement].includes(channel.type))throw Error('Welcome channel is missing or not a text channel');
   const me=member.guild.members.me||await member.guild.members.fetchMe();
   if(!channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks]))throw Error('Welcome channel needs View Channel, Send Messages and Embed Links');
   const embed=new EmbedBuilder().setTitle('نورت مدينتنا ❤️').setDescription(`أهلًا <@${member.id}>، مبسوطين إنك بقيت معانا في **NEXUS**.\nاقرأ القوانين، جهّز شخصيتك، وابدأ حكايتك.\nولو محتاج مساعدة، فريق الدعم موجود ليك.`)
    .addFields({name:'عدد أعضاء المجتمع',value:String(member.guild.memberCount),inline:true})
    .setFooter({text:'NEXUS ROLEPLAY • كل حكاية بتبدأ بخطوة'}).setTimestamp();
   const row=new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel('قوانين مدينتنا').setStyle(ButtonStyle.Link).setURL(frontendUrl+'/#rules'),
    new ButtonBuilder().setLabel('قدّم على الدخول').setStyle(ButtonStyle.Link).setURL(frontendUrl+'/#apply')
   );
   await channel.send(brandPayload({content:`أهلًا بيك <@${member.id}> ❤️`,embeds:[embed],components:[row],allowedMentions:{parse:[],users:[member.id]}},frontendUrl));
   result.welcome=true;
  }catch(error){logger.error('[NEXUS welcome]',member.id,error.message);}
  return result;
 };
}
export function installMemberWelcome(client,options){
 if(installed.has(client))return;
 installed.add(client);
 const handler=createMemberWelcome(options);
 client.on(Events.GuildMemberAdd,member=>handler(member).catch(error=>(options.logger||console).error('[NEXUS member welcome]',error.message)));
}
