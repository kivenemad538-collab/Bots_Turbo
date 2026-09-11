const RAW_API = String(window.TURBO_API || '').trim();
const API_CONFIGURED = /^https:\/\//i.test(RAW_API) && !/YOUR-RAILWAY-DOMAIN/i.test(RAW_API);
const API = API_CONFIGURED ? RAW_API.replace(/\/$/,'') : '';
let token = localStorage.getItem('turbo_token') || '';
let pub = null, me = null;
let selectedCharacterType = '';
const CHARACTER_TYPES = [
  {id:'criminal',name:'شخصية إجرامية',sub:'Criminal',icon:'◆',desc:'شخصية تعيش على المخاطرة والصفقات والسيناريوهات الإجرامية.'},
  {id:'police',name:'شرطي',sub:'Police Officer',icon:'★',desc:'شخصية قانونية تركّز على التحقيق، النظام والتعامل مع البلاغات.'},
  {id:'mechanic',name:'ميكانيكي',sub:'Mechanic',icon:'⚙',desc:'شخصية عملية تبني علاقاتها من الورشة وخدمة أهل المدينة.'},
  {id:'ems',name:'مسعف',sub:'EMS / Paramedic',icon:'✚',desc:'شخصية طبية تنقذ الأرواح وتتعامل مع الحوادث والطوارئ.'},
  {id:'lawyer',name:'محامي',sub:'Lawyer',icon:'§',desc:'شخصية قانونية تعتمد على التفاوض، القضايا والدفاع عن العملاء.'},
  {id:'civilian',name:'مدني',sub:'Civilian',icon:'◉',desc:'شخصية مدنية تبدأ قصتها بحرية وتبني طريقها داخل المدينة.'},
  {id:'business',name:'رجل أعمال',sub:'Business',icon:'▰',desc:'شخصية تركّز على التجارة، العلاقات وبناء مشروع داخل المدينة.'}
];
const CHARACTER_LABELS = Object.fromEntries(CHARACTER_TYPES.map(x=>[x.id,x.name]));

const $ = s => document.querySelector(s);

const DEFAULT_RULE_GROUPS = [
  ['القوانين العامة',[
    'الاحترام واجب بين جميع اللاعبين. يمنع السب أو الإهانة أو العنصرية أو التحرش خارج إطار الرول بلاي.',
    'يمنع استغلال الثغرات أو الهاكات أو أي برنامج يعطي أفضلية غير عادلة، ويجب إبلاغ الإدارة عن أي ثغرة.',
    'يمنع الخروج عن الشخصية أثناء السيناريو. المشاكل الإدارية يتم حلها بعد انتهاء السيناريو.',
    'يمنع انتحال شخصية إداري أو شرطي أو مسعف أو أي رتبة رسمية بدون صلاحية داخل السيرفر.',
    'يمنع نشر الإعلانات أو روابط السيرفرات الأخرى أو بيع وشراء ممتلكات السيرفر بأموال حقيقية.',
    'يجب استخدام اسم وشخصية مناسبة للرول بلاي، وتجنب الأسماء الساخرة أو غير الواقعية.'
  ]],
  ['أساسيات الرول بلاي',[
    'RDM: يمنع قتل أو إيذاء لاعب بدون سبب أو سيناريو رول بلاي واضح ومبرر.',
    'VDM: يمنع استخدام المركبة كسلاح لدهس اللاعبين عمدًا بدون سبب رول بلاي منطقي.',
    'Meta Gaming: يمنع استخدام معلومات عرفتها من Discord أو بث أو صديق خارج اللعبة داخل شخصيتك.',
    'Power Gaming: يمنع فرض أفعال غير واقعية على لاعب آخر أو القيام بأشياء تتجاوز قدرة الشخصية الطبيعية.',
    'Fail RP: يجب الحفاظ على واقعية الشخصية والسيناريو وعدم التصرف بطريقة تفسد الرول بلاي.',
    'Fear RP / Value of Life: حافظ على حياة شخصيتك وتصرف بخوف منطقي عند وجود تهديد حقيقي ومباشر.',
    'NLR: بعد موت الشخصية لا تستخدم معلومات اللحظات التي أدت للموت للانتقام أو العودة فورًا لنفس السيناريو.',
    'Combat Logging: يمنع الخروج من السيرفر للهروب من مطاردة أو اعتقال أو سرقة أو أي سيناريو قائم.',
    'Revenge RP: يمنع الانتقام اعتمادًا على معلومات لا يفترض أن شخصيتك تتذكرها بعد انتهاء حياتها في السيناريو.',
    'يمنع إجبار لاعب على تصرف غير ممكن ميكانيكيًا أو منعه من فرصة منطقية للرد داخل السيناريو.'
  ]],
  ['السرقة والخطف',[
    'يجب وجود سبب وسيناريو واضح قبل الخطف أو السرقة، ويمنع الخطف العشوائي لمجرد التسلية.',
    'يجب إعطاء الطرف الآخر وقتًا كافيًا لفهم الأوامر والتفاعل معها قبل التصعيد.',
    'يمنع إجبار لاعب على تحويل ممتلكات لا تسمح أنظمة السيرفر بسرقتها أو استغلال القوائم لإجباره عليها.',
    'يمنع قتل الرهينة بدون تصعيد أو سبب قوي داخل السيناريو، ويجب إعطاء قيمة لحياة الرهائن.',
    'يمنع تكرار خطف أو استهداف نفس الشخص بصورة مزعجة أو بهدف المضايقة.'
  ]],
  ['المركبات والمطاردات',[
    'القيادة يجب أن تكون منطقية حسب نوع المركبة والطريق؛ يمنع القفزات والتصرفات غير الواقعية بلا ضرورة.',
    'بعد حادث قوي يجب تمثيل أثر الحادث على الشخصية والمركبة بدل الاستمرار كأن شيئًا لم يحدث.',
    'يمنع استخدام مركبات غير مناسبة لتجاوز تضاريس أو حواجز بصورة غير واقعية.',
    'أثناء المطاردة يمنع استغلال الجراج أو تغيير المركبة بطريقة فورية فقط للهروب من السيناريو.'
  ]],
  ['الشرطة و EMS',[
    'يجب احترام سيناريوهات الشرطة وEMS وعدم تعطيل عملهم بدون سبب رول بلاي.',
    'يمنع ادعاء الإصابة أو فقدان الوعي فقط للهروب من موقف أو عقوبة بدون سبب منطقي.',
    'عند إسعافك مثّل الإصابات بما يتناسب مع الحادث، ولا تعد مباشرة للقتال وكأنك لم تُصب.',
    'المعلومات التي يسمعها أو يراها لاعب أثناء فقدان الوعي لا تستخدم لاحقًا إذا لم يكن منطقيًا أن تتذكرها الشخصية.'
  ]],
  ['العصابات والإجرام',[
    'الخلافات بين العصابات يجب أن تبدأ بسبب رول بلاي واضح، وليس لمجرد البحث عن إطلاق نار.',
    'يمنع تحويل كل تفاعل إلى قتال؛ التفاوض والتهديد والتصعيد التدريجي جزء أساسي من الرول بلاي.',
    'يمنع التحالف المؤقت غير المنطقي فقط للحصول على أفضلية عددية في قتال قائم.',
    'احترم حدود السيناريو وأي قيود عددية أو تنظيمية تعلنها إدارة Turbo للأحداث والعصابات.'
  ]],
  ['المناطق الآمنة والتفاعل',[
    'يمنع بدء أعمال عدائية في المناطق التي تحددها الإدارة كمناطق آمنة إلا إذا نصت قواعد حدث على غير ذلك.',
    'لا تستخدم المنطقة الآمنة للهروب من سيناريو بدأ بالفعل خارجها.',
    'يمنع إزعاج اللاعبين عمدًا بالصوت أو المركبات أو تكرار تعطيل تفاعلهم بدون هدف رول بلاي.'
  ]],
  ['الصوت و Discord والبث',[
    'يمنع استخدام مكالمات خارجية لنقل معلومات أثناء اللعب إذا كانت شخصيتك لا تستطيع التواصل بها داخل اللعبة.',
    'مشاهدة بث لاعب للحصول على موقعه أو معلومات عنه ثم استخدامها داخل اللعبة تعتبر Stream Sniping وMeta Gaming.',
    'يجب عدم تشغيل أصوات مزعجة أو محتوى مخالف عبر المايك، واحترام قواعد قنوات Discord الرسمية.',
    'يمنع نقل أحداث السيناريو الحي إلى أشخاص خارج اللعبة بهدف التأثير على ما يحدث داخل السيرفر.'
  ]],
  ['الشخصية والهوية',[
    'التزم بشخصية واحدة متماسكة من حيث الاسم والخلفية وطريقة التصرف، ولا تغيّر شخصيتك فقط للهروب من نتائج سيناريو.',
    'يمنع التعرف على شخص مقنع بالكامل من صوته فقط إذا لم توجد قرائن منطقية داخل السيناريو.',
    'لا تستخدم أسماء مشاهير أو أسماء ساخرة أو أسماء تخالف أجواء الرول بلاي الجاد.',
    'أي معرفة تخص شخصية أخرى يجب أن تكون قد وصلت لشخصيتك داخل اللعبة بطريقة منطقية.'
  ]],
  ['الأسلحة والاشتباكات',[
    'إشهار السلاح أو إطلاق النار يجب أن يكون نتيجة تصعيد منطقي، وليس أول رد فعل على خلاف بسيط.',
    'يمنع إطلاق النار العشوائي أو إطلاق النار لمجرد جذب الانتباه.',
    'بعد إصابة خطيرة يجب تمثيل أثر الإصابة وعدم الاستمرار في القتال بصورة غير واقعية.',
    'لا تدخل اشتباكًا قائمًا لمجرد مساعدة صديق إذا لم تكن شخصيتك تعرف سبب الاشتباك أو طرفيه بشكل منطقي.',
    'يمنع استغلال زوايا أو أنيميشن أو أخطاء تمنحك قدرة إطلاق نار أو رؤية غير عادلة.'
  ]],
  ['الاقتصاد والممتلكات',[
    'يمنع نقل الأموال أو الممتلكات بين الشخصيات بهدف تجاوز نظام الاقتصاد أو العقوبات.',
    'يمنع الاحتيال خارج أنظمة السيرفر أو استغلال أخطاء البيع والشراء للحصول على مكاسب غير مشروعة.',
    'لا تستخدم مركبة أو منزل أو مخزن لاعب آخر بدون سبب أو صلاحية رول بلاي واضحة.',
    'أي اتفاق مالي كبير يتم داخل إطار الرول بلاي ويتحمل أطرافه نتائجه طالما لا يخالف أنظمة السيرفر.'
  ]],
  ['قواعد السيناريو والتصعيد',[
    'ابدأ السيناريو بالكلام والتفاعل عندما يكون ذلك ممكنًا، ولا تختصر كل خلاف في إطلاق نار.',
    'أعطِ الطرف الآخر فرصة معقولة للرد وفهم مطالبك قبل الانتقال لمرحلة أعلى من التصعيد.',
    'لا تُدخل معلومات أو أطرافًا جديدة في السيناريو من خارج اللعبة للحصول على أفضلية.',
    'عند انتهاء السيناريو لا تعاود فتحه فورًا بدون سبب جديد ومنطقي.',
    'قرارات الإدارة أثناء الأحداث الرسمية تكون ملزمة، ويجب الاعتراض عليها بعد انتهاء الحدث بالطريقة المخصصة.'
  ]],
  ['قواعد إضافية مهمة',[
    'يمنع AFK أثناء سيناريو قائم أو استخدامه للهروب من التفاعل.',
    'يمنع استغلال إعادة تشغيل السيرفر أو الرستارت للهروب من نتائج سيناريو أو تكرار مكاسب.',
    'يمنع استخدام Emotes أو Animations لاختراق الجدران أو إخفاء الشخصية أو الحصول على أفضلية.',
    'إذا فقدت الاتصال أثناء سيناريو، ارجع بأسرع وقت وأكمل السيناريو أو تواصل مع الإدارة عند وجود مشكلة حقيقية.',
    'القواعد الخاصة بالأحداث أو الوظائف أو العصابات التي تعلنها الإدارة تعتبر مكملة لهذه القوانين.'
  ]]
];
function renderRules(custom=[]){
  const groups=[...DEFAULT_RULE_GROUPS];
  if(custom && custom.length) groups.push(['قوانين إضافية من الإدارة',custom]);
  let n=1;
  $('#rulesList').innerHTML=groups.map(([title,rules])=>`<section class="rule-group"><div class="rule-group-title"><span>${String(n).padStart(2,'0')}</span><h3>${esc(title)}</h3></div><div class="rule-group-items">${rules.map(r=>`<div class="rule"><b>${String(n++).padStart(2,'0')}</b><span>${esc(r)}</span></div>`).join('')}</div></section>`).join('');
}

