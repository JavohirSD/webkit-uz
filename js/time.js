'use strict';

/* ══════════════════════════════════════════
   TIME TOOLS
   A multi-tab time utility modal:
     • Clock      — live current time (HH:MM:SS.mmm) + unix + timezone,
                    epoch ↔ human and 12h ↔ 24h converters, fullscreen.
     • Countdown  — count down to a chosen date, fullscreen.
     • Stopwatch  — start/stop/lap with millisecond precision, fullscreen.
     • World      — five side-by-side clocks for comparing timezones.

   All live tickers run ONLY while the modal is open and their tab is
   visible; everything stops on close to save resources. Running state
   for the stopwatch/countdown is derived from absolute timestamps, so
   pausing a ticker never loses time.

   Reuses global helpers from app.js: $, pad, esc, openOverlay,
   closeOverlay. Reuses global .btn styles; time-specific styles live
   in css/time.css.
══════════════════════════════════════════ */
(function(){
  'use strict';

  /* ── constants ── */
  var TABS          = ['clock','countdown','stopwatch','world','cron'];  /* cron panel logic: js/cron.js */
  var LS_TZ         = 'time_tz';
  var LS_WORLD      = 'time_world_zones';
  var WORLD_COUNT   = 5;
  var DEFAULT_WORLD = ['America/New_York','Europe/London','Europe/Moscow','Asia/Dubai','Asia/Tokyo'];

  /* Curated "City, Country" list for the World Clocks selectors (value = IANA zone) */
  var CITY_LIST = [
    ['UTC','UTC'],
    ['Pacific/Honolulu','Honolulu, USA'],['America/Anchorage','Anchorage, USA'],
    ['America/Los_Angeles','Los Angeles, USA'],['America/Denver','Denver, USA'],
    ['America/Chicago','Chicago, USA'],['America/New_York','New York, USA'],
    ['America/Toronto','Toronto, Canada'],['America/Mexico_City','Mexico City, Mexico'],
    ['America/Bogota','Bogotá, Colombia'],['America/Lima','Lima, Peru'],
    ['America/Sao_Paulo','São Paulo, Brazil'],['America/Argentina/Buenos_Aires','Buenos Aires, Argentina'],
    ['America/Santiago','Santiago, Chile'],['Atlantic/Reykjavik','Reykjavík, Iceland'],
    ['Europe/London','London, United Kingdom'],['Europe/Dublin','Dublin, Ireland'],
    ['Europe/Lisbon','Lisbon, Portugal'],['Europe/Madrid','Madrid, Spain'],
    ['Europe/Paris','Paris, France'],['Europe/Brussels','Brussels, Belgium'],
    ['Europe/Amsterdam','Amsterdam, Netherlands'],['Europe/Berlin','Berlin, Germany'],
    ['Europe/Zurich','Zurich, Switzerland'],['Europe/Rome','Rome, Italy'],
    ['Europe/Vienna','Vienna, Austria'],['Europe/Prague','Prague, Czechia'],
    ['Europe/Warsaw','Warsaw, Poland'],['Europe/Stockholm','Stockholm, Sweden'],
    ['Europe/Oslo','Oslo, Norway'],['Europe/Helsinki','Helsinki, Finland'],
    ['Europe/Athens','Athens, Greece'],['Europe/Bucharest','Bucharest, Romania'],
    ['Europe/Kyiv','Kyiv, Ukraine'],['Europe/Istanbul','Istanbul, Türkiye'],
    ['Europe/Moscow','Moscow, Russia'],['Africa/Casablanca','Casablanca, Morocco'],
    ['Africa/Lagos','Lagos, Nigeria'],['Africa/Cairo','Cairo, Egypt'],
    ['Africa/Nairobi','Nairobi, Kenya'],['Africa/Johannesburg','Johannesburg, South Africa'],
    ['Asia/Jerusalem','Jerusalem, Israel'],['Asia/Riyadh','Riyadh, Saudi Arabia'],
    ['Asia/Dubai','Dubai, UAE'],['Asia/Tehran','Tehran, Iran'],
    ['Asia/Baku','Baku, Azerbaijan'],['Asia/Karachi','Karachi, Pakistan'],
    ['Asia/Tashkent','Tashkent, Uzbekistan'],['Asia/Almaty','Almaty, Kazakhstan'],
    ['Asia/Yekaterinburg','Yekaterinburg, Russia'],['Asia/Kolkata','Delhi, India'],
    ['Asia/Colombo','Colombo, Sri Lanka'],['Asia/Kathmandu','Kathmandu, Nepal'],
    ['Asia/Dhaka','Dhaka, Bangladesh'],['Asia/Bangkok','Bangkok, Thailand'],
    ['Asia/Jakarta','Jakarta, Indonesia'],['Asia/Ho_Chi_Minh','Ho Chi Minh City, Vietnam'],
    ['Asia/Singapore','Singapore, Singapore'],['Asia/Kuala_Lumpur','Kuala Lumpur, Malaysia'],
    ['Asia/Manila','Manila, Philippines'],['Asia/Hong_Kong','Hong Kong, China'],
    ['Asia/Shanghai','Shanghai, China'],['Asia/Taipei','Taipei, Taiwan'],
    ['Asia/Seoul','Seoul, South Korea'],['Asia/Tokyo','Tokyo, Japan'],
    ['Australia/Perth','Perth, Australia'],['Australia/Adelaide','Adelaide, Australia'],
    ['Australia/Sydney','Sydney, Australia'],['Pacific/Auckland','Auckland, New Zealand'],
    ['Pacific/Fiji','Suva, Fiji']
  ];

  /* Fallback list for browsers without Intl.supportedValuesOf('timeZone') */
  var FALLBACK_TZS = [
    'UTC','America/New_York','America/Chicago','America/Denver','America/Los_Angeles',
    'America/Sao_Paulo','America/Mexico_City','America/Toronto','America/Argentina/Buenos_Aires',
    'Europe/London','Europe/Berlin','Europe/Paris','Europe/Madrid','Europe/Rome',
    'Europe/Moscow','Europe/Istanbul','Europe/Kyiv','Europe/Amsterdam','Europe/Zurich',
    'Africa/Cairo','Africa/Lagos','Africa/Johannesburg','Africa/Nairobi',
    'Asia/Dubai','Asia/Tashkent','Asia/Karachi','Asia/Kolkata','Asia/Dhaka',
    'Asia/Bangkok','Asia/Singapore','Asia/Hong_Kong','Asia/Shanghai','Asia/Tokyo',
    'Asia/Seoul','Asia/Jakarta','Australia/Sydney','Australia/Perth','Pacific/Auckland','Pacific/Honolulu'
  ];

  /* ── device timezone + full IANA list ── */
  function deviceTz(){
    try{ return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
    catch(e){ return 'UTC'; }
  }
  var DEVICE_TZ = deviceTz();

  function allTimeZones(){
    try{
      if(typeof Intl.supportedValuesOf === 'function'){
        var list = Intl.supportedValuesOf('timeZone');
        if(list && list.length) return list;
      }
    }catch(e){}
    return FALLBACK_TZS;
  }
  var TZ_LIST = allTimeZones();

  /* ── DOM refs ── */
  var overlay   = $('timeOverlay');
  var nowClock  = $('nowClock'), nowUnix = $('nowUnix'), nowDate = $('nowDate');
  var clockFsBtn = $('clockFsBtn');
  var epIn=$('epIn'), huIn=$('huIn');
  /* 24h ↔ 12h text inputs */
  var h24h=$('h24h'), h24m=$('h24m'), h24s=$('h24s');
  var ap12h=$('ap12h'), ap12m=$('ap12m'), ap12s=$('ap12s');
  /* custom select instances (created during init) */
  var tzCs=null, apMerCs=null;
  var cdTarget=$('cdTarget'), cdStartBtn=$('cdStartBtn'), cdResetBtn=$('cdResetBtn'),
      cdFsBtn=$('cdFsBtn'), cdDisplay=$('cdDisplay'), cdNote=$('cdNote'), cdTzBadge=$('cdTzBadge');
  var swDisplay=$('swDisplay'), swToggleBtn=$('swToggleBtn'), swLapBtn=$('swLapBtn'),
      swResetBtn=$('swResetBtn'), swFsBtn=$('swFsBtn'), swLaps=$('swLaps');
  var worldList=$('worldList');
  var timeFs=$('timeFs'), timeFsClose=$('timeFsClose'),
      timeFsLabel=$('timeFsLabel'), timeFsMain=$('timeFsMain'), timeFsSub=$('timeFsSub');

  /* ── state ── */
  var activeTab = 'clock';
  var currentTz = DEVICE_TZ;  /* last valid timezone chosen on the Clock tab */
  var clockTimer=null, worldTimer=null;
  var swRAF=null, swRunning=false, swStartTs=0, swAccum=0, swLapsArr=[];
  var cdRAF=null, cdRunning=false, cdTargetTs=0, cdRemaining=0, cdState='idle';
  var fsMode=null;            /* 'clock' | 'countdown' | 'stopwatch' | null */
  var worldRows=[];           /* [{sel, out}] */

  /* ══════════════════════════════════════════
     FORMATTING HELPERS
  ══════════════════════════════════════════ */
  function partsInTz(date, tz){
    try{
      var dtf = new Intl.DateTimeFormat('en-GB', {
        timeZone:tz, hour12:false, hour:'2-digit', minute:'2-digit', second:'2-digit'
      });
      var o={};
      dtf.formatToParts(date).forEach(function(p){ if(p.type!=='literal') o[p.type]=p.value; });
      return { h:(o.hour==='24'?'00':o.hour), m:o.minute, s:o.second };
    }catch(e){
      return { h:pad(date.getHours()), m:pad(date.getMinutes()), s:pad(date.getSeconds()) };
    }
  }
  function dateInTz(date, tz){
    try{
      return new Intl.DateTimeFormat('en-US', {
        timeZone:tz, weekday:'short', year:'numeric', month:'short', day:'2-digit'
      }).format(date);
    }catch(e){ return date.toDateString(); }
  }
  function fullStamp(date, tz){
    try{
      return new Intl.DateTimeFormat('en-GB', {
        timeZone:tz, dateStyle:'medium', timeStyle:'medium'
      }).format(date) + ' (' + tz + ')';
    }catch(e){ return date.toString(); }
  }
  function toLocalInput(d){
    return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+
           pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds());
  }

  /* ── timezone helpers ── */
  function isValidTz(tz){
    for(var i=0;i<TZ_LIST.length;i++){ if(TZ_LIST[i]===tz) return true; }
    return false;
  }
  /* populate the searchable <datalist> (clock timezone) */
  function fillDatalist(list){
    var frag=document.createDocumentFragment();
    for(var i=0;i<TZ_LIST.length;i++){
      var o=document.createElement('option'); o.value=TZ_LIST[i];
      frag.appendChild(o);
    }
    list.appendChild(frag);
  }
  function loadJson(key, def){
    try{ var v=localStorage.getItem(key); if(v){ var p=JSON.parse(v); if(p) return p; } }catch(e){}
    return def;
  }

  /* ══════════════════════════════════════════
     CUSTOM SEARCHABLE SELECT  (tcs)
     Portaled dropdown: .tcs-drop appended to
     <body> with position:fixed so the modal's
     overflow:auto cannot clip it.
  ══════════════════════════════════════════ */
  var allTcsInstances=[];
  function makeCustomSelect(cfg){
    var items=(cfg.items||[]).map(function(x){ return typeof x==='string'?{v:x,l:x}:x; });
    var cur=cfg.init||(items[0]&&items[0].v)||'';
    var canSearch=items.length>3;
    var ph=cfg.placeholder||'Search…';
    var onCh=cfg.onChange||function(){};
    var wrap=cfg.wrap;
    var isOpen=false;

    var trigger=document.createElement('button');
    trigger.type='button'; trigger.className='tcs-trigger';
    trigger.setAttribute('aria-haspopup','listbox'); trigger.setAttribute('aria-expanded','false');
    var valEl=document.createElement('span'); valEl.className='tcs-val';
    var arrowEl=document.createElement('span'); arrowEl.className='tcs-arrow';
    arrowEl.innerHTML='<svg viewBox="0 0 10 6" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1l4 4 4-4"/></svg>';
    trigger.appendChild(valEl); trigger.appendChild(arrowEl);
    wrap.appendChild(trigger);

    var drop=document.createElement('div'); drop.className='tcs-drop';
    drop.hidden=true; drop.setAttribute('role','dialog');
    var srchInp=null;
    if(canSearch){
      var srchRow=document.createElement('div'); srchRow.className='tcs-search-row';
      srchInp=document.createElement('input'); srchInp.className='tcs-search';
      srchInp.type='text'; srchInp.setAttribute('autocomplete','off');
      srchInp.setAttribute('spellcheck','false'); srchInp.placeholder=ph;
      srchRow.appendChild(srchInp); drop.appendChild(srchRow);
    }
    var list=document.createElement('ul'); list.className='tcs-list';
    list.setAttribute('role','listbox'); drop.appendChild(list);
    document.body.appendChild(drop);

    function labelFor(v){
      for(var i=0;i<items.length;i++) if(items[i].v===v) return items[i].l;
      return v;
    }
    function setValue(v,fire){ cur=v; valEl.textContent=labelFor(v)||v; if(fire) onCh(v); }
    function renderList(q){
      q=(q||'').toLowerCase().trim();
      var frag=document.createDocumentFragment();
      for(var i=0;i<items.length;i++){
        var it=items[i];
        if(q&&it.l.toLowerCase().indexOf(q)<0&&it.v.toLowerCase().indexOf(q)<0) continue;
        var li=document.createElement('li');
        li.className='tcs-item'+(it.v===cur?' tcs-item-sel':'');
        li.setAttribute('role','option'); li.setAttribute('aria-selected',it.v===cur?'true':'false');
        li.setAttribute('data-v',it.v); li.tabIndex=-1; li.textContent=it.l;
        frag.appendChild(li);
      }
      list.innerHTML=''; list.appendChild(frag);
      var sel=list.querySelector('.tcs-item-sel');
      if(sel) setTimeout(function(){ sel.scrollIntoView({block:'nearest'}); },0);
    }
    function reposition(){
      var r=trigger.getBoundingClientRect();
      drop.style.width=Math.max(r.width,140)+'px'; drop.style.left=r.left+'px';
      var spaceBelow=window.innerHeight-r.bottom;
      if(spaceBelow<244&&r.top>244){ drop.style.top=''; drop.style.bottom=(window.innerHeight-r.top+4)+'px'; }
      else{ drop.style.bottom=''; drop.style.top=(r.bottom+4)+'px'; }
    }
    function openDrop(){
      for(var k=0;k<allTcsInstances.length;k++)
        if(allTcsInstances[k]!==inst&&allTcsInstances[k]._isOpen()) allTcsInstances[k]._close();
      isOpen=true; drop.hidden=false;
      trigger.setAttribute('aria-expanded','true'); wrap.classList.add('tcs-open');
      renderList(''); reposition();
      if(srchInp){ srchInp.value=''; setTimeout(function(){ srchInp.focus(); },20); }
      else{ var f=list.querySelector('.tcs-item-sel')||list.querySelector('.tcs-item'); if(f) setTimeout(function(){ f.focus(); },20); }
    }
    function closeDrop(){
      isOpen=false; drop.hidden=true;
      trigger.setAttribute('aria-expanded','false'); wrap.classList.remove('tcs-open');
    }
    trigger.addEventListener('click',function(e){ e.stopPropagation(); isOpen?closeDrop():openDrop(); });
    if(srchInp){
      srchInp.addEventListener('input',function(){ renderList(srchInp.value); });
      srchInp.addEventListener('keydown',function(e){
        if(e.key==='Escape'){ e.stopPropagation(); closeDrop(); trigger.focus(); return; }
        if(e.key==='ArrowDown'){ var f=list.querySelector('.tcs-item'); if(f){ f.focus(); e.preventDefault(); } }
      });
    }
    list.addEventListener('keydown',function(e){
      var t=e.target;
      if(e.key==='ArrowDown'){ if(t.nextElementSibling) t.nextElementSibling.focus(); e.preventDefault(); }
      else if(e.key==='ArrowUp'){
        if(t.previousElementSibling) t.previousElementSibling.focus(); else if(srchInp) srchInp.focus();
        e.preventDefault();
      } else if(e.key==='Enter'||e.key===' '){
        var v=t.getAttribute('data-v'); if(v!=null){ setValue(v,true); closeDrop(); trigger.focus(); }
        e.preventDefault();
      } else if(e.key==='Escape'){ e.stopPropagation(); closeDrop(); trigger.focus(); }
    });
    list.addEventListener('click',function(e){
      var li=e.target; while(li&&li.tagName!=='LI') li=li.parentElement;
      if(!li||!li.classList.contains('tcs-item')) return;
      setValue(li.getAttribute('data-v'),true); closeDrop(); trigger.focus();
    });
    document.addEventListener('click',function(e){
      if(isOpen&&!wrap.contains(e.target)&&!drop.contains(e.target)) closeDrop();
    });
    window.addEventListener('resize',function(){ if(isOpen) reposition(); });
    window.addEventListener('scroll',function(){ if(isOpen) reposition(); },true);

    setValue(cur,false);
    var inst={
      getValue:function(){ return cur; },
      setValue:function(v){ setValue(v,false); },
      _isOpen:function(){ return isOpen; },
      _close:closeDrop
    };
    allTcsInstances.push(inst);
    return inst;
  }

  /* ══════════════════════════════════════════
     CLOCK (live current time)
  ══════════════════════════════════════════ */
  function clockTick(){
    var now=new Date(), p=partsInTz(now,currentTz);
    var unix=Math.floor(now.getTime()/1000), hms=p.h+':'+p.m+':'+p.s;
    nowClock.textContent=hms;                 /* HH:MM:SS — no milliseconds */
    nowUnix.textContent=unix;
    nowDate.textContent=dateInTz(now,currentTz);
    if(fsMode==='clock') updateFs(hms, 'unix '+unix+'  ·  '+dateInTz(now,currentTz));
  }

  /* ══════════════════════════════════════════
     EPOCH ↔ HUMAN  (paired inputs update each other)
  ══════════════════════════════════════════ */
  function epochToHuman(){
    var raw=(epIn.value||'').trim();
    epIn.classList.remove('invalid');
    if(!raw) return;
    if(!/^-?\d+$/.test(raw)){ epIn.classList.add('invalid'); return; }
    var n=parseInt(raw,10);
    var ms=(raw.replace('-','').length>=13)?n:n*1000;   /* 13+ digits → already ms */
    var d=new Date(ms);
    if(isNaN(d.getTime())){ epIn.classList.add('invalid'); return; }
    huIn.value=toLocalInput(d);
  }
  function humanToEpoch(){
    var v=huIn.value;
    if(!v) return;
    var d=new Date(v);
    if(isNaN(d.getTime())) return;
    epIn.classList.remove('invalid');
    epIn.value=Math.floor(d.getTime()/1000);
  }

  /* ══════════════════════════════════════════
     12-HOUR (AM/PM) ↔ 24-HOUR — numeric text inputs + AM/PM select
  ══════════════════════════════════════════ */
  /* AM/PM custom select created here; h/m/s are free-type text inputs */
  function buildTimePickers(){
    apMerCs=makeCustomSelect({
      wrap:$('apMerWrap'),
      items:[{v:'AM',l:'AM'},{v:'PM',l:'PM'}],
      init:'AM',
      onChange:syncFromAmpm
    });
  }
  /* parse a numeric text input, clamping to [min..max]; return the clamped int */
  function parseNum(el, min, max){
    var v=parseInt(el.value,10);
    if(isNaN(v)||v<min) return min;
    return v>max ? max : v;
  }
  /* 24h inputs → 12h inputs */
  function syncFrom24(){
    var h=parseNum(h24h,0,23), m=parseNum(h24m,0,59), s=parseNum(h24s,0,59);
    h24h.value=pad(h); h24m.value=pad(m); h24s.value=pad(s);
    var h12=h%12; if(h12===0) h12=12;
    ap12h.value=pad(h12); ap12m.value=pad(m); ap12s.value=pad(s);
    if(apMerCs) apMerCs.setValue((h>=12)?'PM':'AM');
  }
  /* 12h inputs → 24h inputs */
  function syncFromAmpm(){
    var h=parseNum(ap12h,1,12), m=parseNum(ap12m,0,59), s=parseNum(ap12s,0,59);
    ap12h.value=pad(h); ap12m.value=pad(m); ap12s.value=pad(s);
    var h24v=h%12; if((apMerCs?apMerCs.getValue():'AM')==='PM') h24v+=12;
    h24h.value=pad(h24v); h24m.value=pad(m); h24s.value=pad(s);
  }
  /* seed both sides from a 24h time */
  function setTimePickers(h,m,s){
    h24h.value=pad(h); h24m.value=pad(m); h24s.value=pad(s);
    syncFrom24();
  }

  /* ══════════════════════════════════════════
     COUNTDOWN
  ══════════════════════════════════════════ */
  function cdFmt(ms){
    if(ms<0) ms=0;
    var sec=Math.floor(ms/1000),
        days=Math.floor(sec/86400),
        h=Math.floor((sec%86400)/3600),
        m=Math.floor((sec%3600)/60),
        s=sec%60;
    return (days>0?days+'d ':'')+pad(h)+':'+pad(m)+':'+pad(s);
  }
  function cdTick(){
    var rem=cdTargetTs-Date.now(), txt=cdFmt(rem);
    cdDisplay.textContent=txt;
    if(fsMode==='countdown') updateFs(txt, cdNote.textContent);
    if(rem<=0){
      cdDisplay.classList.add('done');
      cdNote.className='time-cd-note ok'; cdNote.textContent='Countdown complete';
      cdState='idle'; cdRunning=false; cdRAF=null; cdStartBtn.textContent='Start';
      if(fsMode==='countdown') updateFs('00:00:00','Countdown complete');
      return;
    }
    cdRAF=requestAnimationFrame(cdTick);
  }
  function cdBegin(){ cdRunning=true; cdDisplay.classList.remove('done'); if(!cdRAF) cdTick(); }

  function startCd(){            /* idle → running */
    var v=cdTarget.value;
    if(!v){ cdNote.className='time-cd-note err'; cdNote.textContent='Pick a target date first.'; return; }
    var d=new Date(v);
    if(isNaN(d.getTime())){ cdNote.className='time-cd-note err'; cdNote.textContent='Invalid date.'; return; }
    if(d.getTime()<=Date.now()){ cdNote.className='time-cd-note err'; cdNote.textContent='Target is in the past.'; return; }
    cdTargetTs=d.getTime(); cdState='running'; cdStartBtn.textContent='Pause';
    cdNote.className='time-cd-note'; cdNote.textContent='Counting down to '+fullStamp(d, DEVICE_TZ);
    cdBegin();
  }
  function pauseCd(){            /* running → paused */
    cdRemaining=Math.max(0, cdTargetTs-Date.now());
    cdState='paused'; cdRunning=false;
    if(cdRAF){ cancelAnimationFrame(cdRAF); cdRAF=null; }
    cdStartBtn.textContent='Resume';
    cdNote.className='time-cd-note'; cdNote.textContent='Paused';
    cdDisplay.textContent=cdFmt(cdRemaining);
  }
  function resumeCd(){           /* paused → running */
    cdTargetTs=Date.now()+cdRemaining; cdState='running'; cdStartBtn.textContent='Pause';
    cdNote.className='time-cd-note'; cdNote.textContent='Counting down to '+fullStamp(new Date(cdTargetTs), DEVICE_TZ);
    cdBegin();
  }
  function cdToggle(){
    if(cdState==='running')      pauseCd();
    else if(cdState==='paused')  resumeCd();
    else                         startCd();
  }
  function resetCd(){
    cdState='idle'; cdRunning=false; if(cdRAF){ cancelAnimationFrame(cdRAF); cdRAF=null; }
    cdTargetTs=0; cdRemaining=0; cdDisplay.classList.remove('done'); cdDisplay.textContent='—';
    cdNote.className='time-cd-note'; cdNote.textContent=''; cdStartBtn.textContent='Start';
  }

  /* ══════════════════════════════════════════
     STOPWATCH
  ══════════════════════════════════════════ */
  function swElapsed(){ return swAccum + (swRunning ? (Date.now()-swStartTs) : 0); }
  function swFmt(ms){
    var t=Math.floor(ms),
        h=Math.floor(t/3600000),
        m=Math.floor((t%3600000)/60000),
        s=Math.floor((t%60000)/1000),
        mil=t%1000;
    return pad(h)+':'+pad(m)+':'+pad(s)+'.'+pad(mil,3);
  }
  function renderSw(){
    var txt=swFmt(swElapsed());
    swDisplay.textContent=txt;
    if(fsMode==='stopwatch') updateFs(txt, swLapsArr.length?('Lap '+swLapsArr.length):'');
  }
  function swTick(){ renderSw(); swRAF=requestAnimationFrame(swTick); }
  function swToggle(){
    if(swRunning){
      swAccum=swElapsed(); swRunning=false;
      if(swRAF){ cancelAnimationFrame(swRAF); swRAF=null; }
      swToggleBtn.textContent='Start'; swToggleBtn.classList.remove('running');
      renderSw();   /* freeze the display at the paused value */
    }else{
      swStartTs=Date.now(); swRunning=true;
      swToggleBtn.textContent='Stop'; swToggleBtn.classList.add('running');
      swLapBtn.disabled=false; swResetBtn.disabled=false;
      if(!swRAF) swTick();
    }
  }
  function swLap(){
    if(!swRunning && swAccum===0) return;
    var e=swElapsed(), prev=swLapsArr.length?swLapsArr[swLapsArr.length-1].total:0;
    swLapsArr.push({ total:e, split:e-prev });
    renderLaps(); renderSw();
  }
  function renderLaps(){
    var html='';
    for(var i=swLapsArr.length-1;i>=0;i--){
      var l=swLapsArr[i];
      html+='<li class="time-sw-lap"><span class="time-sw-lap-n">Lap '+(i+1)+'</span>'+
            '<span class="time-sw-lap-split">+'+swFmt(l.split)+'</span>'+
            '<span class="time-sw-lap-total">'+swFmt(l.total)+'</span></li>';
    }
    swLaps.innerHTML=html;
  }
  function resetSw(){
    swRunning=false; if(swRAF){ cancelAnimationFrame(swRAF); swRAF=null; }
    swAccum=0; swStartTs=0; swLapsArr=[];
    swToggleBtn.textContent='Start'; swToggleBtn.classList.remove('running');
    swLapBtn.disabled=true; swResetBtn.disabled=true;
    swLaps.innerHTML=''; renderSw();
  }

  /* ══════════════════════════════════════════
     WORLD CLOCKS  (searchable "City, Country" inputs)
  ══════════════════════════════════════════ */
  /* pre-built item array for world-clock custom selects */
  var CITY_ITEMS=CITY_LIST.map(function(c){ return {v:c[0],l:c[1]}; });
  /* label ↔ zone maps built from CITY_LIST */
  var LABEL_TO_TZ={}, TZ_TO_LABEL={};
  (function(){
    for(var i=0;i<CITY_LIST.length;i++){
      LABEL_TO_TZ[CITY_LIST[i][1]]=CITY_LIST[i][0];
      TZ_TO_LABEL[CITY_LIST[i][0]]=CITY_LIST[i][1];
    }
  })();
  /* friendly label for any zone (curated, else derived "City (Region)") */
  function cityLabelFor(tz){
    if(TZ_TO_LABEL[tz]) return TZ_TO_LABEL[tz];
    var parts=String(tz).split('/');
    var city=parts[parts.length-1].replace(/_/g,' ');
    return parts.length>1 ? (city+', '+parts[0].replace(/_/g,' ')) : city;
  }
  /* shared <datalist> for every world-clock input */
  function buildCityData(){
    var dl=document.createElement('datalist'); dl.id='worldCityData';
    var frag=document.createDocumentFragment();
    for(var i=0;i<CITY_LIST.length;i++){
      var o=document.createElement('option'); o.value=CITY_LIST[i][1];
      frag.appendChild(o);
    }
    dl.appendChild(frag); document.body.appendChild(dl);
  }
  function buildWorld(){
    var saved=loadJson(LS_WORLD, DEFAULT_WORLD);
    worldList.innerHTML=''; worldRows=[];
    for(var i=0;i<WORLD_COUNT;i++){
      var row=document.createElement('div'); row.className='time-world-row';
      var selWrap=document.createElement('div'); selWrap.className='time-select-wrap';
      var out=document.createElement('div'); out.className='time-world-time'; out.textContent='00:00:00';
      /* row 0 always anchors to the device timezone; rows 1–4 are restorable */
      var tz=(i===0)?DEVICE_TZ:(saved[i]||DEFAULT_WORLD[i]||DEVICE_TZ);
      row.appendChild(selWrap); row.appendChild(out);
      worldList.appendChild(row);
      var rowObj={cs:null,out:out,tz:tz};
      (function(r){
        r.cs=makeCustomSelect({
          wrap:selWrap,
          items:CITY_ITEMS,
          init:r.tz,
          placeholder:'Search city…',
          onChange:function(v){ r.tz=v; saveWorld(); worldTick(); }
        });
      })(rowObj);
      worldRows.push(rowObj);
    }
  }
  function saveWorld(){
    try{
      localStorage.setItem(LS_WORLD, JSON.stringify(worldRows.map(function(w){ return w.tz; })));
    }catch(e){}
  }
  function worldTick(){
    var now=new Date();
    worldRows.forEach(function(w){
      var p=partsInTz(now, w.tz);
      w.out.textContent=p.h+':'+p.m+':'+p.s;
    });
  }

  /* ══════════════════════════════════════════
     FULLSCREEN OVERLAY
  ══════════════════════════════════════════ */
  function updateFs(main, sub){ timeFsMain.textContent=main; timeFsSub.textContent=sub||''; }
  function openFs(mode, label, main, sub){
    fsMode=mode;
    timeFsLabel.textContent=label||'';
    updateFs(main||'', sub||'');
    timeFs.style.display='flex';
    setTimeout(function(){ timeFsClose.focus(); }, 30);
  }
  function closeFs(){ fsMode=null; timeFs.style.display='none'; }

  /* ══════════════════════════════════════════
     TICKER LIFECYCLE (resource management)
  ══════════════════════════════════════════ */
  function stopAllTickers(){
    if(clockTimer){ clearInterval(clockTimer); clockTimer=null; }
    if(worldTimer){ clearInterval(worldTimer); worldTimer=null; }
    if(swRAF){ cancelAnimationFrame(swRAF); swRAF=null; }
    if(cdRAF){ cancelAnimationFrame(cdRAF); cdRAF=null; }
  }
  function startTickersFor(tab){
    if(tab==='clock'){ clockTick(); clockTimer=setInterval(clockTick, 1000); }
    else if(tab==='world'){ worldTick(); worldTimer=setInterval(worldTick, 1000); }
    else if(tab==='stopwatch'){ renderSw(); if(swRunning) swTick(); }
    else if(tab==='countdown'){ if(cdRunning) cdTick(); }
  }

  /* ══════════════════════════════════════════
     TABS
  ══════════════════════════════════════════ */
  function showTab(name){
    activeTab=name;
    stopAllTickers();
    TABS.forEach(function(t){
      var on=(t===name);
      var tab=$('ttab-'+t), pan=$('tpanel-'+t);
      tab.classList.toggle('active', on);
      tab.setAttribute('aria-selected', on?'true':'false');
      pan.classList.toggle('active', on);
    });
    startTickersFor(name);
    /* move focus to the Start/Stop button so Space drives the stopwatch right away */
    if(name==='stopwatch') setTimeout(function(){ swToggleBtn.focus(); }, 30);
  }
  TABS.forEach(function(t){
    $('ttab-'+t).addEventListener('click', function(){ showTab(t); });
  });

  /* ══════════════════════════════════════════
     EVENT WIRING
  ══════════════════════════════════════════ */
  /* epoch ↔ human (paired inputs) */
  epIn.addEventListener('input', epochToHuman);
  huIn.addEventListener('input', humanToEpoch);

  /* 24h ↔ 12h (two-way); text inputs sync on blur/Enter via 'change') */
  [h24h,h24m,h24s].forEach(function(inp){ inp.addEventListener('change', syncFrom24); });
  [ap12h,ap12m,ap12s].forEach(function(inp){ inp.addEventListener('change', syncFromAmpm); });

  /* countdown */
  cdStartBtn.addEventListener('click', cdToggle);
  cdResetBtn.addEventListener('click', resetCd);
  cdFsBtn.addEventListener('click', function(){ openFs('countdown','Countdown', cdDisplay.textContent, cdNote.textContent); });

  /* stopwatch */
  swToggleBtn.addEventListener('click', swToggle);
  swLapBtn.addEventListener('click', swLap);
  swResetBtn.addEventListener('click', resetSw);
  swFsBtn.addEventListener('click', function(){ openFs('stopwatch','Stopwatch', swDisplay.textContent, swLapsArr.length?('Lap '+swLapsArr.length):''); });
  /* Space toggles the stopwatch from anywhere on the tab (except other buttons/inputs) */
  document.addEventListener('keydown', function(e){
    if(!overlay.classList.contains('open') || activeTab!=='stopwatch') return;
    if(e.key!==' ' && e.key!=='Spacebar' && e.code!=='Space') return;
    var t=e.target, tag=t&&t.tagName;
    if(tag==='INPUT'||tag==='SELECT'||tag==='TEXTAREA') return;
    if(tag==='BUTTON' && t!==swToggleBtn) return;   /* let Space work on Lap/Reset/Fullscreen */
    e.preventDefault(); swToggle();
  });

  /* clock fullscreen */
  clockFsBtn.addEventListener('click', function(){ openFs('clock','Current time', nowClock.textContent, 'unix '+nowUnix.textContent); });

  /* fullscreen close + Escape (capture phase, before the modal's global Esc) */
  timeFsClose.addEventListener('click', closeFs);
  document.addEventListener('keydown', function(e){
    if(e.key==='Escape' && fsMode){ e.stopImmediatePropagation(); e.preventDefault(); closeFs(); }
  }, true);

  /* ══════════════════════════════════════════
     OPEN / CLOSE
  ══════════════════════════════════════════ */
  var pickersSeeded=false;
  function ensureDefaults(){
    if(!huIn.value)    huIn.value=toLocalInput(new Date());
    if(!cdTarget.value) cdTarget.value=toLocalInput(new Date(Date.now()+3600000));
    if(!pickersSeeded){ var n=new Date(); setTimePickers(n.getHours(), n.getMinutes(), n.getSeconds()); pickersSeeded=true; }
  }
  function openTime(){
    openOverlay('timeOverlay','timeClose');
    ensureDefaults();
    showTab(activeTab);
  }
  function closeTime(){
    stopAllTickers();
    closeFs();
    closeOverlay('timeOverlay');
  }
  $('timeBtn').addEventListener('click', openTime);
  $('timeClose').addEventListener('click', closeTime);
  overlay.addEventListener('click', function(e){ if(e.target===this) closeTime(); });

  /* ══════════════════════════════════════════
     INIT
  ══════════════════════════════════════════ */
  /* Move the fullscreen overlay to <body>: ancestors with backdrop-filter
     (the glass modal) would otherwise trap position:fixed inside the modal. */
  if(timeFs && timeFs.parentNode){ document.body.appendChild(timeFs); }

  /* timezone custom select: restore saved/device zone */
  var savedTz=loadJson(LS_TZ, DEVICE_TZ);
  currentTz=isValidTz(savedTz)?savedTz:DEVICE_TZ;
  tzCs=makeCustomSelect({
    wrap:$('tzWrap'),
    items:TZ_LIST.map(function(z){ return {v:z,l:z}; }),
    init:currentTz,
    placeholder:'Search timezone…',
    onChange:function(v){ if(isValidTz(v)){ currentTz=v; try{localStorage.setItem(LS_TZ,v);}catch(e){} } }
  });

  /* countdown always uses the device timezone — show it */
  cdTzBadge.textContent=DEVICE_TZ;

  /* AM/PM custom select + 24h/12h event wiring */
  buildTimePickers();

  /* world clocks: custom-select rows */
  buildWorld();
})();
