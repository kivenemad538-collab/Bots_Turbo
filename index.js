// ============================================================
// TURBO RP - WEBSITE API + DISCORD BOT
// كل كود البوت والـ Backend موجود في الملف ده فقط.
// عدّل الـ IDs هنا فقط. التوكن والـ Secrets لا تضعها هنا.
// ============================================================
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import {
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, Events, PermissionFlagsBits
} from 'discord.js';

// ===================== DISCORD IDs ===========================
const IDS = {
  CLIENT_ID: '1545821707976056883',
  GUILD_ID: '1522093054365012078',
  REVIEW_CHANNEL_ID: '1522093061759438927',
  PRE_ACCEPTED_ROLE_ID: '1522093054377328734',
  ENTRY_ROLE_ID: '1522093054377328735',
  VOICE_REVIEW_ROLE_ID: '1539984535582941325',
  VOICE_REJECT_ROLE_A_ID: '1530597019180339281',
  VOICE_REJECT_ROLE_B_ID: '1530597216111169586',
  OWNER_USER_ID: '1445069224899907709',

  // حط كل رولات الإدارة اللي مسموح لها تراجع وتتحكم
  ADMIN_ROLE_IDS: [
    '1522093054419537959'
  ]
};

// Railway Variables المطلوبة:
// DISCORD_BOT_TOKEN       = توكن البوت
// DISCORD_CLIENT_SECRET   = Client Secret لتسجيل Discord
// SESSION_SECRET          = نص عشوائي طويل 32 حرف أو أكثر
// FRONTEND_URL            = رابط GitHub Pages كامل بدون / في الآخر
// API_PUBLIC_URL          = رابط Railway مثل https://xxxx.up.railway.app (اختياري)
// DATA_FILE               = مسار قاعدة البيانات (اختياري)
// YOUTUBE_API_KEY         = اختياري لفحص لايف YouTube
// TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET = اختياري لفحص Twitch
// ADMIN_PANEL_PASSWORD     = باسورد لوحة التحكم بالموقع

const API_PUBLIC_URL = (process.env.API_PUBLIC_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'http://localhost:3000')).replace(/\/$/,'');
const DISCORD_REDIRECT_URI = `${API_PUBLIC_URL}/auth/discord/callback`;


// ===================== DATABASE ==============================
// التخزين الأساسي يقدر يكون PostgreSQL خارجي عن Railway عن طريق DATABASE_URL.
// ده الأفضل لو هتنقل/تمسح مشروع Railway لأن البيانات تفضل خارج المشروع.
// لو DATABASE_URL مش موجود، النظام يرجع لملف turbo-db.json كحل احتياطي.

const file = process.env.DATA_FILE || (process.env.RAILWAY_VOLUME_MOUNT_PATH ? `${process.env.RAILWAY_VOLUME_MOUNT_PATH}/turbo-db.json` : './turbo-db.json');
const seed = {
  settings:{
    applicationsOpen:true,
    aboutText:'Turbo RP هو سيرفر رول بلاي عربي بنركز فيه على السيناريوهات والتفاعل وجودة التجربة.',
    rules:[]
  },
  counters:{application:0},
  applications:[],
  creators:[],
  interviewSlots:[],
  panelAdmins:[],
  audit:[]
};

let queue = Promise.resolve();
let pgPool = null;
let pgReady = false;

async function getPgPool(){
  if(!process.env.DATABASE_URL) return null;
  if(pgPool) return pgPool;
  const { Pool } = await import('pg');
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized:false },
    max: 3,
    idleTimeoutMillis: 30000
  });
  return pgPool;
}

