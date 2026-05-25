'use strict';

/* ══════════════════════════════════════════
   TEXT ANALYZER
══════════════════════════════════════════ */
var taTa   = $('taTa');
var taWarn = $('taWarn');
var TA_MAX = CFG.MAX_TA_CHARS;

function countBytes(str){
  try{
    if(typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str).length;
    return encodeURIComponent(str).replace(/%[0-9a-fA-F]{2}/g,'x').length;
  }catch(e){ return str.length; }
}

function updateTAStats(){
  var v = taTa.value;
  if(v.length >= TA_MAX){ taWarn.classList.add('show'); }
  else{ taWarn.classList.remove('show'); }
  var chars    = v.length;
  var words    = v.trim() === '' ? 0 : v.trim().split(/\s+/).filter(function(w){ return w.length>0; }).length;
  var sents    = v.trim() === '' ? 0 : (v.match(/[.!?]+(\s|$)/g)||[]).length;
  var spaces   = (v.match(/ /g)||[]).length;
  var newlines = (v.match(/\n/g)||[]).length;
  var bytes    = countBytes(v);
  var kb       = bytes/1024;

  $('taChars').textContent  = chars.toLocaleString();
  $('taWords').textContent  = words.toLocaleString();
  $('taSents').textContent  = sents.toLocaleString();
  $('taSpaces').textContent = spaces.toLocaleString();
  $('taLines').textContent  = newlines.toLocaleString();
  $('taBytes').textContent  = bytes.toLocaleString();
  $('taKb').textContent     = kb.toFixed(2);
}

taTa.addEventListener('input', updateTAStats);

$('taCopy').addEventListener('click', function(){
  if(!taTa.value) return;
  copyText(taTa.value); flashBtn($('taCopy'),'Copied!');
});
$('taClear').addEventListener('click', function(){ taTa.value=''; updateTAStats(); });
$('taDl').addEventListener('click', function(){
  if(!taTa.value) return;
  downloadFile(taTa.value, 'text_'+new Date().toISOString().slice(0,10)+'.txt', 'text/plain');
  flashBtn($('taDl'),'Saved!');
});
$('taUpper').addEventListener('click', function(){ taTa.value=taTa.value.toUpperCase(); updateTAStats(); });
$('taLower').addEventListener('click', function(){ taTa.value=taTa.value.toLowerCase(); updateTAStats(); });
$('taMinify').addEventListener('click', function(){
  taTa.value = taTa.value.replace(/\s+/g,' ').trim();
  updateTAStats();
});

function openTA(){ openOverlay('taOverlay','taClose'); updateTAStats(); }
function closeTA(){ closeOverlay('taOverlay'); }
$('textAnalyzerBtn').addEventListener('click', openTA);
$('taClose').addEventListener('click', closeTA);
$('taOverlay').addEventListener('click', function(e){ if(e.target===this) closeTA(); });
