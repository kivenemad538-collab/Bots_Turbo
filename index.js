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
  CLIENT_ID: 'PUT_DISCORD_APPLICATION_CLIENT_ID_HERE',
  GUILD_ID: 'PUT_SERVER_GUILD_ID_HERE',
  REVIEW_CHANNEL_ID: 'PUT_APPLICATION_REVIEW_CHANNEL_ID_HERE',
  PRE_ACCEPTED_ROLE_ID: 'PUT_PRE_ACCEPTED_ROLE_ID_HERE',
  ENTRY_ROLE_ID: 'PUT_ENTRY_PERMISSION_ROLE_ID_HERE',

  // حط كل رولات الإدارة اللي مسموح لها تراجع وتتحكم
  ADMIN_ROLE_IDS: [
    'PUT_ADMIN_ROLE_ID_HERE'
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

const API_PUBLIC_URL = (process.env.API_PUBLIC_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'http://localhost:3000')).replace(/\/$/,'');
const DISCORD_REDIRECT_URI = `${API_PUBLIC_URL}/auth/discord/callback`;


// ===================== DATABASE ==============================

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
  audit:[]
};

let queue = Promise.resolve();

async function readDB(){
  try {
    return JSON.parse(await fs.readFile(file,'utf8'));
  } catch {
    await writeDB(structuredClone(seed));
    return structuredClone(seed);
  }
}

async function writeDB(db){
  await fs.mkdir(path.dirname(file),{recursive:true});
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp,JSON.stringify(db,null,2),'utf8');
  await fs.rename(tmp,file);
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

// ===================== AUTH =================================
const secret=()=>process.env.SESSION_SECRET||'dev-secret-change-me';
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
function signToken(user, ttl=7*24*3600){const payload=b64({...user,exp:Math.floor(Date.now()/1000)+ttl});const sig=crypto.createHmac('sha256',secret()).update(payload).digest('base64url');return `${payload}.${sig}`}
function verifyToken(token){try{const [p,s]=String(token||'').split('.');const good=crypto.createHmac('sha256',secret()).update(p).digest('base64url');if(!crypto.timingSafeEqual(Buffer.from(s),Buffer.from(good)))return null;const d=JSON.parse(Buffer.from(p,'base64url').toString());if(d.exp<Date.now()/1000)return null;return d}catch{return null}}
function auth(req,res,next){const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');const user=verifyToken(token);if(!user)return res.status(401).json({error:'LOGIN_REQUIRED'});req.user=user;next()}
function isAdmin(user){const ids=IDS.ADMIN_ROLE_IDS.filter(Boolean);return !!user?.roles?.some(r=>ids.includes(r))}
function admin(req,res,next){if(!isAdmin(req.user))return res.status(403).json({error:'ADMIN_ONLY'});next()}

// ===================== AI STORY WARNING =====================
function inspectStory(text=''){
 const t=text.trim(); let score=0; const reasons=[];
 if(t.length>900){score+=15;reasons.push('القصة طويلة ومنظمة بشكل غير معتاد')}
 const formal=['علاوة على ذلك','ومن الجدير بالذكر','في نهاية المطاف','بشكل عام','من ناحية أخرى','يسعى إلى','حيث إن'];
 const hits=formal.filter(x=>t.includes(x)).length;if(hits>=2){score+=25;reasons.push('استخدام عبارات رسمية متكررة')}
 const sentences=t.split(/[.!؟\n]+/).filter(Boolean); if(sentences.length>7){const lens=sentences.map(s=>s.trim().length);const avg=lens.reduce((a,b)=>a+b,0)/lens.length;const dev=Math.sqrt(lens.reduce((a,b)=>a+(b-avg)**2,0)/lens.length);if(dev<25){score+=20;reasons.push('إيقاع الجمل متقارب جدًا')}}
 if(!/[،,.!?؟]/.test(t)&&t.length>400){score-=10}
 if(/أنا|كنت|عندي|اتولدت|كبرت/.test(t))score-=10;
 score=Math.max(0,Math.min(100,score));return {score,label:score>=45?'اشتباه مرتفع':'اشتباه منخفض',warning:'هذا فحص احتمالي فقط وليس دليلًا قاطعًا.',reasons};
}

// ===================== DISCORD BOT ==========================

let client;
const color=0x168cff;
const adminRoleIds=()=>new Set(IDS.ADMIN_ROLE_IDS.filter(Boolean));

async function isReviewer(interaction){
  try{
    if(interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
    const ids=adminRoleIds();
    if(!ids.size) return false;
    const roles=interaction.member?.roles?.cache ? [...interaction.member.roles.cache.keys()] : [];
    return roles.some(id=>ids.has(id));
  }catch{return false}
}

async function dm(userId,text){
  if(!client?.isReady()) return;
  try{const u=await client.users.fetch(userId);await u.send(text)}catch(e){console.warn('DM failed:',e.message)}
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
    {name:'فحص القصة',value:`${app.ai.label} — ${app.ai.score}%\n${app.ai.warning}`.slice(0,1024)}
  ).setFooter({text:`Application ID: ${app.id}`}).setTimestamp();

  const row=new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`accept:${app.id}`).setLabel('قبول مبدئي').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`reject:${app.id}`).setLabel('رفض بسبب').setStyle(ButtonStyle.Danger)
  );
  const msg=await ch.send({embeds:[e],components:[row]});
  await mutate(db=>{const a=db.applications.find(x=>x.id===app.id);if(a)a.reviewMessageId=msg.id});
}