const esc = s => String(s ?? '').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),2800)}
const auditVisitorId=(()=>{let id=localStorage.getItem('turbo_visitor_id');if(!id){id=(crypto?.randomUUID?.()||('v-'+Date.now()+'-'+Math.random().toString(36).slice(2)));localStorage.setItem('turbo_visitor_id',id)}return id})();
function auditEvent(action,meta={}){if(!API_CONFIGURED)return;const headers={'content-type':'application/json'};if(token)headers.authorization=`Bearer ${token}`;fetch(API+'/api/audit/event',{method:'POST',headers,body:JSON.stringify({action,meta,path:location.pathname+location.hash,visitorId:auditVisitorId})}).catch(()=>{})}

function showSetup(){const b=$('#setupBanner');b.classList.remove('hidden');b.innerHTML='⚠️ تسجيل Discord غير مربوط لسه. افتح <b>config.js</b> وحط رابط Railway الحقيقي مكان YOUR-RAILWAY-DOMAIN.'}
function oauthLogin(e){if(e&&e.preventDefault)e.preventDefault();if(!API_CONFIGURED){showSetup();toast('رابط Railway غير مضبوط');return}window.location.assign(`${API}/auth/discord`)}

async function api(path,opt={}){
  if(!API_CONFIGURED) throw Object.assign(new Error('API_NOT_CONFIGURED'),{status:0});
  const h={'content-type':'application/json',...(opt.headers||{})};
  if(token)h.authorization=`Bearer ${token}`;
  const r=await fetch(API+path,{...opt,headers:h});
  const j=await r.json().catch(()=>({}));
  if(!r.ok)throw Object.assign(new Error(j.error||'ERROR'),{status:r.status,data:j});
  return j;
}
function consumeToken(){
  const h=new URLSearchParams(location.hash.slice(1));
  if(h.get('token')){token=h.get('token');localStorage.setItem('turbo_token',token);history.replaceState(null,'',location.pathname+location.search+'#home');return}
  const loginError=h.get('login_error');
  if(loginError){
    const msg=loginError==='discord_temporarily_unavailable'?'Discord رجّع استجابة مؤقتة غير صالحة. جرّب تسجيل الدخول مرة أخرى.':loginError==='discord_oauth_failed'?'تعذر تسجيل الدخول بـ Discord. راجع Client Secret و Redirect URL في Railway/Discord Developer Portal.':'تعذر قراءة حساب Discord.';
    history.replaceState(null,'',location.pathname+location.search+'#home');
    setTimeout(()=>toast(msg),250);
  }
}
function statusText(s){return({pending:'قيد المراجعة',pre_accepted:'مقبول مبدئيًا',voice_review:'قيد مراجعة المقابلة',voice_passed:'مقبول نهائيًا — تصريح الدخول',rejected:'مرفوض',voice_rejected:'مرفوض في المقابلة الصوتية',banned:'محظور نهائيًا',reset:'مسموح بإعادة التقديم'})[s]||s}

async function init(){
  consumeToken();
  $('#menu').onclick=()=>$('#nav').classList.toggle('open');
  document.querySelectorAll('#nav a').forEach(a=>a.onclick=(e)=>{ $('#nav').classList.remove('open'); if(a.getAttribute('href')==='#apply'){e.preventDefault();openApplicationPortal();} });
  $('#closeApplicationPortal').onclick=closeApplicationPortal;
  $('#loginBtn').href=`${API || 'https://botsturbo-production.up.railway.app'}/auth/discord`; $('#loginBtn').onclick=oauthLogin;
  $('#adminSecretBtn').onclick=openAdminPanel;
  $('#adminSecretBtn').classList.add('hidden');

  if(!API_CONFIGURED){
    showSetup();
    renderOffline();
    return;
  }
  try{
    pub=await api('/api/public');
    renderPublic();
  }catch(e){
    renderOffline('تعذر الاتصال بـ Railway. اتأكد إن البوت شغال وإن رابط Railway في config.js صحيح.');
    return;
  }

  if(token){
    try{me=await api('/api/me');renderMe()}
    catch{localStorage.removeItem('turbo_token');token='';renderApply();renderStatus()}
  }else{renderApply();renderStatus()}
}

function renderOffline(msg='الموقع جاهز، لكن رابط Railway لسه محتاج يتضاف في config.js.'){
  $('#applyState').textContent='الربط غير مكتمل';
  $('#aboutText').textContent='Turbo RP هو سيرفر رول بلاي عربي يهتم بالسيناريوهات وجودة التجربة وتفاعل اللاعبين.';
  $('#creatorGrid').innerHTML='<div class="notice">صناع المحتوى هيظهروا هنا بعد اتصال الموقع بالبوت.</div>';if($('#teamGrid'))$('#teamGrid').innerHTML='<div class="notice">فريق Turbo هيظهر هنا بعد اتصال الموقع.</div>';
  renderRules([]);
  $('#applyBox').innerHTML=`<div class="notice bad">${esc(msg)}</div><br><button class="discord-btn" onclick="oauthLogin()">تسجيل دخول Discord</button>`;
  $('#statusBox').innerHTML='<div class="notice">بعد تسجيل الدخول هتشوف حالة تقديمك هنا.</div>';
}