async function ensurePg(){
  const pool=await getPgPool();
  if(!pool) return null;
  if(!pgReady){
    await pool.query(`CREATE TABLE IF NOT EXISTS turbo_state (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    pgReady=true;
  }
  return pool;
}

async function readLocalFile(){
  try { return JSON.parse(await fs.readFile(file,'utf8')); }
  catch { return null; }
}

async function writeLocalFile(db){
  await fs.mkdir(path.dirname(file),{recursive:true});
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp,JSON.stringify(db,null,2),'utf8');
  await fs.rename(tmp,file);
}

async function readDB(){
  const pool=await ensurePg();
  if(pool){
    const result=await pool.query('SELECT data FROM turbo_state WHERE id=$1',['main']);
    if(result.rows[0]?.data) return result.rows[0].data;
    // أول تشغيل على قاعدة خارجية: لو فيه ملف قديم على نفس السيرفر، هيتنقل تلقائيًا.
    const old=await readLocalFile();
    const initial=old || structuredClone(seed);
    await pool.query(
      `INSERT INTO turbo_state (id,data,updated_at) VALUES ($1,$2::jsonb,NOW())
       ON CONFLICT (id) DO UPDATE SET data=EXCLUDED.data, updated_at=NOW()`,
      ['main',JSON.stringify(initial)]
    );
    return initial;
  }
  const local=await readLocalFile();
  if(local) return local;
  const initial=structuredClone(seed);
  await writeLocalFile(initial);
  return initial;
}

async function writeDB(db){
  const pool=await ensurePg();
  if(pool){
    await pool.query(
      `INSERT INTO turbo_state (id,data,updated_at) VALUES ($1,$2::jsonb,NOW())
       ON CONFLICT (id) DO UPDATE SET data=EXCLUDED.data, updated_at=NOW()`,
      ['main',JSON.stringify(db)]
    );
    return;
  }
  await writeLocalFile(db);
}

function mutate(fn){
  const job = queue.then(async()=>{
    const db = await readDB();
    const out = await fn(db);
    await writeDB(db);
    return out;
  });
  queue = job.catch(()=>{});
  return job;
}

function validateImportedDB(db){
  return db && typeof db==='object' && !Array.isArray(db)
    && db.settings && typeof db.settings==='object'
    && db.counters && typeof db.counters==='object'
    && Array.isArray(db.applications)
    && Array.isArray(db.creators)
    && Array.isArray(db.interviewSlots)
    && Array.isArray(db.panelAdmins)
    && Array.isArray(db.audit);
}

// ===================== AUTH =================================
const secret=()=>process.env.SESSION_SECRET||'dev-secret-change-me';
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
function signToken(user, ttl=7*24*3600){const payload=b64({...user,exp:Math.floor(Date.now()/1000)+ttl});const sig=crypto.createHmac('sha256',secret()).update(payload).digest('base64url');return `${payload}.${sig}`}
function verifyToken(token){try{const [p,s]=String(token||'').split('.');const good=crypto.createHmac('sha256',secret()).update(p).digest('base64url');if(!crypto.timingSafeEqual(Buffer.from(s),Buffer.from(good)))return null;const d=JSON.parse(Buffer.from(p,'base64url').toString());if(d.exp<Date.now()/1000)return null;return d}catch{return null}}
function auth(req,res,next){const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');const user=verifyToken(token);if(!user)return res.status(401).json({error:'LOGIN_REQUIRED'});req.user=user;next()}
function isOwner(user){return String(user?.id||'')===String(IDS.OWNER_USER_ID)}
function hasRoleAdmin(user){const ids=IDS.ADMIN_ROLE_IDS.filter(Boolean);return !!user?.roles?.some(r=>ids.includes(r))}
function panelStaffEntry(user,db){return db?.panelAdmins?.find(a=>String(a.discordId)===String(user?.id))}
function panelStaffRole(user,db){
  if(isOwner(user))return 'owner';
  if(user?.panelAdmin===true)return 'admin';
  const entry=panelStaffEntry(user,db);
  if(entry)return entry.role==='manager'?'manager':'admin';
  if(hasRoleAdmin(user))return 'admin';
  return null;
}
function isManager(user,db){const r=panelStaffRole(user,db);return r==='owner'||r==='manager'}
function isPanelAdmin(user,db){return !!panelStaffEntry(user,db)}
function isAdmin(user,db){return !!panelStaffRole(user,db)}
async function admin(req,res,next){try{const db=await readDB();if(!isAdmin(req.user,db))return res.status(403).json({error:'ADMIN_ONLY'});req.db=db;next()}catch(e){next(e)}}
async function owner(req,res,next){if(!isOwner(req.user))return res.status(403).json({error:'OWNER_ONLY'});next()}
async function managerOrOwner(req,res,next){try{const db=req.db||await readDB();const role=panelStaffRole(req.user,db);if(role!=='owner'&&role!=='manager')return res.status(403).json({error:'MANAGER_ONLY'});req.db=db;req.staffRole=role;next()}catch(e){next(e)}}

// ===================== STORY REVIEW =========================
// لا نعرض نسبة "ذكاء اصطناعي" لأن النص وحده لا يسمح بقياس موثوق.
function inspectStory(text=''){
 const t=String(text||'').trim();
 return {score:null,label:'مراجعة يدوية',warning:'راجع القصة ومحتواها يدويًا. لا يتم إصدار نسبة AI تلقائية.',reasons:[],length:t.length};
}

// ===================== DISCORD BOT ==========================

let client;

async function fetchDiscordProfile(discordId){
  const id=String(discordId||'').trim();
  if(!/^\d{16,22}$/.test(id))return {discordId:id,username:'Unknown',globalName:'Unknown',avatarUrl:'https://cdn.discordapp.com/embed/avatars/0.png'};
  try{
    if(client?.isReady()){
      const u=await client.users.fetch(id);
      return {
        discordId:id,
        username:u.username||'Unknown',
        globalName:u.globalName||u.username||'Unknown',
        avatarUrl:u.displayAvatarURL({extension:'png',size:128})
      };
    }
    const token=process.env.DISCORD_BOT_TOKEN;
    if(token){
      const r=await fetch(`https://discord.com/api/v10/users/${id}`,{headers:{Authorization:`Bot ${token}`}});
      if(r.ok){
        const x=await r.json();
        return {
          discordId:id,
          username:x.username||'Unknown',
          globalName:x.global_name||x.username||'Unknown',
          avatarUrl:x.avatar?`https://cdn.discordapp.com/avatars/${id}/${x.avatar}.png?size=128`:'https://cdn.discordapp.com/embed/avatars/0.png'
        };
      }
    }
  }catch(e){console.warn('Discord profile lookup failed:',id,e.message)}
  return {discordId:id,username:'Unknown',globalName:'Unknown',avatarUrl:'https://cdn.discordapp.com/embed/avatars/0.png'};
}

const color=0x168cff;
const adminRoleIds=()=>new Set(IDS.ADMIN_ROLE_IDS.filter(Boolean));

async function isReviewer(interaction){
  try{
    if(interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
    if(String(interaction.user?.id||'')===String(IDS.OWNER_USER_ID)) return true;
    const db=await readDB();
    if(db.panelAdmins?.some(a=>String(a.discordId)===String(interaction.user?.id))) return true;
    const ids=adminRoleIds();
    const roles=interaction.member?.roles?.cache ? [...interaction.member.roles.cache.keys()] : [];
    return roles.some(id=>ids.has(id));
  }catch{return false}
}

async function dm(userId,payload){
  if(!client?.isReady()) return false;
  try{
    const u=await client.users.fetch(userId);
    await u.send(typeof payload==='string'?{content:payload}:payload);
    return true;
  }catch(e){
    console.warn('DM failed:',e.message);
    return false;
  }
}

function turboDmEmbed({title,description,fields=[],colorValue=color,footer='Turbo RP • Roleplay'}){
  return new EmbedBuilder()
    .setColor(colorValue)
    .setAuthor({name:'Turbo Application'})
    .setTitle(title)
    .setDescription(description||'')
    .addFields(fields)
    .setFooter({text:footer})
    .setTimestamp();
}

async function role(userId,roleId,add=true){
  if(!roleId||!client?.isReady())return;
  try{
    const g=await client.guilds.fetch(IDS.GUILD_ID);
    const m=await g.members.fetch(userId);
    add?await m.roles.add(roleId):await m.roles.remove(roleId);
  }catch(e){console.warn('Role update failed:',e.message)}
}

async function getMemberRoles(userId){
  if(!client?.isReady()) return [];
  try{
    const g=await client.guilds.fetch(IDS.GUILD_ID);
    const m=await g.members.fetch(userId);
    return [...m.roles.cache.keys()];
  }catch{return []}
}

async function postApplication(app){
  if(!client?.isReady()||!IDS.REVIEW_CHANNEL_ID)return;
  const ch=await client.channels.fetch(IDS.REVIEW_CHANNEL_ID);
  if(!ch?.isTextBased()) throw new Error('REVIEW_CHANNEL_NOT_TEXT');
  const e=new EmbedBuilder().setColor(color).setTitle(`تقديم #${app.number} — ${app.realName}`).setDescription(`<@${app.discordId}>`).addFields(
    {name:'العمر',value:String(app.age),inline:true},
    {name:'Discord',value:app.discordTag||app.discordId,inline:true},
    {name:'قصة الشخصية',value:app.story.slice(0,1000)},
    ...app.answers.map((a,i)=>({name:`س${i+1}: ${a.q}`.slice(0,256),value:(a.a||'—').slice(0,900)})),
    {name:'مراجعة القصة',value:'مراجعة يدوية — لا يتم عرض نسبة AI غير موثوقة.'.slice(0,1024)}
  ).setFooter({text:`Application ID: ${app.id}`}).setTimestamp();

  const row=new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`accept:${app.id}`).setLabel('قبول مبدئي').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`reject:${app.id}`).setLabel('رفض بسبب').setStyle(ButtonStyle.Danger)
  );
  const msg=await ch.send({embeds:[e],components:[row]});
  await mutate(db=>{const a=db.applications.find(x=>x.id===app.id);if(a)a.reviewMessageId=msg.id});
}

