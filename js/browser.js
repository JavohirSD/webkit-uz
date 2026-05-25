'use strict';

/* ══════════════════════════════════════════
   BROWSER INFO MODAL
══════════════════════════════════════════ */
function safe(fn, fallback){
  try{ var v=fn(); return (v===null||v===undefined||v==='')?fallback||'—':String(v); }
  catch(e){ return fallback||'N/A'; }
}

function getBrowserName(ua){
  if(!ua) return '—';
  if(ua.indexOf('Edg/')!==-1||ua.indexOf('Edge/')!==-1) return 'Microsoft Edge';
  if(ua.indexOf('OPR/')!==-1||ua.indexOf('Opera/')!==-1) return 'Opera';
  if(ua.indexOf('Chrome/')!==-1&&ua.indexOf('Safari/')!==-1) return 'Google Chrome';
  if(ua.indexOf('Firefox/')!==-1) return 'Mozilla Firefox';
  if(ua.indexOf('Safari/')!==-1&&ua.indexOf('Chrome/')===-1) return 'Apple Safari';
  if(ua.indexOf('MSIE')!==-1||ua.indexOf('Trident/')!==-1) return 'Internet Explorer';
  return 'Unknown';
}

function getBrowserVersion(ua, name){
  if(!ua||name==='—') return '—';
  var m;
  if(name==='Microsoft Edge'){ m=ua.match(/Edg\/(\S+)/)||ua.match(/Edge\/(\S+)/); }
  else if(name==='Opera'){ m=ua.match(/OPR\/(\S+)/)||ua.match(/Opera\/(\S+)/); }
  else if(name==='Google Chrome'){ m=ua.match(/Chrome\/(\S+)/); }
  else if(name==='Mozilla Firefox'){ m=ua.match(/Firefox\/(\S+)/); }
  else if(name==='Apple Safari'){ m=ua.match(/Version\/(\S+)/); }
  return m ? m[1] : '—';
}

function getOS(ua){
  if(!ua) return '—';
  var m;
  if(ua.indexOf('Windows NT 10.0')!==-1) return 'Windows 10/11';
  if(ua.indexOf('Windows NT 6.3')!==-1) return 'Windows 8.1';
  if(ua.indexOf('Windows NT 6.2')!==-1) return 'Windows 8';
  if(ua.indexOf('Windows NT 6.1')!==-1) return 'Windows 7';
  if(ua.indexOf('Windows')!==-1) return 'Windows';
  if(ua.indexOf('iPhone')!==-1) return 'iOS (iPhone)';
  if(ua.indexOf('iPad')!==-1) return 'iOS (iPad)';
  if(ua.indexOf('Mac OS X')!==-1){ m=ua.match(/Mac OS X ([\d_]+)/); return 'macOS'+(m?' '+m[1].replace(/_/g,'.'):''); }
  if(ua.indexOf('Android')!==-1){ m=ua.match(/Android ([\d.]+)/); return 'Android'+(m?' '+m[1]:''); }
  if(ua.indexOf('Linux')!==-1) return 'Linux';
  if(ua.indexOf('CrOS')!==-1) return 'Chrome OS';
  return '—';
}

function getDeviceType(){
  var ua = safe(function(){ return navigator.userAgent; },'');
  if(/Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return 'Mobile / Tablet';
  return 'Desktop';
}

function formatDatetime(d){
  try{
    return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())
      +' '+pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds());
  }catch(e){ return '—'; }
}

function getIntlDateFormat(){
  try{
    var d = new Date(2024,0,31);
    return new Intl.DateTimeFormat(navigator.language||'en').format(d)+' (sample: Jan 31 2024)';
  }catch(e){ return '—'; }
}

function getNumberFormat(){
  try{ return (1234567.89).toLocaleString(navigator.language||undefined); }catch(e){ return '—'; }
}

function getCurrencyFormat(){
  try{
    return new Intl.NumberFormat(navigator.language||'en',{style:'currency',currency:'USD'}).format(1234.56);
  }catch(e){ return '—'; }
}

function getColorScheme(){
  try{
    if(window.matchMedia('(prefers-color-scheme:dark)').matches) return 'Dark';
    if(window.matchMedia('(prefers-color-scheme:light)').matches) return 'Light';
    return '—';
  }catch(e){ return '—'; }
}

function getReducedMotion(){
  try{ return window.matchMedia('(prefers-reduced-motion:reduce)').matches ? 'Yes':'No'; }catch(e){ return '—'; }
}