function renderPublic(){
  $('#aboutText').textContent=pub.settings.aboutText;
  renderRules(pub.settings.rules || []);

  const logoSrc=String(pub.settings.logoImage||'turbo-logo.png?v=24').trim()||'turbo-logo.png?v=24';
  document.querySelectorAll('[data-turbo-logo]').forEach(img=>{if(img.src!==logoSrc)img.src=logoSrc});

  const city=String(pub.settings.cityBackground||'').trim();
  const cityPhoto=$('#cityPhoto');
  if(cityPhoto){
    if(city){
      cityPhoto.style.backgroundImage=`url(${JSON.stringify(city)})`;
      document.body.classList.add('has-custom-city');
    }else{
      cityPhoto.style.backgroundImage='';
      document.body.classList.remove('has-custom-city');
    }
  }

  const team=Array.isArray(pub.teamMembers)?pub.teamMembers:[];
  if($('#teamGrid')){
    $('#teamGrid').innerHTML=team.length?team.map((m,i)=>`
      <article class="team-card" style="--team-delay:${Math.min(i,8)*45}ms">
        <div class="team-photo">
          <img src="${esc(m.image||logoSrc)}" alt="${esc(m.name||'Turbo Team')}">
          <span>${String(i+1).padStart(2,'0')}</span>
        </div>
        <div class="team-info">
          <small>TURBO TEAM</small>
          <h3>${esc(m.name||'')}</h3>
          <b>${esc(m.rank||'Team')}</b>
        </div>
      </article>`).join(''):'<div class="notice team-empty">لسه مفيش أعضاء مضافين في فريق الموقع.</div>';
  }

  $('#creatorGrid').innerHTML=pub.creators.length?pub.creators.map(c=>`<a class="creator" href="${esc(c.url)}" target="_blank" rel="noopener"><img src="${esc(c.image||'')}" alt="${esc(c.name)}"><div class="meta"><h3>${esc(c.name)}</h3>${c.isLive?'<span class="live">● LIVE</span>':'<span class="offline">OFFLINE</span>'}</div></a>`).join(''):'<div class="notice">هيتم إضافة صناع المحتوى من لوحة التحكم.</div>';
  $('#applyState').textContent=pub.settings.applicationsOpen?'التقديم مفتوح الآن':'التقديم مغلق حاليًا';
}
function syncApplicationLabels(){
  const hasApplication=!!(token&&me?.latest);
  const nav=$('#applicationNavLink');
  const title=$('#applicationSectionTitle');
  const kicker=$('#applicationSectionKicker');
  const subtitle=$('#applicationSectionSubtitle');
  if(nav) nav.textContent=hasApplication?'حالة التقديم':'التقديم';
  if(title) title.textContent=hasApplication?'حالة التقديم':'التقديم';
  if(kicker) kicker.textContent=hasApplication?'APPLICATION STATUS':'APPLICATION';
  if(subtitle) subtitle.textContent=hasApplication?'تابع قرار الإدارة وتفاصيل تقديمك من هنا.':'سجل بحساب Discord وابدأ.';
}