async function notifyInterview(app,slot){
  const when=new Date(slot.at).toLocaleString('ar-EG',{dateStyle:'full',timeStyle:'short'});
  const embed=turboDmEmbed({
    title:'📅 تم حجز المقابلة الصوتية',
    description:'تم تثبيت موعد المقابلة الصوتية الخاصة بك في **Turbo RP**.',
    fields:[
      {name:'رقم التقديم',value:`#${app.number}`,inline:true},
      {name:'الموعد',value:when,inline:false},
      ...(slot.note?[{name:'ملاحظات',value:String(slot.note).slice(0,1024)}]:[])
    ]
  });
  await dm(app.discordId,{embeds:[embed]});
}

async function markVoicePassed(userId,by='admin'){
  let app;
  await mutate(db=>{
    app=[...db.applications].reverse().find(a=>a.discordId===userId&&a.status==='pre_accepted');
    if(app){
      app.status='voice_passed';
      app.voicePassedAt=Date.now();
      db.audit.push({at:Date.now(),by,action:'voice_pass',userId});
    }
  });
  if(app){
    await role(userId,IDS.PRE_ACCEPTED_ROLE_ID,false);
    await role(userId,IDS.VOICE_REVIEW_ROLE_ID,false);
    await role(userId,IDS.VOICE_REJECT_ROLE_A_ID,false);
    await role(userId,IDS.VOICE_REJECT_ROLE_B_ID,false);
    await role(userId,IDS.ENTRY_ROLE_ID,true);
    const embed=turboDmEmbed({
      title:'✅ تم قبولك نهائيًا',
      description:'مبروك! تم اجتياز المقابلة الصوتية بنجاح وتم منحك **تصريح الدخول** إلى Turbo RP.',
      fields:[
        {name:'الحالة',value:'مقبول نهائيًا',inline:true},
        {name:'الخطوة التالية',value:'يمكنك الآن الدخول للسيرفر وبدء تجربتك في الرول بلاي.',inline:false}
      ],
      colorValue:0x22c55e
    });
    await dm(userId,{embeds:[embed]});
  }
  return app;
}

async function startBot(){
  if(!process.env.DISCORD_BOT_TOKEN){console.warn('DISCORD_BOT_TOKEN is missing. Bot disabled.');return null}
  client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMembers]});

  client.once(Events.ClientReady,c=>console.log(`Discord bot ready as ${c.user.tag}`));
  client.on(Events.InteractionCreate,async i=>{try{
    if(i.isButton()&&(i.customId.startsWith('accept:')||i.customId.startsWith('reject:'))){
      if(!(await isReviewer(i))) return i.reply({content:'❌ ليس لديك صلاحية مراجعة التقديمات.',ephemeral:true});
      const [action,id]=i.customId.split(':');

      if(action==='accept'){
        // Acknowledge Discord immediately so the interaction never times out while
        // we update the database, role and DM.
        await i.deferUpdate();

        let app,changed=false;
        await mutate(db=>{
          app=db.applications.find(a=>a.id===id);
          if(app?.status==='pending'){
            app.status='pre_accepted';
            app.reviewedAt=Date.now();
            app.reviewedBy=i.user.id;
            changed=true;
            db.audit.push({at:Date.now(),by:i.user.id,action:'pre_accept',applicationId:id});
          }
        });

        if(!app||!changed){
          return i.followUp({content:'⚠️ تمت مراجعة هذا الطلب بالفعل.',ephemeral:true});
        }

        // Remove buttons first. Role/DM failures must not make Discord show a timeout.
        await i.editReply({content:`✅ قبول مبدئي بواسطة <@${i.user.id}>`,components:[]}).catch(()=>{});

        let roleOk=true, dmOk=true;
        try{ await role(app.discordId,IDS.PRE_ACCEPTED_ROLE_ID,true); }catch{ roleOk=false; }
        const acceptEmbed=turboDmEmbed({
          title:'✅ تم قبول تقديمك مبدئيًا',
          description:'مبروك! تم قبول طلبك مبدئيًا في **Turbo RP**.',
          fields:[
            {name:'رقم التقديم',value:`#${app.number}`,inline:true},
            {name:'الحالة',value:'مقبول مبدئيًا',inline:true},
            {name:'الخطوة التالية',value:'ادخل الموقع واختر موعد المقابلة الصوتية المناسب لك.',inline:false}
          ],
          colorValue:0x22c55e
        });
        dmOk=await dm(app.discordId,{embeds:[acceptEmbed]});

        await i.followUp({
          content:`✅ تم قبول التقديم #${app.number} مبدئيًا.${roleOk?'':'\n⚠️ راجع صلاحية/ترتيب رول البوت.'}${dmOk?'':'\n⚠️ تعذر إرسال رسالة خاصة للمتقدم.'}`,
          ephemeral:true
        }).catch(()=>{});
      } else {
        // showModal itself acknowledges the button interaction, so do it before
        // any database/network work.
        const modal=new ModalBuilder().setCustomId(`rejectmodal:${id}`).setTitle('سبب الرفض');
        const inp=new TextInputBuilder().setCustomId('reason').setLabel('اكتب سبب الرفض').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500);
        modal.addComponents(new ActionRowBuilder().addComponents(inp));
        await i.showModal(modal);
      }
    } else if(i.isModalSubmit()&&i.customId.startsWith('rejectmodal:')){
      if(!(await isReviewer(i))) return i.reply({content:'❌ ليس لديك صلاحية مراجعة التقديمات.',ephemeral:true});

      // Modal submissions also have Discord's short response deadline.
      await i.deferReply({ephemeral:true});

      const id=i.customId.split(':')[1], reason=i.fields.getTextInputValue('reason').trim();
      let app,changed=false;
      await mutate(db=>{
        app=db.applications.find(a=>a.id===id);
        if(app?.status==='pending'){
          app.status='rejected';
          app.reason=reason;
          app.reviewedAt=Date.now();
          app.reviewedBy=i.user.id;
          app.cooldownUntil=Date.now()+12*3600*1000;
          changed=true;
          db.audit.push({at:Date.now(),by:i.user.id,action:'reject',applicationId:id,reason});
        }
      });

      if(!app||!changed){
        return i.editReply({content:'⚠️ تمت مراجعة هذا الطلب بالفعل.'});
      }

      // A modal submit does not reliably carry the original review message.
      // Fetch the stored review message and disable its buttons explicitly.
      if(app.reviewMessageId&&IDS.REVIEW_CHANNEL_ID){
        try{
          const ch=await client.channels.fetch(IDS.REVIEW_CHANNEL_ID);
          if(ch?.isTextBased()){
            const msg=await ch.messages.fetch(app.reviewMessageId);
            await msg.edit({content:`❌ تم الرفض بواسطة <@${i.user.id}> — السبب: ${reason}`,components:[]});
          }
        }catch(e){ console.warn('Review message update failed:',e.message); }
      }

      const rejectEmbed=turboDmEmbed({
        title:'❌ تم رفض التقديم',
        description:'تمت مراجعة تقديمك في **Turbo RP** ولم يتم قبوله هذه المرة.',
        fields:[
          {name:'رقم التقديم',value:`#${app.number}`,inline:true},
          {name:'الحالة',value:'مرفوض',inline:true},
          {name:'سبب الرفض',value:reason.slice(0,1024),inline:false},
          {name:'إعادة التقديم',value:'يمكنك التقديم مرة أخرى بعد **12 ساعة**.',inline:false}
        ],
        colorValue:0xef4444
      });
      const dmOk=await dm(app.discordId,{embeds:[rejectEmbed]});

      await i.editReply({content:`✅ تم رفض التقديم #${app.number} وحفظ السبب.${dmOk?'':'\n⚠️ تعذر إرسال رسالة خاصة للمتقدم.'}`});
    }
  }catch(e){
    console.error('Discord interaction error:',e);
    if(!i.isRepliable()) return;
    const payload={content:'❌ حدث خطأ أثناء تنفيذ العملية.',ephemeral:true};
    if(i.deferred||i.replied) await i.followUp(payload).catch(()=>{});
    else await i.reply(payload).catch(()=>{});
  }});

  await client.login(process.env.DISCORD_BOT_TOKEN);
  return client;
}