function getConnectionInfo(){
  try{
    var c = navigator.connection||navigator.mozConnection||navigator.webkitConnection;
    if(!c) return '—';
    var parts=[];
    if(c.effectiveType) parts.push('Type: '+c.effectiveType);
    if(c.downlink!==undefined) parts.push('Downlink: '+c.downlink+' Mbps');
    if(c.rtt!==undefined) parts.push('RTT: '+c.rtt+'ms');
    if(c.saveData!==undefined) parts.push('Save-data: '+(c.saveData?'on':'off'));
    return parts.length?parts.join(' | '):'—';
  }catch(e){ return '—'; }
}

function getBatteryInfo(cb){
  try{
    if(navigator.getBattery){
      navigator.getBattery().then(function(b){
        cb('Level: '+(b.level*100).toFixed(0)+'% | Charging: '+(b.charging?'Yes':'No'));
      }).catch(function(){ cb('—'); });
    } else { cb('—'); }
  }catch(e){ cb('—'); }
}

function getMemory(){
  try{
    var m = performance.memory||navigator.deviceMemory;
    if(navigator.deviceMemory) return navigator.deviceMemory+' GB (device)';
    if(performance.memory){ return 'JS Heap: '+(performance.memory.usedJSHeapSize/1048576).toFixed(1)+'MB / '+(performance.memory.jsHeapSizeLimit/1048576).toFixed(1)+'MB'; }
    return '—';
  }catch(e){ return '—'; }
}

function getHardwareConcurrency(){
  try{ return navigator.hardwareConcurrency ? navigator.hardwareConcurrency+' logical cores' : '—'; }catch(e){ return '—'; }
}

function getCookiesEnabled(){
  try{ return navigator.cookieEnabled ? 'Yes' : 'No'; }catch(e){ return '—'; }
}

function getLocalStorageAvail(){
  try{ localStorage.setItem('__t','1'); localStorage.removeItem('__t'); return 'Yes'; }catch(e){ return 'No'; }
}

function getSessionStorageAvail(){
  try{ sessionStorage.setItem('__t','1'); sessionStorage.removeItem('__t'); return 'Yes'; }catch(e){ return 'No'; }
}

function getIndexedDBAvail(){
  try{ return window.indexedDB ? 'Yes' : 'No'; }catch(e){ return '—'; }
}

function getWebGLRenderer(){
  try{
    var c = document.createElement('canvas');
    var gl = c.getContext('webgl')||c.getContext('experimental-webgl');
    if(!gl) return '—';
    var ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'WebGL supported';
  }catch(e){ return '—'; }
}

function getMaxTouchPoints(){
  try{ return navigator.maxTouchPoints!==undefined ? String(navigator.maxTouchPoints) : '—'; }catch(e){ return '—'; }
}