function renderMe(){
  syncApplicationLabels();
  $('#loginBtn').innerHTML=`<span class="discord-dot">◈</span><span>${esc(me.user.globalName||me.user.username)} • خروج</span>`;
  $('#loginBtn').onclick=()=>{localStorage.removeItem('turbo_token');location.reload()};
  const adminBtn=$('#adminSecretBtn');
  if(me?.isAdmin) adminBtn.classList.remove('hidden'); else adminBtn.classList.add('hidden');
  renderApply();renderStatus();
}
function renderApply(){
  syncApplicationLabels();
  const box=$('#applyBox');
  if(!token){
    box.innerHTML=`<div class="apply-launch-card"><div class="apply-launch-copy"><span>TURBO ENTRY</span><h3>ابدأ تقديم Turbo RP</h3><p>سجّل بحساب Discord الأول علشان التقديم يرتبط بحسابك.</p></div><button class="btn primary apply-launch-btn" type="button" onclick="oauthLogin()">تسجيل الدخول بـ Discord</button></div>`;
    return;
  }
  // صفحة واحدة فقط: لو فيه تقديم محفوظ نعرض حالته هنا بدل وجود صفحة حالة منفصلة.
  if(me?.latest){
    $('#apply')?.classList.add('showing-application-status');
    const allowNew=!!me.canApply && !!pub?.settings?.applicationsOpen && me.latest.status!=='banned' && me.latest.status!=='voice_passed';
    box.innerHTML=buildStatusMarkup(me.latest,{showReapply:allowNew});
    return;
  }
  $('#apply')?.classList.remove('showing-application-status');
  if(!pub.settings.applicationsOpen){
    box.innerHTML='<div class="notice">التقديم مغلق حاليًا من الإدارة.</div>';
    return;
  }
  box.innerHTML=`<div class="apply-launch-card"><div class="apply-launch-copy"><span>TURBO ENTRY</span><h3>جاهز تبدأ شخصيتك؟</h3><p>اختار نوع الشخصية الأول، وبعدها هيفتح نموذج التقديم في صفحة مستقلة.</p></div><button class="btn primary apply-launch-btn" type="button" onclick="openApplicationPortal()">ابدأ التقديم</button></div>`;
}
function roleCards(){return CHARACTER_TYPES.map(c=>`<button type="button" class="character-card" onclick="chooseCharacter('${c.id}')"><div class="character-visual character-${c.id}"><span>${c.icon}</span><i></i></div><div class="character-meta"><small>${c.sub}</small><b>${c.name}</b><p>${c.desc}</p></div><em>اختيار</em></button>`).join('')}
window.openApplicationPortal=openApplicationPortal;
function openApplicationPortal(){
  if(!token){oauthLogin();return}
  auditEvent('application_portal_open',{canApply:!!me?.canApply,status:me?.latest?.status||null});
  const portal=$('#applicationPortal');
  portal.classList.remove('hidden');portal.setAttribute('aria-hidden','false');document.body.classList.add('portal-open');
  if(!pub.settings.applicationsOpen){$('#applicationPortalBody').innerHTML='<div class="portal-message"><b>التقديم مغلق حاليًا</b><p>ارجع في وقت لاحق بعد فتح التقديم من الإدارة.</p></div>';return}
  if(me&&!me.canApply){$('#applicationPortalBody').innerHTML=`<div class="portal-message"><b>مش متاح تقديم جديد حاليًا</b><p>حالة تقديمك موجودة في صفحة التقديم نفسها.</p><button class="smallbtn" onclick="closeApplicationPortal();location.hash='apply';renderApply()">الرجوع للتقديم</button></div>`;return}
  selectedCharacterType='';
  $('#applicationPortalBody').innerHTML=`<div class="portal-intro"><span>STEP 01 / CHARACTER</span><h2>اختار بداية شخصيتك</h2><p>الاختيار ده بيساعد الإدارة تفهم اتجاه الشخصية. تقدر تطور قصتك بعد الدخول.</p></div><div class="character-grid">${roleCards()}</div>`;
}
window.closeApplicationPortal=closeApplicationPortal;
function closeApplicationPortal(){const portal=$('#applicationPortal');portal.classList.add('hidden');portal.setAttribute('aria-hidden','true');document.body.classList.remove('portal-open')}
window.chooseCharacter=function(id){
  const c=CHARACTER_TYPES.find(x=>x.id===id);if(!c)return;selectedCharacterType=id;auditEvent('character_selected',{characterType:id});
  $('#applicationPortalBody').innerHTML=`<div class="portal-intro form-intro"><button class="portal-back" type="button" onclick="openApplicationPortal()">↩ تغيير الشخصية</button><span>STEP 02 / APPLICATION</span><h2>${c.name}</h2><p>كمّل بياناتك وإجاباتك. كل اللي هتكتبه هيتحفظ ويظهر للإدارة.</p></div><form id="applyForm" class="vision-form portal-form"><div class="selected-character-strip"><div class="mini-role ${'character-'+c.id}">${c.icon}</div><div><small>${c.sub}</small><b>${c.name}</b></div></div>
    <div class="vision-form-section"><div class="vision-section-title"><span>01</span><div><b>بياناتك الأساسية</b><small>Basic information</small></div></div><div class="form-grid"><div class="field"><label>الاسم الحقيقي ثنائي</label><input name="realName" required placeholder="الاسم الأول واسم العائلة"></div><div class="field"><label>العمر</label><input name="age" type="number" min="16" max="80" required placeholder="مثال: 21"></div></div></div>
    <div class="vision-form-section"><div class="vision-section-title"><span>02</span><div><b>قصة الشخصية</b><small>Character story</small></div></div><div class="field full"><textarea name="story" minlength="120" required placeholder="اكتب قصة شخصيتك بنفسك... مين هي؟ جاية منين؟ وإيه هدفها في المدينة؟"></textarea></div></div>
    <div class="vision-form-section"><div class="vision-section-title"><span>03</span><div><b>أسئلة الرول بلاي</b><small>Roleplay questions</small></div></div>${pub.questions.map((q,i)=>`<div class="vision-question"><div class="vision-q-number">${String(i+1).padStart(2,'0')}</div><div class="vision-q-body"><strong>${esc(q)}</strong><textarea name="q${i}" required minlength="10" placeholder="اكتب إجابتك هنا..."></textarea></div></div>`).join('')}</div>
    <div class="vision-submit"><div><b>راجع إجاباتك قبل الإرسال</b><small>بعد الإرسال هتقدر تتابع حالة الطلب من الموقع.</small></div><button class="btn primary" type="submit">إرسال التقديم</button></div></form>`;
  $('#applyForm').onsubmit=submitApply;
};
async function submitApply(e){e.preventDefault();const f=new FormData(e.target);const body={realName:f.get('realName'),age:Number(f.get('age')),story:f.get('story'),characterType:selectedCharacterType,answers:pub.questions.map((_,i)=>f.get('q'+i))};try{const j=await api('/api/applications',{method:'POST',body:JSON.stringify(body)});toast(`تم إرسال التقديم رقم #${j.application.number}`);auditEvent('application_submitted',{applicationNumber:j.application.number});me=await api('/api/me');renderMe();closeApplicationPortal();location.hash='apply'}catch(e){toast(errorArabic(e.message))}}
function errorArabic(e){return({REAL_NAME_TWO_PARTS:'اكتب الاسم الحقيقي ثنائي.',INVALID_AGE:'العمر غير صحيح.',STORY_TOO_SHORT:'قصة الشخصية قصيرة جدًا.',ANSWERS_INCOMPLETE:'كمّل كل أسئلة الرول بلاي.',INVALID_CHARACTER_TYPE:'اختار نوع الشخصية الأول.',COOLDOWN:'لسه مدة الـ12 ساعة مخلصتش.',BLOCKED:'عندك تقديم قائم بالفعل.',CLOSED:'التقديم مغلق.',BANNED:'الحساب ده محظور نهائيًا من التقديم.',API_NOT_CONFIGURED:'رابط Railway مش متظبط.'})[e]||'حصل خطأ. جرّب تاني.'}
function countdown(){const end=Date.now()+me.waitMs;const tick=()=>{const el=$('#countdown');if(!el)return;const d=Math.max(0,end-Date.now()),h=Math.floor(d/3600000),m=Math.floor(d%3600000/60000),s=Math.floor(d%60000/1000);el.textContent=`${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;if(d<=0)setTimeout(()=>location.reload(),1000)};tick();setInterval(tick,1000)}
function statusVisual(status){
  const cfg={
    pending:['قيد المراجعة','طلبك وصل للإدارة','clock'],voice_review:['قيد مراجعة المقابلة','قرار المقابلة بيتراجع حاليًا','clock'],
    pre_accepted:['مقبول مبدئيًا','استعد للمرحلة الصوتية','check'],voice_passed:['تم القبول','أهلًا بيك في Turbo RP','check'],
    rejected:['تم الرفض','راجع السبب وقدّم مرة تانية بعد المدة','x'],voice_rejected:['رفض المقابلة','تقدر تحاول مرة تانية حسب النظام','x'],banned:['محظور','الحساب موقوف من التقديم','ban']
  }[status]||['حالة التقديم','تابع قرار الإدارة','clock'];
  const icon=cfg[2]==='check'?'<path d="M23 49l16 16 34-38"/>':cfg[2]==='x'?'<path d="M29 29l42 42M71 29L29 71"/>':cfg[2]==='ban'?'<circle cx="50" cy="50" r="28"/><path d="M30 70L70 30"/>':'<circle cx="50" cy="50" r="29"/><path d="M50 31v20l14 9"/>';
  return `<div class="status-visual status-visual-${cfg[2]}"><div class="status-art"><svg viewBox="0 0 100 100" aria-hidden="true">${icon}</svg><i class="status-orbit one"></i><i class="status-orbit two"></i></div><div class="status-art-copy"><small>APPLICATION STATUS</small><h3>${cfg[0]}</h3><p>${cfg[1]}</p></div></div>`;
}
function buildStatusMarkup(a,{showReapply=false}={}){
  let x=`<div class="status-card unified-application-status">${statusVisual(a.status)}<span class="tag">تقديم #${a.number}</span><h3>${statusText(a.status)}</h3><div>الاسم: <b>${esc(a.realName)}</b></div>`;
  if(a.status==='pending')x+='<div class="notice">طلبك وصل للإدارة وحاليًا قيد المراجعة.</div>';
  if(a.status==='rejected')x+=`<div class="notice bad"><b>سبب الرفض:</b><br>${esc(a.reason||'لم يتم تحديد سبب')}</div>`;
  if(a.status==='pre_accepted'){x+='<div class="notice good">تم قبولك مبدئيًا. المرحلة الثانية هي المقابلة الصوتية.</div>';if(me.booked)x+=`<div class="notice">موعدك المحجوز: <b>${new Date(me.booked.at).toLocaleString('ar-EG')}</b><br>${esc(me.booked.note||'')}</div>`;else x+=`<h3>اختار موعد المقابلة</h3><div class="list">${pub.interviewSlots.length?pub.interviewSlots.map(s=>`<div class="item"><span>${new Date(s.at).toLocaleString('ar-EG')}<br><small>${esc(s.note||'')}</small></span><button class="smallbtn" onclick="bookSlot('${s.id}')">حجز</button></div>`).join(''):'<div class="notice">لا توجد مواعيد متاحة حاليًا.</div>'}</div>`}
  if(a.status==='voice_review')x+='<div class="notice">🕒 المقابلة الصوتية قيد مراجعة الإدارة.</div>';
  if(a.status==='voice_rejected')x+=`<div class="notice bad"><b>تم رفض المقابلة الصوتية</b>${a.reason?`<br>السبب: ${esc(a.reason)}`:'<br>لم يتم تحديد سبب.'}</div>`;
  if(a.status==='voice_passed')x+='<div class="notice good">✅ تم قبولك في المقابلة ومنحك تصريح الدخول.</div>';
  if(a.status==='banned')x+=`<div class="notice bad"><b>⛔ حظر دائم من التقديم</b><br>${esc(a.reason||'تم حظر الحساب من التقديم.')}</div>`;
  if(a.status==='reset')x+='<div class="notice good">✅ الإدارة سمحت لك بإعادة التقديم.</div>';
  if(me?.waitMs>0&&['rejected','voice_rejected'].includes(a.status))x+=`<div class="notice">متبقي على إعادة التقديم: <b id="countdown"></b></div>`;
  const submittedAnswers=(a.answers||[]).map((item,i)=>{const q=(item&&typeof item==='object'&&item.q)?item.q:(pub.questions?.[i]||`السؤال ${i+1}`);const ans=(item&&typeof item==='object')?(item.a??item.answer??''):item;return `<div class="review-answer"><div class="review-q"><span>${String(i+1).padStart(2,'0')}</span><b>${esc(q)}</b></div><div class="review-a">${esc(ans||'—')}</div></div>`}).join('');
  x+=`<div class="applicant-submission"><div class="review-meta"><span>بيانات التقديم</span><span>رقم التقديم #${a.number}</span>${a.characterType?`<span>الشخصية: ${esc(CHARACTER_LABELS[a.characterType]||a.characterType)}</span>`:''}${a.age?`<span>العمر: ${esc(a.age)}</span>`:''}${a.createdAt?`<span>${new Date(a.createdAt).toLocaleString('ar-EG')}</span>`:''}</div>${a.story?`<div class="review-block"><label>قصة الشخصية</label><p>${esc(a.story)}</p></div>`:''}<div class="review-answers">${submittedAnswers||'<div class="notice">لا توجد إجابات محفوظة لهذا التقديم.</div>'}</div></div>`;
  if(showReapply)x+=`<div class="reapply-panel"><div><b>مسموح لك تقدم من جديد</b><p>مدة الانتظار انتهت أو الإدارة سمحت بإعادة التقديم.</p></div><button class="btn primary" type="button" onclick="openApplicationPortal()">تقديم جديد</button></div>`;
  x+='</div>';
  setTimeout(()=>{if(me?.waitMs>0)countdown()},0);
  return x;
}
function renderStatus(){
  const box=$('#statusBox');
  if(!box)return;
  box.innerHTML='';
}
window.bookSlot=async id=>{try{await api(`/api/interviews/${id}/book`,{method:'POST',body:'{}'});toast('تم حجز الموعد');auditEvent('interview_booked',{slotId:id});me=await api('/api/me');pub=await api('/api/public');renderApply()}catch{toast('الموعد غير متاح')}};

async function openAdminPanel(){
  if(!token){toast('سجّل دخول بحساب Discord الأول.');return;}
  if(!me?.isAdmin){toast('غير مصرح لك بفتح لوحة التحكم.');return;}
  try{
    $('#admin').classList.remove('hidden');
    await renderAdmin();
    location.hash='admin';
  }catch(e){
    toast(e?.status===403?'غير مصرح لك بفتح لوحة التحكم.':'تعذر فتح لوحة التحكم.');
  }
}
let adminState=null;
let applicationStatusFilter='all';
function adminActionButtons(a){
  const id=esc(a.id);
  if(a.status==='pending')return `<button class="admin-act good" onclick="applicationAction('${id}','pre_accept')">قبول مبدئي</button><button class="admin-act danger" onclick="rejectApplication('${id}')">رفض</button><button class="admin-act warn" onclick="applicationAction('${id}','ban',prompt('سبب الحظر الدائم؟')||'حظر دائم من التقديم')">حظر دائم</button>`;
  if(['pre_accepted','voice_review'].includes(a.status))return `<button class="admin-act neutral" onclick="applicationAction('${id}','voice_review')">قيد المراجعة</button><button class="admin-act good" onclick="applicationAction('${id}','voice_pass')">قبول الصوتي</button><button class="admin-act danger" onclick="voiceReject('${id}')">رفض الصوتي</button><button class="admin-act warn" onclick="applicationAction('${id}','ban',prompt('سبب الحظر الدائم؟')||'حظر دائم من التقديم')">حظر دائم</button>`;
  if(a.status==='banned')return `<button class="admin-act neutral" onclick="applicationAction('${id}','reset')">إلغاء الحظر والسماح بالتقديم</button>`;
  return `<button class="admin-act neutral" onclick="applicationAction('${id}','reset')">سماح بإعادة التقديم</button>`;
}
function applicationRow(a){return `<button class="application-row" onclick="openApplication('${esc(a.id)}')"><span class="application-index">#${a.number}</span><span class="application-person"><b>${esc(a.realName)}</b><small>${esc(a.discordTag||'Discord')} • ${esc(a.discordId)}</small></span><span class="application-status status-${esc(a.status)}">${statusText(a.status)}</span><span class="application-open">عرض ←</span></button>`}
function applicationMatchesTab(a){
  if(applicationStatusFilter==='all')return true;
  if(applicationStatusFilter==='review')return ['pending','pre_accepted','voice_review'].includes(a.status);
  if(applicationStatusFilter==='accepted')return ['pre_accepted','voice_review','voice_passed'].includes(a.status);
  if(applicationStatusFilter==='rejected')return ['rejected','voice_rejected','banned'].includes(a.status);
  return a.status===applicationStatusFilter;
}
function filterApplications(){
  if(!adminState)return;
  const q=String($('#applicationSearch')?.value||'').trim().toLowerCase();
  const rows=[...adminState.applications].reverse().filter(a=>applicationMatchesTab(a)&&(!q||String(a.realName||'').toLowerCase().includes(q)||String(a.discordId||'').includes(q)||String(a.discordTag||'').toLowerCase().includes(q)||String(a.number).includes(q)));
  const list=$('#applicationList');if(list)list.innerHTML=rows.map(applicationRow).join('')||'<div class="notice">مفيش تقديمات في القسم ده.</div>';
}
window.filterApplications=filterApplications;
window.setApplicationFilter=f=>{applicationStatusFilter=f;document.querySelectorAll('.application-filter-btn').forEach(b=>b.classList.toggle('active',b.dataset.filter===f));filterApplications()};
window.openApplication=id=>{
  const a=adminState?.applications?.find(x=>x.id===id);if(!a)return;
  const slot=a.interviewSlotId?adminState.interviewSlots.find(s=>s.id===a.interviewSlotId):null;
  const decisionInfo=(['rejected','voice_rejected','banned'].includes(a.status)||a.reviewedAt||a.voicePassedAt||a.voiceReviewedAt)?`<div class="review-decision"><div><label>النتيجة الحالية</label><b>${statusText(a.status)}</b></div>${a.reason?`<div><label>السبب</label><p>${esc(a.reason)}</p></div>`:''}${a.reviewedBy?`<div><label>تمت المراجعة بواسطة</label><p>${esc(a.reviewedBy)}</p></div>`:''}${a.reviewedAt?`<div><label>وقت مراجعة المرحلة الأولى</label><p>${new Date(a.reviewedAt).toLocaleString('ar-EG')}</p></div>`:''}${a.voiceReviewedAt?`<div><label>وقت مراجعة الصوتي</label><p>${new Date(a.voiceReviewedAt).toLocaleString('ar-EG')}</p></div>`:''}${a.voicePassedAt?`<div><label>وقت القبول النهائي</label><p>${new Date(a.voicePassedAt).toLocaleString('ar-EG')}</p></div>`:''}</div>`:'';
  $('#applicationReview').innerHTML=`<div class="review-shell"><div class="review-head"><div><span>APPLICATION #${a.number}</span><h3>${esc(a.realName)}</h3><p>${esc(a.discordTag||'')} • ${esc(a.discordId)} • العمر ${esc(a.age)}</p></div><button class="review-close" onclick="closeApplication()">✕</button></div><div class="review-meta"><span>${statusText(a.status)}</span><span>رقم التقديم #${a.number}</span><span>Discord ID: ${esc(a.discordId)}</span>${a.characterType?`<span>الشخصية: ${esc(CHARACTER_LABELS[a.characterType]||a.characterType)}</span>`:''}<span>${new Date(a.createdAt).toLocaleString('ar-EG')}</span>${slot?`<span>مقابلة: ${new Date(slot.at).toLocaleString('ar-EG')}</span>`:''}</div>${decisionInfo}<div class="review-block"><label>قصة الشخصية</label><p>${esc(a.story)}</p></div><div class="review-answers">${(a.answers||[]).map((x,i)=>`<div class="review-answer"><div class="review-q"><span>${String(i+1).padStart(2,'0')}</span><b>${esc(x.q)}</b></div><div class="review-a">${esc(x.a||'—')}</div></div>`).join('')}</div><div class="review-actions">${adminActionButtons(a)}</div></div>`;
  $('#applicationReview').classList.remove('hidden');
};
window.closeApplication=()=>{$('#applicationReview')?.classList.add('hidden')};
window.rejectApplication=async id=>{const reason=prompt('اكتب سبب الرفض. سيظهر للمتقدم:');if(reason===null)return;await applicationAction(id,'reject',reason)};
window.voiceReject=async id=>{const reason=prompt('سبب رفض المقابلة الصوتية؟ اتركه فاضي للرفض بدون سبب.');if(reason===null)return;await applicationAction(id,'voice_reject',reason)};
window.applicationAction=async(id,action,reason='')=>{try{await api(`/api/admin/applications/${id}/action`,{method:'POST',body:JSON.stringify({action,reason})});toast('تم تحديث حالة التقديم');auditEvent('admin_application_action',{applicationId:id,action,reason:reason||''});await renderAdmin();if($('#applicationReview')&&!$('#applicationReview').classList.contains('hidden')){const a=adminState?.applications?.find(x=>x.id===id);if(a)openApplication(id)}}catch(e){toast(`تعذر تنفيذ العملية: ${e.message}`)}};
function staffRoleText(role){return role==='owner'?'OWNER':role==='manager'?'MANAGER':'ADMIN'}
function staffCard(x,canRemove=false){
  const name=esc(x.globalName||x.username||'Unknown');
  const user=esc(x.username||'Unknown');
  const id=esc(x.discordId||'');
  const avatar=esc(x.avatarUrl||'https://cdn.discordapp.com/embed/avatars/0.png');
  return `<div class="staff-card">
    <img class="staff-avatar" src="${avatar}" alt="${name}">
    <div class="staff-info"><div class="staff-name-row"><b>${name}</b><span class="staff-role role-${esc(x.role||'admin')}">${staffRoleText(x.role)}</span></div><small>@${user}</small><code>${id}</code></div>
    ${canRemove?`<button class="danger staff-remove" onclick="removePanelAdmin('${id}')">حذف</button>`:''}
  </div>`;
}

function publicTeamCard(m){
  return `<div class="admin-team-row">
    <img src="${esc(m.image||'turbo-logo.png?v=24')}" alt="${esc(m.name||'')}">
    <div><b>${esc(m.name||'')}</b><span>${esc(m.rank||'')}</span></div>
    <button class="danger" type="button" onclick="deleteTeamMember('${esc(m.id)}')">حذف</button>
  </div>`;
}

function fileToDataUrl(file,maxBytes=650000){
  return new Promise((resolve,reject)=>{
    if(!file)return resolve('');
    if(file.size>maxBytes)return reject(new Error('IMAGE_TOO_LARGE'));
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result||''));
    reader.onerror=()=>reject(new Error('READ_FAILED'));
    reader.readAsDataURL(file);
  });
}