// ===================== WEBSITE API ==========================

const app=express();
const asyncRoute=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const frontendUrl=(process.env.FRONTEND_URL||'http://127.0.0.1:5500').replace(/\/$/,'');
const frontendOrigin=(()=>{try{return new URL(frontendUrl).origin}catch{return frontendUrl}})();
const allowedOrigins=[process.env.CORS_ORIGIN,frontendOrigin].filter(Boolean);

app.disable('x-powered-by');
app.use(cors({
  origin(origin,cb){
    if(!origin||allowedOrigins.includes('*')||allowedOrigins.includes(origin)) return cb(null,true);
    return cb(new Error('CORS_NOT_ALLOWED'));
  },
  methods:['GET','POST','PATCH','DELETE','OPTIONS'],
  allowedHeaders:['Content-Type','Authorization']
}));
app.use(express.json({limit:'1mb'}));

const questions=[
  'اشرح معنى RDM واديني مثال.',
  'اشرح معنى VDM واديني مثال.',
  'ما هو Meta Gaming؟',
  'ما هو Power Gaming؟',
  'لو اتعرضت لتهديد بسلاح، هتتصرف إزاي؟',
  'هل ينفع تخرج من السيرفر أثناء سيناريو علشان تتجنب نتيجته؟ وضّح.',
  'لو عرفت معلومة من Discord خارج اللعبة، هل ينفع تستخدمها داخل الشخصية؟',
  'احكي باختصار سيناريو رول بلاي تحب تعمله داخل Turbo RP.'
];

function parseCookies(req){
  return Object.fromEntries(String(req.headers.cookie||'').split(';').map(v=>v.trim()).filter(Boolean).map(v=>{const i=v.indexOf('=');return [decodeURIComponent(v.slice(0,i)),decodeURIComponent(v.slice(i+1))]}));
}
function oauthState(){return crypto.randomBytes(24).toString('base64url')}
function cookie(name,value,maxAge=600){
  const secure=process.env.NODE_ENV==='production'?'; Secure':'';
  return `${name}=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}
function requireEnv(){
  const needed=['DISCORD_CLIENT_SECRET','DISCORD_BOT_TOKEN','SESSION_SECRET'];
  const missing=needed.filter(k=>!process.env[k]); if(!IDS.CLIENT_ID||!IDS.GUILD_ID||!IDS.REVIEW_CHANNEL_ID) console.warn('⚠️ عدّل Discord IDs في أول index.js');
  if(missing.length) console.warn(`Missing environment variables: ${missing.join(', ')}`);
  if((process.env.SESSION_SECRET||'').length<32) console.warn('SESSION_SECRET should be at least 32 characters.');
}
requireEnv();

app.get('/health',(req,res)=>res.json({ok:true,name:'Turbo RP',time:new Date().toISOString()}));
app.get('/api/public',asyncRoute(async(req,res)=>{
  const db=await readDB();
  res.json({
    settings:{applicationsOpen:db.settings.applicationsOpen,aboutText:db.settings.aboutText,rules:db.settings.rules},
    creators:[...db.creators].sort((a,b)=>(a.order||0)-(b.order||0)),
    questions,
    interviewSlots:db.interviewSlots.filter(s=>!s.bookedBy&&new Date(s.at)>new Date()).sort((a,b)=>new Date(a.at)-new Date(b.at))
  });
}));

app.get('/auth/discord',(req,res)=>{
  if(!IDS.CLIENT_ID||!DISCORD_REDIRECT_URI) return res.status(503).send('Discord OAuth is not configured.');
  const state=oauthState();
  res.setHeader('Set-Cookie',cookie('turbo_oauth_state',state));
  const q=new URLSearchParams({
    client_id:IDS.CLIENT_ID,
    redirect_uri:DISCORD_REDIRECT_URI,
    response_type:'code',scope:'identify',state
  });
  res.redirect(`https://discord.com/oauth2/authorize?${q}`);
});

