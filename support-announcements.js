import {createReadStream} from 'node:fs';
import {Events, EmbedBuilder, SlashCommandBuilder, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, PermissionFlagsBits} from 'discord.js';
import {joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus, entersState, StreamType} from '@discordjs/voice';
import {fileURLToPath} from 'node:url';
export const SUPPORT_CHANNEL='1522093063072383138';
export const ANNOUNCE_ROLE='1560384331858452560';
export const greeting='مرحبًا بك في الدعم الفني الخاص بسيرفر ليجند. يرجى الانتظار، وسيكون أحد أعضاء الدعم معك قريبًا.';
export const canAnnounce=member=>Boolean(member?.roles?.cache?.has(ANNOUNCE_ROLE));
export function announcementEmbed(title,text,icon){
 const e=new EmbedBuilder().setColor(0x168BFF).setAuthor({name:'LEGEND ROLEPLAY',...(icon?{iconURL:icon}:{})}).setTitle(title).setDescription(text).setFooter({text:'LEGEND RP Official Announcement'}).setTimestamp();
 return e;
}
export function installSupportAnnouncements(client,guildId){
 let connection, connecting, queue=[], playing=false;
 const cooldown=new Map();
 const player=createAudioPlayer();
 const log=e=>console.error('[LEGEND support]',e?.message||e);
 const audio=fileURLToPath(new URL('./welcome.ogg',import.meta.url));
 async function connect(){
  if(connection?.state.status===VoiceConnectionStatus.Ready&&client.guilds.cache.get(guildId)?.members.me?.voice.channelId===SUPPORT_CHANNEL)return connection;
  if(connecting)return connecting;
  connecting=(async()=>{
   const channel=await client.channels.fetch(SUPPORT_CHANNEL);
   if(!channel||channel.guild.id!==guildId||channel.type!==ChannelType.GuildVoice)throw Error('Support channel is not a guild voice channel');
   if(connection&&connection.state.status!==VoiceConnectionStatus.Destroyed)connection.destroy();
   connection=joinVoiceChannel({channelId:channel.id,guildId:channel.guild.id,adapterCreator:channel.guild.voiceAdapterCreator,selfDeaf:true,selfMute:false});
   connection.on('error',log);
   connection.on(VoiceConnectionStatus.Disconnected,()=>{setTimeout(()=>connect().catch(log),5000).unref();});
   await entersState(connection,VoiceConnectionStatus.Ready,20000);connection.subscribe(player);return connection;
  })().finally(()=>{connecting=null});
  return connecting;
 }
 async function next(){
  if(playing||!queue.length)return;
  const id=queue.shift();
  try{
   await connect();
   const guild=client.guilds.cache.get(guildId);
   if(guild?.voiceStates.cache.get(id)?.channelId!==SUPPORT_CHANNEL)return void next();
   playing=true;player.play(createAudioResource(createReadStream(audio),{inputType:StreamType.OggOpus}));
  }catch(e){playing=false;log(e);if(queue.length)setTimeout(next,1000).unref();}
 }
 player.on(AudioPlayerStatus.Idle,()=>{playing=false;next();});
 player.on('error',e=>{playing=false;log(e);next();});
 client.once(Events.ClientReady,async()=>{
  try{
   const guild=await client.guilds.fetch(guildId);
   const command=new SlashCommandBuilder().setName('اعلان').setDescription('إرسال إعلان رسمي باسم ليجند').setDefaultMemberPermissions(0n)
    .addChannelOption(o=>o.setName('الروم').setDescription('روم إرسال الإعلان').addChannelTypes(ChannelType.GuildText,ChannelType.GuildAnnouncement).setRequired(true));
   await guild.commands.create(command.toJSON());
   console.log('[LEGEND] /اعلان registered. Enable role access in Server Settings > Integrations.');
  }catch(e){log(e)}
  connect().catch(log);
  setInterval(()=>connect().catch(log),30000).unref();
 });
 client.on(Events.VoiceStateUpdate,(oldState,newState)=>{
  if(newState.id===client.user?.id){if(oldState.channelId===SUPPORT_CHANNEL&&newState.channelId!==SUPPORT_CHANNEL)setTimeout(()=>connect().catch(log),3000).unref();return;}
  if(newState.guild.id!==guildId||newState.member?.user.bot||newState.channelId!==SUPPORT_CHANNEL||oldState.channelId===SUPPORT_CHANNEL)return;
  const now=Date.now();if(now-(cooldown.get(newState.id)||0)<30000)return;cooldown.set(newState.id,now);
  if(cooldown.size>1000)for(const [id,t]of cooldown)if(now-t>60000)cooldown.delete(id);
  newState.member.send({embeds:[new EmbedBuilder().setColor(0x168BFF).setTitle('أهلًا بك في دعم ليجند 💙').setDescription(`أهلًا <@${newState.id}>،\n${greeting}\nاكتب تفاصيل مشكلتك وجهز أي صور تساعدنا.`).setFooter({text:'LEGEND RP • الدعم الفني'})],allowedMentions:{parse:[]}}).catch(()=>console.warn('[LEGEND] Cannot DM support visitor: DMs disabled.'));
  queue.push(newState.id);next();
 });
 client.on(Events.InteractionCreate,async i=>{
  const command=i.isChatInputCommand()&&i.commandName==='اعلان';
  const modal=i.isModalSubmit()&&i.customId.startsWith('legend-announce:');
  if(!command&&!modal)return;
  try{
   const member=i.guildId===guildId?await i.guild.members.fetch(i.user.id):null;
   if(!canAnnounce(member))return void await i.reply({content:'هذا الأمر متاح لرتبة الإعلانات المحددة فقط.',ephemeral:true});
   if(command){
    const channel=i.options.getChannel('الروم',true);
    const form=new ModalBuilder().setCustomId(`legend-announce:${channel.id}`).setTitle('إعلان ليجند');
    form.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('title').setLabel('عنوان الإعلان').setStyle(TextInputStyle.Short).setMaxLength(256).setValue('LEGEND ROLEPLAY')),
     new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('body').setLabel('الرسالة').setStyle(TextInputStyle.Paragraph).setMaxLength(4000).setRequired(true)));
    return void await i.showModal(form);
   }
   await i.deferReply({ephemeral:true});
   const channel=await i.guild.channels.fetch(i.customId.split(':')[1]);
   if(!channel||![ChannelType.GuildText,ChannelType.GuildAnnouncement].includes(channel.type))throw Error('الروم غير متاح.');
   const me=await i.guild.members.fetchMe();
   if(!channel.permissionsFor(member)?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages]))throw Error('ليس لديك صلاحية إرسال رسائل في الروم.');
   if(!channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks]))throw Error('البوت يحتاج View Channel وSend Messages وEmbed Links في الروم.');
   const title=i.fields.getTextInputValue('title').trim(),body=i.fields.getTextInputValue('body').trim();
   if(!title||!body)throw Error('اكتب العنوان والرسالة.');
   const message=await channel.send({embeds:[announcementEmbed(title,body,i.guild.iconURL()||client.user.displayAvatarURL())],allowedMentions:{parse:[]}});
   await i.editReply({content:`تم إرسال إعلان ليجند: ${message.url}`});
  }catch(e){log(e);const payload={content:e.message||'تعذر إرسال الإعلان.'};if(i.deferred)await i.editReply(payload).catch(()=>{});else if(!i.replied)await i.reply({...payload,ephemeral:true}).catch(()=>{});}
 });
}