async function renderAdmin(){
  adminState=await api('/api/admin/state');
  const st=adminState;
  const viewerLabel=staffRoleText(st.viewer?.role||'admin');
  const canManageStaff=!!st.viewer?.isManager;
  const canManageManagers=!!st.viewer?.isOwner;
  const manageableStaff=(st.panelAdmins||[]).filter(a=>canManageManagers || a.role!=='manager');
  const staffControls=`<div class="card manager-only-card staff-permissions-card">
      <div class="manager-badge">${viewerLabel}</div>
      <h3>إدارة صلاحيات اللوحة</h3>
      ${canManageStaff?`<p>${canManageManagers?'أنت الـ Owner. تقدر تضيف Manager أو Admin.':'أنت Manager. تقدر تضيف Admin.'} اكتب Discord User ID وبيانات الحساب هتظهر تلقائيًا.</p>
      <form id="panelAdminForm" class="inline-admin-form staff-add-form">
        <input name="discordId" inputmode="numeric" placeholder="Discord User ID" required>
        ${canManageManagers?'<select name="role" required><option value="admin">Admin</option><option value="manager">Manager</option></select>':'<input type="hidden" name="role" value="admin">'}
        <button class="smallbtn" type="submit">إضافة إداري</button>
      </form>
      <div class="staff-manage-list">${manageableStaff.map(a=>staffCard(a,true)).join('')||'<div class="notice">لا يوجد إداريون مضافون بعد.</div>'}</div>`:`<div class="notice">حسابك داخل اللوحة بصلاحية <b>${viewerLabel}</b>. إضافة Admin أو Manager متاحة للـ Owner والـ Manager فقط.</div>`}
    </div>`;
  const ownerControls=st.viewer?.isOwner?`<div class="card manager-only-card">
      <div class="manager-badge">DATA SAFE</div>
      <h3>نسخة احتياطية</h3>
      <p>نزّل كل بيانات التقديمات والإدارة قبل حذف أو نقل Railway. تقدر ترفع نفس الملف في المشروع الجديد.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="smallbtn" type="button" onclick="exportTurboBackup()">تنزيل نسخة</button><button class="smallbtn" type="button" onclick="exportAuditLog()">سجل النشاط</button><label class="smallbtn" style="cursor:pointer">استرجاع نسخة<input id="turboBackupFile" type="file" accept="application/json,.json" hidden onchange="importTurboBackup(this)"></label></div>
    </div>`:'';

  $('#adminBox').innerHTML=`<div class="admin-dashboard">
    <div class="admin-topline"><div><span>TURBO CONTROL</span><h3>لوحة التحكم</h3></div><div class="admin-viewer">${viewerLabel}</div></div>
    <div class="admin-summary"><div class="admin-stat"><b>${st.applications.length}</b><span>كل التقديمات</span></div><div class="admin-stat"><b>${st.applications.filter(a=>a.status==='pending').length}</b><span>قيد المراجعة</span></div><div class="admin-stat"><b>${st.applications.filter(a=>['pre_accepted','voice_review'].includes(a.status)).length}</b><span>المرحلة الثانية</span></div><div class="admin-stat"><b>${st.applications.filter(a=>a.status==='voice_passed').length}</b><span>مقبولين نهائيًا</span></div></div>
    <div class="admin-control-grid">
      <div class="card admin-settings-card"><h3>حالة التقديم</h3><p>الحالة الحالية: <b>${st.settings.applicationsOpen?'مفتوح':'مغلق'}</b></p><button class="${st.settings.applicationsOpen?'danger':'btn primary'}" onclick="toggleApps(${!st.settings.applicationsOpen})">${st.settings.applicationsOpen?'قفل التقديم':'فتح التقديم'}</button></div>

      <div class="card admin-content-settings">
        <h3>محتوى الموقع</h3>
        <p>عدّل نبذة Turbo والقوانين الإضافية بدون لمس الكود.</p>
        <form id="siteSettingsForm">
          <div class="field"><label>من نحن</label><textarea name="aboutText">${esc(st.settings.aboutText||'')}</textarea></div>
          <div class="field"><label>قوانين إضافية — كل قانون في سطر</label><textarea name="rules">${esc((st.settings.rules||[]).join('\n'))}</textarea></div>
          <button class="smallbtn" type="submit">حفظ محتوى الموقع</button>
        </form>
      </div>

      <div class="card admin-branding-card">
        <div class="admin-card-kicker">BRANDING</div>
        <h3>اللوجو وخلفية المدينة</h3>
        <p>ده المكان الخاص بالهوية البصرية. تقدر تحط رابط اللوجو أو ترفعه من جهازك، وتحط صورة مدينة تتحرك بهدوء في الخلفية.</p>
        <form id="brandingForm" class="form-grid">
          <div class="field full"><label>رابط اللوجو</label><input name="logoImage" value="${esc(st.settings.logoImage||'')}" placeholder="https://.../logo.png"></div>
          <div class="field full"><label>أو ارفع لوجو من الجهاز — حد أقصى 650KB</label><input id="logoFileInput" name="logoFile" type="file" accept="image/png,image/jpeg,image/webp"></div>
          <div class="branding-preview"><img src="${esc(st.settings.logoImage||'turbo-logo.png?v=24')}" alt="Turbo logo preview"><span>معاينة اللوجو</span></div>
          <div class="field full"><label>رابط خلفية المدينة</label><input name="cityBackground" value="${esc(st.settings.cityBackground||'')}" placeholder="https://.../city.jpg"></div>
          <small class="field-hint">الخلفية نفسها بتتحرك تلقائيًا بحركة بطيئة. لو سيبت الرابط فاضي هتظهر خلفية Skyline متحركة من الموقع.</small>
          <button class="smallbtn" type="submit">حفظ الهوية</button>
        </form>
      </div>

      <div class="card admin-public-team-card">
        <div class="admin-card-kicker">PUBLIC TEAM</div>
        <h3>فريق Turbo الظاهر في الموقع</h3>
        <p><b>ده منفصل تمامًا عن Admin / Manager / Owner.</b> الشخص هنا للعرض فقط، والرتبة بتكتبها بنفسك ومش بتديه أي صلاحيات.</p>
        <form id="publicTeamForm" class="form-grid">
          <div class="field"><input name="name" placeholder="اسم الشخص" required></div>
          <div class="field"><input name="rank" placeholder="الرتبة المكتوبة في الموقع" required></div>
          <div class="field full"><input name="image" placeholder="رابط الصورة" required></div>
          <div class="field"><input name="order" type="number" value="${(st.teamMembers||[]).length+1}" min="0" placeholder="الترتيب"></div>
          <button class="btn primary" type="submit">إضافة للفريق</button>
        </form>
        <div class="admin-public-team-list">${(st.teamMembers||[]).sort((a,b)=>(a.order||0)-(b.order||0)).map(publicTeamCard).join('')||'<div class="notice">لسه مفيش أعضاء مضافين للفريق العام.</div>'}</div>
      </div>

      ${staffControls}${ownerControls}
    </div>
    <div class="card applications-card"><div class="applications-toolbar"><div><span>APPLICATION REVIEW</span><h3>مراجعة التقديمات</h3></div><div class="application-search"><input id="applicationSearch" placeholder="ابحث بالاسم أو Discord ID أو رقم التقديم" oninput="filterApplications()"><span>⌕</span></div></div><div class="application-filters"><button class="application-filter-btn active" data-filter="all" onclick="setApplicationFilter('all')">الكل</button><button class="application-filter-btn" data-filter="review" onclick="setApplicationFilter('review')">قيد المراجعة</button><button class="application-filter-btn" data-filter="accepted" onclick="setApplicationFilter('accepted')">المقبولين</button><button class="application-filter-btn" data-filter="rejected" onclick="setApplicationFilter('rejected')">المرفوضين / المحظورين</button></div><div id="applicationList" class="application-list"></div></div>
    <div class="admin-grid"><div class="card"><h3>إضافة صانع محتوى</h3><form id="creatorForm" class="form-grid"><div class="field"><input name="name" placeholder="الاسم" required></div><div class="field"><input name="order" type="number" placeholder="الترتيب" value="1"></div><div class="field full"><input name="image" placeholder="لينك الصورة" required></div><div class="field full"><input name="url" placeholder="لينك الصفحة" required></div><div class="field"><select name="platform"><option value="youtube">YouTube</option><option value="twitch">Twitch</option><option value="other">Other</option></select></div><div class="field"><input name="platformId" placeholder="Channel ID / Twitch login"></div><button class="btn primary" type="submit">إضافة</button></form><div class="list">${st.creators.map(c=>`<div class="item"><span>${esc(c.name)} ${c.isLive?'🔴':''}</span><button class="danger" onclick="delCreator('${c.id}')">حذف</button></div>`).join('')}</div></div><div class="card"><h3>مواعيد المقابلات</h3><form id="slotForm"><div class="field"><input name="at" type="datetime-local" required></div><div class="field"><input name="note" placeholder="ملاحظة / روم المقابلة"></div><br><button class="btn primary" id="addSlotBtn" type="submit">إضافة موعد</button></form><div class="list">${st.interviewSlots.map(s=>`<div class="item"><span>${new Date(s.at).toLocaleString('ar-EG')} ${s.bookedBy?'• محجوز':''}</span>${!s.bookedBy?`<button class="danger" onclick="delSlot('${s.id}')">حذف</button>`:''}</div>`).join('')}</div></div></div>
    <div id="applicationReview" class="application-review hidden"></div>
    <div class="card staff-directory-card">
      <div class="staff-directory-head"><div><span>STAFF DIRECTORY</span><h3>إدارة Turbo</h3></div><span class="staff-count">${(st.staffDirectory||[]).length} إداري</span></div>
      <p>القائمة دي بتظهر فقط للـ Admin والـ Manager والـ Owner.</p>
      <div class="staff-directory-grid">${(st.staffDirectory||[]).map(a=>staffCard(a,false)).join('')||'<div class="notice">لا توجد بيانات إداريين.</div>'}</div>
    </div>
  </div>`;
  filterApplications();
  $('#creatorForm').onsubmit=addCreator;$('#slotForm').onsubmit=addSlot;if($('#siteSettingsForm'))$('#siteSettingsForm').onsubmit=saveSiteSettings;if($('#brandingForm'))$('#brandingForm').onsubmit=saveBrandingSettings;if($('#publicTeamForm'))$('#publicTeamForm').onsubmit=addPublicTeamMember;
  if(st.viewer?.isManager && $('#panelAdminForm'))$('#panelAdminForm').onsubmit=addPanelAdmin;
}
async function addPanelAdmin(e){
  e.preventDefault();
  const f=new FormData(e.target);
  const discordId=String(f.get('discordId')||'').trim();
  const role=String(f.get('role')||'admin')==='manager'?'manager':'admin';
  try{
    const r=await api('/api/admin/panel-admins',{method:'POST',body:JSON.stringify({discordId,role})});
    const a=r.admin||{};
    toast(`تمت إضافة ${role==='manager'?'المانجر':'الأدمن'}: ${a.globalName||a.username||discordId}`);
    await renderAdmin();
  }catch(err){
    const map={ADMIN_EXISTS:'الشخص مضاف بالفعل',ALREADY_OWNER:'ده حساب الـ Owner',INVALID_DISCORD_ID:'Discord ID غير صحيح',OWNER_ONLY:'الـ Owner فقط يقدر يضيف إدارة'};
    toast(map[err.message]||'تعذر إضافة الحساب');
  }
}
window.removePanelAdmin=async id=>{if(!confirm('حذف صلاحية هذا الإداري من لوحة التحكم؟'))return;await api(`/api/admin/panel-admins/${id}`,{method:'DELETE'});toast('تم حذف الإداري');renderAdmin()};