app.get('/auth/discord/callback',asyncRoute(async(req,res)=>{
  const cookies=parseCookies(req);
  if(!req.query.code||!req.query.state||cookies.turbo_oauth_state!==req.query.state) return res.status(400).send('Invalid OAuth state.');
  res.setHeader('Set-Cookie',cookie('turbo_oauth_state','',0));
  const body=new URLSearchParams({
    client_id:IDS.CLIENT_ID,
    client_secret:process.env.DISCORD_CLIENT_SECRET,
    grant_type:'authorization_code',code:String(req.query.code),
    redirect_uri:DISCORD_REDIRECT_URI
  });
  const tr=await fetch('https://discord.com/api/oauth2/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','accept':'application/json'},body:body.toString()});
  const tokenText=await tr.text();
  let tok={};
  try{ tok=JSON.parse(tokenText); }catch{
    console.error('Discord OAuth token returned non-JSON:',tr.status,tokenText.slice(0,180));
    return res.redirect(`${frontendUrl}/#login_error=discord_temporarily_unavailable`);
  }
  if(!tr.ok||!tok.access_token){
    console.error('Discord OAuth token failed:',tr.status,tok.error||tok.error_description||'unknown');
    return res.redirect(`${frontendUrl}/#login_error=discord_oauth_failed`);
  }
  const ur=await fetch('https://discord.com/api/users/@me',{headers:{authorization:`Bearer ${tok.access_token}`,accept:'application/json'}});
  const userText=await ur.text();
  let u={}; try{u=JSON.parse(userText)}catch{console.error('Discord user returned non-JSON:',ur.status,userText.slice(0,180));return res.redirect(`${frontendUrl}/#login_error=discord_temporarily_unavailable`)}
  if(!ur.ok||!u.id) return res.redirect(`${frontendUrl}/#login_error=discord_user_failed`);
  const roles=await getMemberRoles(u.id);
  const token=signToken({id:u.id,username:u.username,globalName:u.global_name,avatar:u.avatar,roles});
  res.redirect(`${frontendUrl}/#token=${encodeURIComponent(token)}`);
}));

app.get('/api/me',auth,asyncRoute(async(req,res)=>{
  const db=await readDB();
  const apps=db.applications.filter(a=>a.discordId===req.user.id).sort((a,b)=>b.createdAt-a.createdAt);
  const latest=apps[0]||null;
  let canApply=db.settings.applicationsOpen,waitMs=0;
  if(latest){
    if(['pending','pre_accepted','voice_review','voice_passed','banned'].includes(latest.status))canApply=false;
    if(['rejected','voice_rejected'].includes(latest.status)&&latest.cooldownUntil>Date.now()){canApply=false;waitMs=latest.cooldownUntil-Date.now()}
  }
  const booked=latest?.interviewSlotId?db.interviewSlots.find(s=>s.id===latest.interviewSlotId):null;
  res.json({user:req.user,isAdmin:isAdmin(req.user,db),isOwner:isOwner(req.user),isManager:isManager(req.user,db),staffRole:panelStaffRole(req.user,db),latest,canApply,waitMs,booked});
}));

app.post('/api/applications',auth,asyncRoute(async(req,res)=>{
  const {realName,age,story,answers}=req.body||{};
  if(!/^\S+\s+\S+/.test(String(realName||'').trim()))return res.status(400).json({error:'REAL_NAME_TWO_PARTS'});
  if(Number(age)<16||Number(age)>80)return res.status(400).json({error:'INVALID_AGE'});
  if(String(story||'').trim().length<120)return res.status(400).json({error:'STORY_TOO_SHORT'});
  if(!Array.isArray(answers)||answers.length!==questions.length||answers.some(x=>String(x||'').trim().length<10))return res.status(400).json({error:'ANSWERS_INCOMPLETE'});

  let created;
  await mutate(db=>{
    if(!db.settings.applicationsOpen)throw new Error('CLOSED');
    const latest=[...db.applications].reverse().find(a=>a.discordId===req.user.id);
    if(latest&&['pending','pre_accepted','voice_review','voice_passed','banned'].includes(latest.status))throw new Error(latest.status==='banned'?'BANNED':'BLOCKED');
    if(latest&&['rejected','voice_rejected'].includes(latest.status)&&latest.cooldownUntil>Date.now())throw new Error('COOLDOWN');
    db.counters.application=(db.counters.application||0)+1;
    created={
      id:crypto.randomUUID(),number:db.counters.application,discordId:req.user.id,discordTag:req.user.username,
      realName:String(realName).trim(),age:Number(age),story:String(story).trim(),
      answers:questions.map((q,i)=>({q,a:String(answers[i]).trim()})),ai:inspectStory(story),
      status:'pending',createdAt:Date.now(),cooldownUntil:0
    };
    db.applications.push(created);
    db.audit.push({at:Date.now(),by:req.user.id,action:'application_create',applicationId:created.id});
  });
  await role(created.discordId,IDS.VOICE_REVIEW_ROLE_ID,true);
  await postApplication(created);
  res.json({ok:true,application:created});
}));

app.post('/api/interviews/:slotId/book',auth,asyncRoute(async(req,res)=>{
  let result;
  await mutate(db=>{
    const application=[...db.applications].reverse().find(a=>a.discordId===req.user.id&&a.status==='pre_accepted');
    if(!application)throw new Error('NOT_PRE_ACCEPTED');
    if(application.interviewSlotId)throw new Error('ALREADY_BOOKED');
    const slot=db.interviewSlots.find(s=>s.id===req.params.slotId);
    if(!slot||slot.bookedBy||new Date(slot.at)<=new Date())throw new Error('SLOT_UNAVAILABLE');
    slot.bookedBy=req.user.id;slot.applicationId=application.id;application.interviewSlotId=slot.id;
    db.audit.push({at:Date.now(),by:req.user.id,action:'interview_book',applicationId:application.id,slotId:slot.id});
    result={app:application,slot};
  });
  await notifyInterview(result.app,result.slot);
  res.json({ok:true,...result});
}));