function buildInfoTable(){
  var ua      = safe(function(){ return navigator.userAgent; });
  var bname   = getBrowserName(ua==='—'?'':ua);
  var bver    = getBrowserVersion(ua==='—'?'':ua, bname);
  var os      = getOS(ua==='—'?'':ua);
  var now     = new Date();

  var sections = [
    { head:'Browser', rows:[
      ['Browser Name',    bname],
      ['Version',         bver],
      ['User-Agent',      ua],
      ['Vendor',          safe(function(){ return navigator.vendor; })],
      ['App Name',        safe(function(){ return navigator.appName; })],
      ['App Version',     safe(function(){ return navigator.appVersion; })],
      ['App Code Name',   safe(function(){ return navigator.appCodeName; })],
      ['Product',         safe(function(){ return navigator.product; })],
      ['Product Sub',     safe(function(){ return navigator.productSub; })],
      ['Build ID',        safe(function(){ return navigator.buildID||'—'; })],
    ]},
    { head:'Operating System & Device', rows:[
      ['Operating System', os],
      ['Platform',        safe(function(){ return navigator.platform; })],
      ['Device Type',     getDeviceType()],
      ['CPU Cores',       getHardwareConcurrency()],
      ['Device Memory',   getMemory()],
      ['Max Touch Points',getMaxTouchPoints()],
    ]},
    { head:'Screen & Display', rows:[
      ['Screen Size',     safe(function(){ return screen.width+'×'+screen.height+' px'; })],
      ['Available Size',  safe(function(){ return screen.availWidth+'×'+screen.availHeight+' px'; })],
      ['Window Size',     safe(function(){ return window.innerWidth+'×'+window.innerHeight+' px'; })],
      ['Pixel Ratio',     safe(function(){ return (window.devicePixelRatio||1)+'x'; })],
      ['Color Depth',     safe(function(){ return screen.colorDepth+'-bit'; })],
      ['Orientation',     safe(function(){ return screen.orientation ? screen.orientation.type : (window.orientation!==undefined?window.orientation+'°':'—'); })],
      ['Color Scheme',    getColorScheme()],
      ['Reduced Motion',  getReducedMotion()],
    ]},
    { head:'Network & Location', rows:[
      ['Online Status',   safe(function(){ return navigator.onLine?'Online':'Offline'; })],
      ['Connection',      getConnectionInfo()],
      ['Do Not Track',    safe(function(){ var d=navigator.doNotTrack||window.doNotTrack; return d==='1'?'Enabled':d==='0'?'Disabled':'—'; })],
    ]},
    { head:'Date, Time & Locale', rows:[
      ['Date & Time',     formatDatetime(now)],
      ['Timezone',        safe(function(){ return Intl.DateTimeFormat().resolvedOptions().timeZone; })],
      ['UTC Offset',      safe(function(){ var o=now.getTimezoneOffset(); return (o<=0?'+':'-')+pad(Math.abs(o/60|0))+':'+pad(Math.abs(o%60)); })],
      ['Unix Timestamp',  String(Math.floor(now.getTime()/1000))],
      ['Language',        safe(function(){ return navigator.language; })],
      ['Languages',       safe(function(){ return (navigator.languages||[navigator.language]).join(', '); })],
      ['Date Format',     getIntlDateFormat()],
      ['Number Format',   getNumberFormat()],
      ['Currency Format', getCurrencyFormat()],
    ]},
    { head:'Storage & APIs', rows:[
      ['Cookies Enabled', getCookiesEnabled()],
      ['LocalStorage',    getLocalStorageAvail()],
      ['SessionStorage',  getSessionStorageAvail()],
      ['IndexedDB',       getIndexedDBAvail()],
      ['Service Worker',  safe(function(){ return 'serviceWorker' in navigator ? 'Supported':'Not supported'; })],
      ['WebAssembly',     safe(function(){ return typeof WebAssembly!=='undefined'?'Supported':'Not supported'; })],
      ['WebGL Renderer',  getWebGLRenderer()],
      ['Clipboard API',   safe(function(){ return navigator.clipboard?'Supported':'Not supported'; })],
      ['Geolocation',     safe(function(){ return navigator.geolocation?'Supported':'Not supported'; })],
      ['Notifications',   safe(function(){ return 'Notification' in window?(Notification.permission):'Not supported'; })],
    ]},
  ];

  var tbody = $('infoTable').querySelector('tbody');
  tbody.innerHTML = '';
  sections.forEach(function(sec){
    var hrow = document.createElement('tr');
    hrow.className = 'info-section-head';
    var htd = document.createElement('td');
    htd.setAttribute('colspan','2');
    xssText(htd, sec.head);
    hrow.appendChild(htd);
    tbody.appendChild(hrow);
    sec.rows.forEach(function(r){
      var tr = document.createElement('tr');
      var val = r[1]||'—';
      var td1 = document.createElement('td');
      var td2 = document.createElement('td');
      xssText(td1, r[0]);
      if(val==='—'||val==='N/A'||val==='Not supported'){
        td2.className = 'info-na';
        xssText(td2, val);
      } else {
        xssText(td2, val);
      }
      tr.appendChild(td1); tr.appendChild(td2);
      tbody.appendChild(tr);
    });
  });

  getBatteryInfo(function(info){
    var rows = tbody.querySelectorAll('tr');
    for(var i=0;i<rows.length;i++){
      var cells = rows[i].querySelectorAll('td');
      if(cells.length===2 && cells[0].textContent==='Battery'){
        xssText(cells[1], info); return;
      }
    }
    var tr = document.createElement('tr');
    var td1 = document.createElement('td'); xssText(td1,'Battery');
    var td2 = document.createElement('td');
    if(info==='—'){ td2.className='info-na'; xssText(td2,'—'); } else { xssText(td2,info); }
    tr.appendChild(td1); tr.appendChild(td2);
    tbody.appendChild(tr);
  });
}

// Modal open/close
$('browserInfoBtn').addEventListener('click', function(){
  buildInfoTable();
  openOverlay('modalOverlay','modalClose');
});
function closeModal(){ closeOverlay('modalOverlay'); }
$('modalClose').addEventListener('click', closeModal);
$('modalOverlay').addEventListener('click', function(e){ if(e.target===this) closeModal(); });