window.exportAuditLog=async()=>{try{const r=await fetch(API+'/api/admin/audit/export',{headers:{authorization:`Bearer ${token}`}});if(!r.ok)throw new Error('EXPORT_FAILED');const b=await r.blob();const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download=`turbo-audit-log-${Date.now()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);auditEvent('audit_export')}catch(e){toast('تعذر تحميل سجل النشاط')}};
window.exportTurboBackup=async()=>{
  try{
    const r=await fetch(`${API}/api/admin/backup/export`,{headers:{Authorization:`Bearer ${token}`}});
    if(!r.ok)throw new Error((await r.json().catch(()=>({}))).error||`HTTP_${r.status}`);
    const blob=await r.blob();
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;
    a.download=`turbo-backup-${new Date().toISOString().slice(0,10)}.json`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
    toast('تم تنزيل النسخة الاحتياطية');
  }catch(e){toast(`تعذر تنزيل النسخة: ${e.message}`)}
};
window.importTurboBackup=async input=>{
  const f=input?.files?.[0];if(!f)return;
  if(!confirm('استرجاع النسخة سيستبدل البيانات الحالية بالكامل. متابعة؟')){input.value='';return}
  try{
    const text=await f.text();const data=JSON.parse(text);
    await api('/api/admin/backup/import',{method:'POST',body:JSON.stringify(data)});
    toast('تم استرجاع كل البيانات');await renderAdmin();
  }catch(e){toast(`تعذر استرجاع النسخة: ${e.message}`)}finally{input.value=''}
};


async function saveBrandingSettings(e){
  e.preventDefault();
  const form=e.target;
  const fd=new FormData(form);
  let logoImage=String(fd.get('logoImage')||'').trim();
  const cityBackground=String(fd.get('cityBackground')||'').trim();

  try{
    const file=form.querySelector('#logoFileInput')?.files?.[0];
    if(file)logoImage=await fileToDataUrl(file,650000);
    await api('/api/admin/settings',{method:'PATCH',body:JSON.stringify({logoImage,cityBackground})});
    pub=await api('/api/public');
    renderPublic();
    toast('تم حفظ اللوجو وخلفية المدينة');
    await renderAdmin();
  }catch(err){
    toast(err.message==='IMAGE_TOO_LARGE'?'حجم اللوجو أكبر من 650KB':'تعذر حفظ الهوية');
  }
}

async function addPublicTeamMember(e){
  e.preventDefault();
  const f=Object.fromEntries(new FormData(e.target));
  f.order=Number(f.order||0);
  try{
    await api('/api/admin/team-members',{method:'POST',body:JSON.stringify(f)});
    toast('تمت إضافة الشخص للفريق العام');
    await renderAdmin();
    pub=await api('/api/public');
    renderPublic();
  }catch(err){
    toast('تعذر إضافة الشخص');
  }
}

window.deleteTeamMember=async id=>{
  if(!confirm('حذف هذا الشخص من الفريق الظاهر في الموقع؟'))return;
  await api(`/api/admin/team-members/${encodeURIComponent(id)}`,{method:'DELETE'});
  toast('تم حذف الشخص من الفريق');
  await renderAdmin();
  pub=await api('/api/public');
  renderPublic();
};

async function saveSiteSettings(e){e.preventDefault();const f=new FormData(e.target);const aboutText=String(f.get('aboutText')||'').trim();const rules=String(f.get('rules')||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);try{await api('/api/admin/settings',{method:'PATCH',body:JSON.stringify({aboutText,rules})});pub=await api('/api/public');renderPublic();toast('تم حفظ محتوى الموقع');await renderAdmin()}catch(err){toast('تعذر حفظ المحتوى')}}
window.toggleApps=async v=>{await api('/api/admin/settings',{method:'PATCH',body:JSON.stringify({applicationsOpen:v})});pub=await api('/api/public');renderPublic();renderAdmin();toast(v?'تم فتح التقديم':'تم قفل التقديم')};
window.voicePass=async id=>{await api(`/api/admin/users/${id}/voice-pass`,{method:'POST',body:'{}'});toast('تم منح تصريح الدخول');renderAdmin()};
window.resetUser=async id=>{await api(`/api/admin/users/${id}/reset`,{method:'POST',body:'{}'});toast('تم السماح بإعادة التقديم');renderAdmin()};
async function addCreator(e){e.preventDefault();const f=Object.fromEntries(new FormData(e.target));f.order=Number(f.order||0);await api('/api/admin/creators',{method:'POST',body:JSON.stringify(f)});toast('تمت إضافة صانع المحتوى');renderAdmin();pub=await api('/api/public');renderPublic()}
window.delCreator=async id=>{await api(`/api/admin/creators/${id}`,{method:'DELETE'});renderAdmin();pub=await api('/api/public');renderPublic()};
async function addSlot(e){
  e.preventDefault();
  const form=e.target;
  const btn=form.querySelector('button[type="submit"],button');
  const raw=String(new FormData(form).get('at')||'').trim();
  const note=String(new FormData(form).get('note')||'').trim();
  if(!raw){toast('اختار تاريخ ووقت الموعد');return}
  const localDate=new Date(raw);
  if(Number.isNaN(localDate.getTime())){toast('التاريخ أو الوقت غير صحيح');return}
  if(localDate.getTime()<=Date.now()+60000){toast('اختار موعد بعد الوقت الحالي');return}
  const oldText=btn?.textContent||'إضافة موعد';
  if(btn){btn.disabled=true;btn.textContent='جاري الإضافة...'}
  try{
    await api('/api/admin/interviews',{method:'POST',body:JSON.stringify({at:localDate.toISOString(),note})});
    toast('✅ تمت إضافة الموعد');
    form.reset();
    await renderAdmin();
    pub=await api('/api/public');
    renderPublic();
  }catch(err){
    console.error('ADD_SLOT_FAILED',err);
    const map={INVALID_INTERVIEW_DATE:'التاريخ غير صالح أو الموعد في الماضي',ADMIN_ONLY:'الحساب الحالي غير مسموح له بإدارة المواعيد',LOGIN_REQUIRED:'سجل دخول Discord من جديد'};
    toast('❌ '+(map[err?.message]||`فشل إضافة الموعد: ${err?.message||'خطأ غير معروف'}`));
  }finally{
    if(btn){btn.disabled=false;btn.textContent=oldText}
  }
}
window.delSlot=async id=>{await api(`/api/admin/interviews/${id}`,{method:'DELETE'});renderAdmin();pub=await api('/api/public');renderPublic()};
window.oauthLogin=oauthLogin;
init();


// v8: 3D hero + robust drag-to-rules (mouse, touch, pointer, click, keyboard)
(function initTurboMotionV8(){
  const card=document.getElementById('turboTiltCard');
  if(card && window.matchMedia('(pointer:fine)').matches && !window.matchMedia('(prefers-reduced-motion: reduce)').matches){
    let frame=0;
    const setTilt=(x,y)=>{const r=card.getBoundingClientRect();const px=Math.max(0,Math.min(1,(x-r.left)/r.width));const py=Math.max(0,Math.min(1,(y-r.top)/r.height));const ry=(px-.5)*9;const rx=(.5-py)*7;cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{card.style.setProperty('--rx',rx.toFixed(2)+'deg');card.style.setProperty('--ry',ry.toFixed(2)+'deg');card.style.setProperty('--mx',(px*100).toFixed(1)+'%');card.style.setProperty('--my',(py*100).toFixed(1)+'%')})};
    card.addEventListener('pointerenter',()=>card.classList.add('tilting'));
    card.addEventListener('pointermove',e=>setTilt(e.clientX,e.clientY));
    card.addEventListener('pointerleave',()=>{card.classList.remove('tilting');card.style.setProperty('--rx','0deg');card.style.setProperty('--ry','0deg');card.style.setProperty('--mx','50%');card.style.setProperty('--my','50%')});
  }

  const track=document.getElementById('rulesDragTrack');
  const thumb=document.getElementById('rulesDragThumb');
  if(!track||!thumb)return;
  let dragging=false,startX=0,startDrag=0,current=0,max=0,pointerId=null;
  const recalc=()=>{max=Math.max(0,track.clientWidth-thumb.offsetWidth-18)};
  const setDrag=v=>{recalc();current=Math.max(0,Math.min(max,v));track.style.setProperty('--drag',current+'px');track.setAttribute('aria-valuenow',String(max?Math.round(current/max*100):0))};
  const openRules=()=>{current=max;track.style.setProperty('--drag',max+'px');track.setAttribute('aria-valuenow','100');track.classList.add('completed');if(navigator.vibrate)navigator.vibrate(25);setTimeout(()=>{window.__turboUnlockRules?.();location.hash='rules';document.getElementById('rules')?.scrollIntoView({behavior:'smooth',block:'start'});setTimeout(()=>{track.classList.remove('completed');setDrag(0)},950)},180)};
  const finish=()=>{if(!dragging)return;dragging=false;track.classList.remove('dragging');recalc();if(max&&current/max>=.72)openRules();else setDrag(0)};
  const begin=(clientX,id)=>{recalc();dragging=true;pointerId=id??null;track.classList.add('dragging');startX=clientX;startDrag=current};

  thumb.addEventListener('pointerdown',e=>{if(e.button!==undefined&&e.button!==0)return;begin(e.clientX,e.pointerId);thumb.setPointerCapture?.(e.pointerId);e.preventDefault()});
  track.addEventListener('pointerdown',e=>{if(thumb===e.target||thumb.contains(e.target))return;if(e.button!==undefined&&e.button!==0)return;const r=track.getBoundingClientRect();setDrag(e.clientX-r.left-thumb.offsetWidth/2);begin(e.clientX,e.pointerId);track.setPointerCapture?.(e.pointerId);e.preventDefault()});
  window.addEventListener('pointermove',e=>{if(dragging)setDrag(startDrag+(e.clientX-startX))});
  window.addEventListener('pointerup',finish);window.addEventListener('pointercancel',finish);

  // Legacy mouse/touch fallback for browsers or cached environments with partial PointerEvent support.
  thumb.addEventListener('mousedown',e=>{if(window.PointerEvent)return;begin(e.clientX,null);e.preventDefault()});
  window.addEventListener('mousemove',e=>{if(dragging&&!window.PointerEvent)setDrag(startDrag+(e.clientX-startX))});
  window.addEventListener('mouseup',()=>{if(!window.PointerEvent)finish()});
  thumb.addEventListener('touchstart',e=>{if(window.PointerEvent)return;const t=e.touches[0];begin(t.clientX,null);e.preventDefault()},{passive:false});
  window.addEventListener('touchmove',e=>{if(dragging&&!window.PointerEvent){setDrag(startDrag+(e.touches[0].clientX-startX));e.preventDefault()}},{passive:false});
  window.addEventListener('touchend',()=>{if(!window.PointerEvent)finish()});

  track.addEventListener('dblclick',openRules);
  track.addEventListener('keydown',e=>{recalc();if(e.key==='ArrowRight'){setDrag(current+Math.max(28,max*.12));e.preventDefault()}if(e.key==='ArrowLeft'){setDrag(current-Math.max(28,max*.12));e.preventDefault()}if(e.key==='Enter'||e.key===' '){openRules();e.preventDefault()}});
  window.addEventListener('resize',()=>setDrag(Math.min(current,max)));
  requestAnimationFrame(()=>setDrag(0));
})();

// v10: rules are physically absent until the slider is completed.
// Once unlocked, the rules header and each rule group reveal progressively as they approach the viewport.
(function initTurboRevealV10(){
  const rules=document.getElementById('rules');
  const launcher=document.getElementById('rulesDragLauncher');
  let unlocked=false;
  let io=null;

  const selector='.reveal-section,.section-head,.about-grid>.card,.creator,.rule-group,.form-shell,.rules-gateway';

  function canObserve(el){
    if(!el) return false;
    // Nothing inside the rules section should participate while it is still locked/display:none.
    if(el.closest('#rules') && !unlocked) return false;
    return true;
  }

  function revealTargets(root=document){
    const targets=[...root.querySelectorAll(selector)].filter(canObserve);
    if(io){
      targets.forEach(el=>{
        if(!el.classList.contains('is-visible')) io.observe(el);
      });
    }else{
      targets.forEach(el=>el.classList.add('is-visible'));
    }
  }

  if('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches){
    io=new IntersectionObserver(entries=>{
      entries.forEach(entry=>{
        if(entry.isIntersecting){
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    },{
      // Begin revealing a little before the element fully reaches the viewport.
      rootMargin:'0px 0px -9% 0px',
      threshold:.07
    });
  }

  function unlockRules(){
    if(unlocked) return;
    unlocked=true;
    if(!rules) return;

    // Remove display:none first, but do NOT reveal all children at once.
    rules.classList.remove('rules-locked');
    rules.classList.add('rules-unlocked');
    rules.setAttribute('aria-hidden','false');

    // Register the already-rendered rules immediately. This is the part that was missing in V9.
    requestAnimationFrame(()=>{
      revealTargets(rules);
      // If the API injects rule groups a moment later, the observer below catches them too.
    });
  }
  window.__turboUnlockRules=unlockRules;

  // Navigation "القوانين" points to the slider until it has been unlocked.
  document.querySelectorAll('a[href="#rules"]').forEach(a=>a.addEventListener('click',e=>{
    if(unlocked) return;
    e.preventDefault();
    launcher?.scrollIntoView({behavior:'smooth',block:'center'});
    launcher?.classList.add('is-near');
    setTimeout(()=>launcher?.classList.remove('is-near'),1800);
  }));

  // Normal site reveal, excluding the hidden rules section.
  revealTargets(document);

  if(launcher && 'IntersectionObserver' in window){
    const near=new IntersectionObserver(entries=>{
      entries.forEach(e=>launcher.classList.toggle('is-near',e.isIntersecting));
    },{rootMargin:'-20% 0px -20% 0px',threshold:.15});
    near.observe(launcher);
  }

  // Dynamic creators/rules/forms inserted by API calls.
  const mo=new MutationObserver(records=>{
    for(const rec of records){
      rec.addedNodes.forEach(node=>{
        if(node.nodeType!==1) return;
        if(canObserve(node) && node.matches?.(selector) && !node.classList.contains('is-visible')){
          if(io) io.observe(node); else node.classList.add('is-visible');
        }
        revealTargets(node);
      });
    }
  });
  mo.observe(document.body,{childList:true,subtree:true});
})();

// ===== V16: application route + interactive cursor =====
(()=>{
  const aura=document.getElementById('cursorAura'),dot=document.getElementById('cursorDot');
  if(aura&&dot&&matchMedia('(pointer:fine)').matches&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
    let tx=innerWidth/2,ty=innerHeight/2,x=tx,y=ty,last=0;
    window.addEventListener('pointermove',e=>{tx=e.clientX;ty=e.clientY;dot.style.transform=`translate3d(${tx}px,${ty}px,0)`;const now=performance.now();if(now-last>55){last=now;const p=document.createElement('i');p.className='cursor-spark';p.style.left=tx+'px';p.style.top=ty+'px';document.body.appendChild(p);setTimeout(()=>p.remove(),650)}});
    const tick=()=>{x+=(tx-x)*.13;y+=(ty-y)*.13;aura.style.transform=`translate3d(${x}px,${y}px,0)`;requestAnimationFrame(tick)};tick();
    document.addEventListener('mouseover',e=>{if(e.target.closest('a,button,input,textarea,select,.character-card'))document.body.classList.add('cursor-hot')});
    document.addEventListener('mouseout',e=>{if(e.target.closest('a,button,input,textarea,select,.character-card'))document.body.classList.remove('cursor-hot')});
  }
  window.addEventListener('hashchange',()=>{auditEvent('navigate',{hash:location.hash||'#home'});if(location.hash==='#apply'&&!me?.latest)openApplicationPortal();});
  document.addEventListener('click',e=>{const el=e.target.closest('button,a,[role="button"]');if(!el)return;const label=(el.getAttribute('aria-label')||el.textContent||el.id||el.className||'interaction').trim().replace(/\s+/g,' ').slice(0,120);auditEvent('click',{label,tag:el.tagName,id:el.id||null})},true);
})();

// ===== V11: animated TURBO loader on actionable clicks =====
(()=>{
  const loader=document.getElementById('turboActionLoader');
  if(!loader) return;
  let timer=null;
  const showTurboLoader=(minMs=560)=>{
    clearTimeout(timer);
    loader.classList.add('is-active');
    loader.setAttribute('aria-hidden','false');
    document.documentElement.style.setProperty('--turbo-loader-active','1');
    timer=setTimeout(hideTurboLoader,minMs);
  };
  const hideTurboLoader=()=>{
    loader.classList.remove('is-active');
    loader.setAttribute('aria-hidden','true');
    document.documentElement.style.removeProperty('--turbo-loader-active');
  };
  window.showTurboLoader=showTurboLoader;
  window.hideTurboLoader=hideTurboLoader;

  // Links get a short cinematic transition before navigation.
  document.addEventListener('click',e=>{
    const el=e.target.closest('a[href],button,[role="button"]');
    if(!el || loader.contains(el) || el.disabled) return;
    if(el.matches('.rules-drag-thumb') || el.closest('.rules-drag-track')) return; // drag control, not a normal click
    if(el.matches('button[type="submit"]')){ showTurboLoader(720); return; }

    if(el.tagName==='A'){
      const href=el.getAttribute('href')||'';
      if(!href || href==='javascript:void(0)') return;
      // Same-page section links: animate briefly, then scroll/change hash.
      if(href==='#apply') return;
      if(href.startsWith('#')){
        e.preventDefault();
        showTurboLoader(430);
        setTimeout(()=>{
          hideTurboLoader();
          location.hash=href.slice(1);
          document.querySelector(href)?.scrollIntoView({behavior:'smooth',block:'start'});
        },390);
        return;
      }
      // External / normal navigation. Respect target=_blank.
      e.preventDefault();
      const newTab=el.target==='_blank';
      showTurboLoader(650);
      setTimeout(()=>{
        if(newTab) window.open(el.href,'_blank','noopener');
        else location.href=el.href;
      },560);
      return;
    }
    // Regular non-submit UI buttons: visual feedback without blocking their handler.
    showTurboLoader(480);
  },true);

  // Never leave the overlay hanging after tab restore/back-forward cache.
  window.addEventListener('pageshow',()=>setTimeout(hideTurboLoader,80));
})();