app.post('/api/admin/password-login',asyncRoute(async(req,res)=>{
  const expected=String(process.env.ADMIN_PANEL_PASSWORD||'');
  const given=String(req.body?.password||'');
  if(!expected) return res.status(503).json({error:'ADMIN_PASSWORD_NOT_CONFIGURED'});
  const a=Buffer.from(given),b=Buffer.from(expected);
  const ok=a.length===b.length && crypto.timingSafeEqual(a,b);
  if(!ok) return res.status(401).json({error:'INVALID_ADMIN_PASSWORD'});
  const token=signToken({id:'panel-password',username:'Turbo Admin',roles:[],panelAdmin:true},6*3600);
  res.json({ok:true,token,expiresIn:6*3600});
}));

app.get('/api/admin/state',auth,admin,asyncRoute(async(req,res)=>{
  const db=await readDB();
  const panelAdmins=await Promise.all((db.panelAdmins||[]).map(async entry=>{
    const profile=(entry.username&&entry.avatarUrl)?entry:({...entry,...await fetchDiscordProfile(entry.discordId)});
    return {...profile,role:entry.role==='manager'?'manager':'admin'};
  }));
  const ownerProfile=await fetchDiscordProfile(IDS.OWNER_USER_ID);
  const staffDirectory=[
    {...ownerProfile,discordId:String(IDS.OWNER_USER_ID),role:'owner'},
    ...panelAdmins
  ];
  const role=panelStaffRole(req.user,db)||'admin';
  res.json({...db,panelAdmins,staffDirectory,viewer:{id:req.user.id,role,isOwner:role==='owner',isManager:role==='owner'||role==='manager'}});
}));

// ===== BACKUP / RESTORE (OWNER ONLY) =====
// استخدم Export قبل حذف مشروع Railway القديم، وبعدها Import في المشروع الجديد.
app.get('/api/admin/backup/export',auth,owner,asyncRoute(async(req,res)=>{
  const db=await readDB();
  const payload={format:'turbo-rp-backup-v1',exportedAt:Date.now(),data:db};
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Content-Disposition',`attachment; filename="turbo-backup-${stamp}.json"`);
  res.send(JSON.stringify(payload,null,2));
}));

app.post('/api/admin/backup/import',auth,owner,asyncRoute(async(req,res)=>{
  const incoming=req.body?.format==='turbo-rp-backup-v1' ? req.body.data : req.body;
  if(!validateImportedDB(incoming)) return res.status(400).json({error:'INVALID_BACKUP'});
  const restored=structuredClone(incoming);
  restored.audit.push({at:Date.now(),by:req.user.id,action:'backup_import'});
  await writeDB(restored);
  res.json({ok:true,applications:restored.applications.length,panelAdmins:restored.panelAdmins.length});
}));

app.get('/api/admin/storage-status',auth,owner,asyncRoute(async(req,res)=>{
  res.json({ok:true,mode:process.env.DATABASE_URL?'postgres':'local-file',external:!!process.env.DATABASE_URL});
}));

app.patch('/api/admin/settings',auth,admin,asyncRoute(async(req,res)=>{
  const {applicationsOpen,aboutText,rules}=req.body;
  await mutate(db=>{
    if(typeof applicationsOpen==='boolean')db.settings.applicationsOpen=applicationsOpen;
    if(typeof aboutText==='string')db.settings.aboutText=aboutText.slice(0,5000);
    if(Array.isArray(rules))db.settings.rules=rules.map(x=>String(x).slice(0,1000));
    db.audit.push({at:Date.now(),by:req.user.id,action:'settings_update'});
  });
  res.json({ok:true});
}));

app.post('/api/admin/panel-admins',auth,managerOrOwner,asyncRoute(async(req,res)=>{
  const discordId=String(req.body?.discordId||'').trim();
  const requestedRole=req.body?.role==='manager'?'manager':'admin';
  if(req.staffRole!=='owner' && requestedRole==='manager') return res.status(403).json({error:'OWNER_ONLY_FOR_MANAGER'});
  const staffRole=req.staffRole==='owner'?requestedRole:'admin';
  if(!/^\d{16,22}$/.test(discordId))return res.status(400).json({error:'INVALID_DISCORD_ID'});
  if(discordId===String(IDS.OWNER_USER_ID))return res.status(400).json({error:'ALREADY_OWNER'});
  const profile=await fetchDiscordProfile(discordId);
  let entry;
  await mutate(db=>{
    db.panelAdmins=Array.isArray(db.panelAdmins)?db.panelAdmins:[];
    if(db.panelAdmins.some(a=>String(a.discordId)===discordId))throw new Error('ADMIN_EXISTS');
    entry={discordId,role:staffRole,username:profile.username,globalName:profile.globalName,avatarUrl:profile.avatarUrl,addedAt:Date.now(),addedBy:req.user.id};
    db.panelAdmins.push(entry);
    db.audit.push({at:Date.now(),by:req.user.id,action:'panel_staff_add',discordId,role:staffRole});
  });
  res.json({ok:true,admin:entry});
}));
app.delete('/api/admin/panel-admins/:discordId',auth,managerOrOwner,asyncRoute(async(req,res)=>{
  const discordId=String(req.params.discordId||'');
  const current=(req.db?.panelAdmins||[]).find(a=>String(a.discordId)===discordId);
  if(!current)return res.status(404).json({error:'STAFF_NOT_FOUND'});
  if(req.staffRole!=='owner' && current.role==='manager')return res.status(403).json({error:'OWNER_ONLY_FOR_MANAGER'});
  await mutate(db=>{
    db.panelAdmins=(db.panelAdmins||[]).filter(a=>String(a.discordId)!==discordId);
    db.audit.push({at:Date.now(),by:req.user.id,action:'panel_staff_remove',discordId});
  });
  res.json({ok:true});
}));

async function updateReviewMessage(appRecord,text){
  if(!client?.isReady()||!appRecord?.reviewMessageId||!IDS.REVIEW_CHANNEL_ID)return;
  try{
    const ch=await client.channels.fetch(IDS.REVIEW_CHANNEL_ID);
    if(!ch?.isTextBased())return;
    const msg=await ch.messages.fetch(appRecord.reviewMessageId);
    await msg.edit({content:text,components:[]});
  }catch(e){console.warn('Review message update failed:',e.message)}
}