async function notifyInterview(app,slot){
  await dm(app.discordId,`📅 تم حجز موعد المقابلة الصوتية في Turbo RP\nالموعد: ${new Date(slot.at).toLocaleString('ar-EG')}\n${slot.note||''}`)
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
    await role(userId,IDS.ENTRY_ROLE_ID,true);
    await dm(userId,'✅ تم قبولك في المقابلة الصوتية ومنحك تصريح الدخول إلى Turbo RP. أهلاً بيك!');
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
        let app,changed=false;
        await mutate(db=>{
          app=db.applications.find(a=>a.id===id);
          if(app?.status==='pending'){
            app.status='pre_accepted';app.reviewedAt=Date.now();app.reviewedBy=i.user.id;changed=true;
            db.audit.push({at:Date.now(),by:i.user.id,action:'pre_accept',applicationId:id});
          }
        });
        if(!app||!changed) return i.reply({content:'تمت مراجعة هذا الطلب بالفعل.',ephemeral:true});
        await role(app.discordId,IDS.PRE_ACCEPTED_ROLE_ID,true);
        await dm(app.discordId,`✅ تم قبول تقديمك مبدئيًا في Turbo RP (#${app.number}). ادخل الموقع وشاهد مواعيد المقابلة الصوتية واحجز الموعد المناسب.`);
        await i.update({content:`✅ قبول مبدئي بواسطة <@${i.user.id}>`,components:[]});
      } else {
        const modal=new ModalBuilder().setCustomId(`rejectmodal:${id}`).setTitle('سبب الرفض');
        const inp=new TextInputBuilder().setCustomId('reason').setLabel('اكتب سبب الرفض').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500);
        modal.addComponents(new ActionRowBuilder().addComponents(inp));
        await i.showModal(modal);
      }
    } else if(i.isModalSubmit()&&i.customId.startsWith('rejectmodal:')){
      if(!(await isReviewer(i))) return i.reply({content:'❌ ليس لديك صلاحية مراجعة التقديمات.',ephemeral:true});
      const id=i.customId.split(':')[1], reason=i.fields.getTextInputValue('reason').trim();
      let app,changed=false;
      await mutate(db=>{
        app=db.applications.find(a=>a.id===id);
        if(app?.status==='pending'){
          app.status='rejected';app.reason=reason;app.reviewedAt=Date.now();app.reviewedBy=i.user.id;
          app.cooldownUntil=Date.now()+12*3600*1000;changed=true;
          db.audit.push({at:Date.now(),by:i.user.id,action:'reject',applicationId:id,reason});
        }
      });
      if(!app||!changed) return i.reply({content:'تمت مراجعة هذا الطلب بالفعل.',ephemeral:true});
      await dm(app.discordId,`❌ تم رفض تقديمك في Turbo RP (#${app.number}).\nالسبب: ${reason}\nيمكنك التقديم مرة أخرى بعد 12 ساعة.`);
      if(i.message) await i.message.edit({content:`❌ تم الرفض بواسطة <@${i.user.id}> — السبب: ${reason}`,components:[]}).catch(()=>{});
      await i.reply({content:`تم رفض التقديم #${app.number} وإرسال السبب للمتقدم.`,ephemeral:true});
    }
  }catch(e){
    console.error('Discord interaction error:',e);
    if(i.isRepliable()&&!i.replied&&!i.deferred) await i.reply({content:'حدث خطأ أثناء تنفيذ العملية.',ephemeral:true}).catch(()=>{});
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
  const tr=await fetch('https://discord.com/api/oauth2/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body});
  const tok=await tr.json();
  if(!tok.access_token) throw new Error('DISCORD_OAUTH_TOKEN_FAILED');
  const ur=await fetch('https://discord.com/api/users/@me',{headers:{authorization:`Bearer ${tok.access_token}`}});
  const u=await ur.json();
  if(!u.id) throw new Error('DISCORD_USER_FAILED');
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
    if(['pending','pre_accepted','voice_passed'].includes(latest.status))canApply=false;
    if(latest.status==='rejected'&&latest.cooldownUntil>Date.now()){canApply=false;waitMs=latest.cooldownUntil-Date.now()}
  }
  const booked=latest?.interviewSlotId?db.interviewSlots.find(s=>s.id===latest.interviewSlotId):null;
  res.json({user:req.user,isAdmin:isAdmin(req.user),latest,canApply,waitMs,booked});
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
    if(latest&&['pending','pre_accepted','voice_passed'].includes(latest.status))throw new Error('BLOCKED');
    if(latest?.status==='rejected'&&latest.cooldownUntil>Date.now())throw new Error('COOLDOWN');
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

app.get('/api/admin/state',auth,admin,asyncRoute(async(req,res)=>{res.json(await readDB())}));
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
