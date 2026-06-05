'use strict';

/* ══════════════════════════════════════════
   GLOBAL CONFIGURATION
══════════════════════════════════════════ */
var CFG = {
  /* Text / textarea input limits (characters) */
  MAX_JSON_CHARS:      100000,
  MAX_B64_CHARS:       100000,
  MAX_TA_CHARS:        500000,
  MAX_QR_CHARS:        500,

  /* File input limits (bytes) */
  MAX_B64_FILE_BYTES:  10 * 1024 * 1024,  /* 10 MB — Base64 file upload */
  MAX_QR_FILE_BYTES:   10 * 1024 * 1024,  /* 10 MB — QR logo image upload */

  /* bcrypt cost factor ceiling */
  MAX_BCRYPT_COST:     20,
};

/* ══════════════════════════════════════════
   UTILITIES
══════════════════════════════════════════ */
var $ = function(id){ return document.getElementById(id); };
var pad = function(n,w){ return String(n).padStart ? String(n).padStart(w||2,'0') : (n < 10 ? '0'+n : String(n)); };
var rndH = function(n){ var s=''; for(var i=0;i<n;i++) s+=(Math.random()*16|0).toString(16); return s; };
var esc  = function(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); };

/* XSS-safe helpers — never insert raw user content via innerHTML */
function xssText(el, text){ if(el) el.textContent = String(text === undefined || text === null ? '' : text); }
function xssAttr(el, attr, value){ if(el) el.setAttribute(attr, String(value === undefined || value === null ? '' : value)); }
/* safeHTML — only for trusted, already-escaped or internally-generated markup */
function safeHTML(el, markup){ if(el) el.innerHTML = markup; }

function decodeUnicode(s){
  try{ return s.replace(/\\u([0-9a-fA-F]{4})/g,function(_,h){ return String.fromCharCode(parseInt(h,16)); }); }
  catch(e){ return s; }
}

function copyText(text){
  if(!text) return;
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).catch(function(){ execCopy(text); });
  } else { execCopy(text); }
}
function execCopy(text){
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
  document.body.appendChild(ta);
  ta.focus(); ta.select();
  try{ document.execCommand('copy'); }catch(e){}
  document.body.removeChild(ta);
}

function flashBtn(btn, label, ms){
  if(!btn || btn.dataset.flashing) return;
  btn.dataset.flashing = '1';
  var orig = btn.innerHTML;
  btn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> '+(label||'Done!');
  btn.classList.add('ok');
  setTimeout(function(){ btn.innerHTML=orig; btn.classList.remove('ok'); delete btn.dataset.flashing; }, ms||1500);
}

function downloadFile(content, name){
  try{
    var blob = new Blob([content], {type:'application/json'});
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href = url; a.download = name || 'formatted.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 30000);
  }catch(e){ alert('Download failed: '+e.message); }
}

var lineNums = function(n){
  var a=[]; for(var i=1;i<=Math.max(1,n);i++) a.push(i);
  return a.join('\n');
};

/* ══════════════════════════════════════════
   THEME
══════════════════════════════════════════ */
var SUN_ICON  = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>';
var MOON_ICON = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
var dark;
try{
  var _stored = localStorage.getItem('theme');
  dark = _stored !== null ? _stored === 'dark' : (window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)').matches : true);
}catch(e){ dark = true; }

function applyTheme(){
  document.documentElement.setAttribute('data-theme', dark?'dark':'light');
  $('themeIcon').innerHTML = dark ? SUN_ICON : MOON_ICON;
  $('themeLbl').textContent = dark ? 'Light' : 'Dark';
  var mc = $('metaThemeColor');
  if(mc) mc.content = dark ? '#050608' : '#f4f6fb';
  try{ localStorage.setItem('theme', dark?'dark':'light'); }catch(e){}
}
applyTheme();
$('themeBtn').addEventListener('click', function(){ dark=!dark; applyTheme(); });
$('footerYear').textContent = new Date().getFullYear();

/* ══════════════════════════════════════════
   FOCUS TRAP UTILITY  (shared across all modals)
══════════════════════════════════════════ */
var FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
var _prevFocus = null;

function openOverlay(overlayId, firstFocusId){
  var ov = $(overlayId);
  if(!ov) return;
  _prevFocus = document.activeElement;
  ov.classList.add('open');
  document.body.style.overflow = 'hidden';
  ov.setAttribute('aria-hidden','false');
  // Focus first element
  var target = firstFocusId ? $(firstFocusId) : ov.querySelector(FOCUSABLE);
  if(target) setTimeout(function(){ target.focus(); }, 50);
}

function closeOverlay(overlayId){
  var ov = $(overlayId);
  if(!ov) return;
  ov.classList.remove('open');
  document.body.style.overflow = '';
  ov.setAttribute('aria-hidden','true');
  if(_prevFocus) { _prevFocus.focus(); _prevFocus = null; }
}

function trapFocus(overlay, e){
  if(!overlay.classList.contains('open')) return;
  var focusable = Array.from(overlay.querySelectorAll(FOCUSABLE));
  if(!focusable.length) return;
  var first = focusable[0], last = focusable[focusable.length-1];
  if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
  else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
}

// Global Escape handler for all overlays
document.addEventListener('keydown', function(e){
  if(e.key !== 'Escape') return;
  ['modalOverlay','ipModalOverlay','b64Overlay','taOverlay','qrOverlay','convOverlay','diffOverlay','tgOverlay'].forEach(function(id){
    var ov = $(id);
    if(ov && ov.classList.contains('open')) closeOverlay(id);
  });
});

// Focus trap for all overlays
['modalOverlay','ipModalOverlay','b64Overlay','taOverlay','qrOverlay','convOverlay','diffOverlay','tgOverlay'].forEach(function(id){
  var ov = $(id);
  if(!ov) return;
  ov.setAttribute('aria-hidden','true');
  ov.addEventListener('keydown', function(e){ if(e.key==='Tab') trapFocus(ov,e); });
});