app.post('/api/admin/applications/:id/action',auth,admin,asyncRoute(async(req,res)=>{
  const action=String(req.body?.action||'').trim();
  const reason=String(req.body?.reason||'').trim().slice(0,500);
  const allowed=['pre_accept','reject','voice_review','voice_pass','voice_reject','ban','reset'];
  if(!allowed.includes(action))return res.status(400).json({error:'INVALID_ACTION'});
  let a,previous;
  await mutate(db=>{
    a=db.applications.find(x=>x.id===req.params.id);
    if(!a)throw new Error('APPLICATION_NOT_FOUND');
    previous=a.status;
    const now=Date.now();
    if(action==='pre_accept'){
      if(a.status!=='pending')throw new Error('INVALID_STAGE');
      a.status='pre_accepted';a.reason='';a.reviewedAt=now;a.reviewedBy=req.user.id;a.cooldownUntil=0;
    }else if(action==='reject'){
      if(a.status!=='pending')throw new Error('INVALID_STAGE');
      a.status='rejected';a.reason=reason||'لم يتم تحديد سبب';a.reviewedAt=now;a.reviewedBy=req.user.id;a.cooldownUntil=now+12*3600*1000;
    }else if(action==='voice_review'){
      if(!['pre_accepted','voice_review'].includes(a.status))throw new Error('INVALID_STAGE');
      a.status='voice_review';a.voiceReviewedAt=now;a.voiceReviewedBy=req.user.id;
    }else if(action==='voice_pass'){
      if(!['pre_accepted','voice_review'].includes(a.status))throw new Error('INVALID_STAGE');
      a.status='voice_passed';a.voicePassedAt=now;a.voiceReviewedBy=req.user.id;a.reason='';a.cooldownUntil=0;
    }else if(action==='voice_reject'){
      if(!['pre_accepted','voice_review'].includes(a.status))throw new Error('INVALID_STAGE');
      a.status='voice_rejected';a.reason=reason||'';a.voiceReviewedAt=now;a.voiceReviewedBy=req.user.id;a.cooldownUntil=now+12*3600*1000;
      for(const slot of db.interviewSlots){if(slot.bookedBy===a.discordId){slot.bookedBy=null;slot.applicationId=null}}
      a.interviewSlotId=null;
    }else if(action==='ban'){
      a.status='banned';a.reason=reason||'حظر دائم من التقديم';a.bannedAt=now;a.bannedBy=req.user.id;a.cooldownUntil=0;
      for(const slot of db.interviewSlots){if(slot.bookedBy===a.discordId){slot.bookedBy=null;slot.applicationId=null}}
      a.interviewSlotId=null;
    }else if(action==='reset'){
      a.status='reset';a.reason='';a.cooldownUntil=0;a.interviewSlotId=null;
      for(const slot of db.interviewSlots){if(slot.bookedBy===a.discordId){slot.bookedBy=null;slot.applicationId=null}}
    }
    db.audit.push({at:now,by:req.user.id,action:`application_${action}`,applicationId:a.id,from:previous,to:a.status,reason});
  });

  if(action==='pre_accept'){
    await role(a.discordId,IDS.VOICE_REVIEW_ROLE_ID,false);
    await role(a.discordId,IDS.PRE_ACCEPTED_ROLE_ID,true);
    await dm(a.discordId,{embeds:[turboDmEmbed({title:'✅ تم قبول تقديمك مبدئيًا',description:'تم قبول طلبك مبدئيًا في **Turbo RP**.',fields:[{name:'رقم التقديم',value:`#${a.number}`,inline:true},{name:'الخطوة التالية',value:'ادخل الموقع واختر موعد المقابلة الصوتية.',inline:false}],colorValue:0x22c55e})]});
    await updateReviewMessage(a,`✅ قبول مبدئي من لوحة التحكم بواسطة <@${req.user.id}>`);
  }else if(action==='reject'){
    await role(a.discordId,IDS.VOICE_REVIEW_ROLE_ID,false);
    await dm(a.discordId,{embeds:[turboDmEmbed({title:'❌ تم رفض التقديم',description:'تمت مراجعة تقديمك ولم يتم قبوله هذه المرة.',fields:[{name:'السبب',value:a.reason||'لم يتم تحديد سبب'},{name:'إعادة التقديم',value:'بعد 12 ساعة'}],colorValue:0xef4444})]});
    await updateReviewMessage(a,`❌ رفض من لوحة التحكم بواسطة <@${req.user.id}> — ${a.reason||'بدون سبب'}`);
  }else if(action==='voice_review'){
    await role(a.discordId,IDS.VOICE_REVIEW_ROLE_ID,true);
    await dm(a.discordId,{embeds:[turboDmEmbed({title:'🕒 المقابلة قيد المراجعة',description:'تم وضع نتيجة المقابلة الصوتية قيد المراجعة من الإدارة.'})]});
  }else if(action==='voice_pass'){
    await role(a.discordId,IDS.PRE_ACCEPTED_ROLE_ID,false);
    await role(a.discordId,IDS.VOICE_REVIEW_ROLE_ID,false);
    await role(a.discordId,IDS.VOICE_REJECT_ROLE_A_ID,false);
    await role(a.discordId,IDS.VOICE_REJECT_ROLE_B_ID,false);
    await role(a.discordId,IDS.ENTRY_ROLE_ID,true);
    await dm(a.discordId,{embeds:[turboDmEmbed({title:'✅ تم قبولك نهائيًا',description:'تم اجتياز المقابلة الصوتية ومنحك تصريح الدخول.',colorValue:0x22c55e})]});
  }else if(action==='voice_reject'){
    await role(a.discordId,IDS.PRE_ACCEPTED_ROLE_ID,false);
    await role(a.discordId,IDS.VOICE_REVIEW_ROLE_ID,false);
    // الرفض الصوتي يتناوب A ثم B ثم A ثم B... مع إزالة رول الرفض السابق.
    const dbNow=await readDB();
    const rejects=dbNow.applications.filter(x=>x.discordId===a.discordId&&x.status==='voice_rejected').length;
    const odd=rejects%2===1;
    await role(a.discordId,IDS.VOICE_REJECT_ROLE_A_ID,false);
    await role(a.discordId,IDS.VOICE_REJECT_ROLE_B_ID,false);
    await role(a.discordId,odd?IDS.VOICE_REJECT_ROLE_A_ID:IDS.VOICE_REJECT_ROLE_B_ID,true);
    await dm(a.discordId,{embeds:[turboDmEmbed({title:'❌ لم تجتز المقابلة الصوتية',description:a.reason?`السبب: ${a.reason}`:'لم يتم تحديد سبب.',fields:[{name:'إعادة التقديم',value:'بعد 12 ساعة'}],colorValue:0xef4444})]});
  }else if(action==='ban'){
    await role(a.discordId,IDS.PRE_ACCEPTED_ROLE_ID,false);
    await role(a.discordId,IDS.VOICE_REVIEW_ROLE_ID,false);
    await role(a.discordId,IDS.VOICE_REJECT_ROLE_A_ID,false);
    await role(a.discordId,IDS.VOICE_REJECT_ROLE_B_ID,false);
    await role(a.discordId,IDS.ENTRY_ROLE_ID,false);
    await dm(a.discordId,{embeds:[turboDmEmbed({title:'⛔ حظر دائم من التقديم',description:a.reason||'تم حظرك بشكل دائم من التقديم.',colorValue:0x991b1b})]});
  }
  res.json({ok:true,application:a});
}));

app.post('/api/admin/creators',auth,admin,asyncRoute(async(req,res)=>{
  let c;
  await mutate(db=>{
    c={id:crypto.randomUUID(),name:String(req.body.name||'').trim(),image:String(req.body.image||'').trim(),url:String(req.body.url||'').trim(),order:Number(req.body.order||0),platform:String(req.body.platform||'other'),platformId:String(req.body.platformId||'').trim(),isLive:false,lastCheckedAt:0};
    if(!c.name||!c.url)throw new Error('CREATOR_INVALID');
    db.creators.push(c);
    db.audit.push({at:Date.now(),by:req.user.id,action:'creator_add',creatorId:c.id});
  });
  res.json(c);
}));
app.delete('/api/admin/creators/:id',auth,admin,asyncRoute(async(req,res)=>{await mutate(db=>{db.creators=db.creators.filter(c=>c.id!==req.params.id)});res.json({ok:true})}));
app.post('/api/admin/interviews',auth,admin,asyncRoute(async(req,res)=>{
  const at=new Date(req.body.at);
  if(Number.isNaN(at.getTime())||at<=new Date())return res.status(400).json({error:'INVALID_INTERVIEW_DATE'});
  let slot;
  await mutate(db=>{slot={id:crypto.randomUUID(),at:at.toISOString(),note:String(req.body.note||'').slice(0,500),bookedBy:null,applicationId:null};db.interviewSlots.push(slot)});
  res.json(slot);
}));
app.delete('/api/admin/interviews/:id',auth,admin,asyncRoute(async(req,res)=>{await mutate(db=>{const s=db.interviewSlots.find(x=>x.id===req.params.id);if(s?.bookedBy)throw new Error('BOOKED');db.interviewSlots=db.interviewSlots.filter(x=>x.id!==req.params.id)});res.json({ok:true})}));
app.post('/api/admin/users/:discordId/reset',auth,admin,asyncRoute(async(req,res)=>{
  await mutate(db=>{
    const latest=[...db.applications].reverse().find(a=>a.discordId===req.params.discordId);
    if(latest){latest.status='reset';latest.cooldownUntil=0;latest.interviewSlotId=null}
    for(const slot of db.interviewSlots){if(slot.bookedBy===req.params.discordId){slot.bookedBy=null;slot.applicationId=null}}
    db.audit.push({at:Date.now(),by:req.user.id,action:'reset_apply',userId:req.params.discordId});
  });
  res.json({ok:true});
}));
app.post('/api/admin/users/:discordId/voice-pass',auth,admin,asyncRoute(async(req,res)=>{const a=await markVoicePassed(req.params.discordId,req.user.id);if(!a)return res.status(404).json({error:'NO_PRE_ACCEPTED_APPLICATION'});res.json({ok:true,application:a})}));

let twitchToken=null,twitchTokenExpires=0;
async function getTwitchToken(){
  if(twitchToken&&Date.now()<twitchTokenExpires-60000)return twitchToken;
  const r=await fetch(`https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(process.env.TWITCH_CLIENT_ID)}&client_secret=${encodeURIComponent(process.env.TWITCH_CLIENT_SECRET)}&grant_type=client_credentials`,{method:'POST'});
  const j=await r.json();
  twitchToken=j.access_token;twitchTokenExpires=Date.now()+(Number(j.expires_in||3600)*1000);return twitchToken;
}
async function checkLives(){
  const db=await readDB();
  for(const c of db.creators){
    let live=false;
    try{
      if(c.platform==='youtube'&&process.env.YOUTUBE_API_KEY&&c.platformId){
        const u=`https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${encodeURIComponent(c.platformId)}&eventType=live&type=video&key=${process.env.YOUTUBE_API_KEY}`;
        const j=await (await fetch(u)).json();live=Array.isArray(j.items)&&j.items.length>0;
      }else if(c.platform==='twitch'&&process.env.TWITCH_CLIENT_ID&&process.env.TWITCH_CLIENT_SECRET&&c.platformId){
        const token=await getTwitchToken();
        const r=await fetch(`https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(c.platformId)}`,{headers:{'Client-ID':process.env.TWITCH_CLIENT_ID,Authorization:`Bearer ${token}`}});
        const j=await r.json();live=Array.isArray(j.data)&&j.data.length>0;
      }
    }catch(e){console.error('live check',c.name,e.message)}
    await mutate(x=>{const cc=x.creators.find(z=>z.id===c.id);if(cc){cc.isLive=live;cc.lastCheckedAt=Date.now()}});
  }
}

app.use(express.static('public'));
app.use((err,req,res,next)=>{
  console.error(err);
  const map={CLOSED:403,BLOCKED:409,COOLDOWN:429,NOT_PRE_ACCEPTED:403,ALREADY_BOOKED:409,SLOT_UNAVAILABLE:409,BOOKED:409,CORS_NOT_ALLOWED:403,CREATOR_INVALID:400};
  res.status(map[err.message]||500).json({error:err.message||'SERVER_ERROR'});
});

const port=process.env.PORT||3000;
app.listen(port,'0.0.0.0',()=>console.log(`Turbo API listening on ${port}`));
startBot().catch(e=>console.error('Discord bot failed:',e));
setInterval(checkLives,Math.max(1,Number(process.env.LIVE_CHECK_MINUTES||3))*60*1000);
setTimeout(checkLives,5000);
