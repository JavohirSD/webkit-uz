'use strict';

/* ══════════════════════════════════════════
   UNIT CONVERTERS
══════════════════════════════════════════ */

/* ── Data Storage (base unit: bytes) ── */
var DATA_TO_BYTES = { bit:0.125, byte:1, kb:1024, mb:1048576, gb:1073741824, pb:1.125899906842624e15, zb:1.180591620717411e21 };
/* ── Length (base unit: metres) ── */
var LEN_TO_M = { m:1, km:1000, cm:0.01, dm:0.1, 'in':0.0254, ft:0.3048, yd:0.9144, mi:1609.344 };
/* ── Weight (base unit: grams) ── */
var WGT_TO_G = { mg:0.001, g:1, kg:1000, lb:453.59237, t:1000000 };

function fmtNum(n){
  if(!isFinite(n)) return '';
  if(Math.abs(n) === 0) return '0';
  if(Math.abs(n) >= 0.0001 && Math.abs(n) < 1e15) return parseFloat(n.toPrecision(10)).toString();
  return n.toExponential(6);
}

/* ── Numeric-only input guard ──
   Allows: digits, one leading minus, one decimal point, Backspace/Delete/arrows/Tab/Enter.
   Blocks everything else and shows the group error div.                                      */
var NUMERIC_RE = /^-?\d*\.?\d*$/;

function convNumericKeydown(e){
  /* allow control keys */
  var ctrl = e.ctrlKey || e.metaKey;
  if(ctrl) return; /* allow Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X, etc. */
  var allowed = ['Backspace','Delete','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Tab','Enter','Home','End'];
  if(allowed.indexOf(e.key) !== -1) return;
  /* allow minus only at position 0 with no existing minus */
  if(e.key === '-'){
    if(e.target.selectionStart === 0 && e.target.value.indexOf('-') === -1) return;
    e.preventDefault(); return;
  }
  /* allow one dot */
  if(e.key === '.'){
    if(e.target.value.indexOf('.') === -1) return;
    e.preventDefault(); return;
  }
  /* allow digits 0-9 */
  if(e.key >= '0' && e.key <= '9') return;
  /* block everything else */
  e.preventDefault();
}

function convShowErr(errId, show){
  var el = $(errId);
  if(!el) return;
  if(show){ el.classList.add('show'); }
  else    { el.classList.remove('show'); }
}

function convValidateAndMark(inp, errId){
  var v = inp.value;
  /* clean: strip anything that isn't a digit, dot, or leading minus */
  var cleaned = v.replace(/[^\d.\-]/g, '');
  /* keep only first dot */
  var dotIdx = cleaned.indexOf('.');
  if(dotIdx !== -1) cleaned = cleaned.slice(0, dotIdx+1) + cleaned.slice(dotIdx+1).replace(/\./g,'');
  /* keep leading minus only */
  if(cleaned.indexOf('-') !== -1){
    cleaned = '-' + cleaned.replace(/-/g,'');
  }
  var invalid = (v !== cleaned);
  if(invalid) inp.value = cleaned;
  inp.classList.toggle('conv-input-err', invalid && cleaned === '');
  convShowErr(errId, invalid);
  return cleaned;
}

function wireLinearGroup(toBase, errId){
  return function(e){
    var src = e.target;
    var cleaned = convValidateAndMark(src, errId);
    var val = parseFloat(cleaned);
    var inputs = document.querySelectorAll('.conv-input[data-group="'+src.dataset.group+'"]');
    if(cleaned.trim() === '' || isNaN(val)){
      inputs.forEach(function(inp){ if(inp!==src) inp.value=''; });
      return;
    }
    convShowErr(errId, false);
    var base = val * toBase[src.dataset.unit];
    inputs.forEach(function(inp){
      if(inp === src) return;
      inp.value = fmtNum(base / toBase[inp.dataset.unit]);
    });
  };
}

/* Wire data group */
document.querySelectorAll('.conv-input[data-group="data"]').forEach(function(inp){
  inp.addEventListener('keydown', convNumericKeydown);
  inp.addEventListener('input', wireLinearGroup(DATA_TO_BYTES, 'data-err'));
});
/* Wire length group */
document.querySelectorAll('.conv-input[data-group="len"]').forEach(function(inp){
  inp.addEventListener('keydown', convNumericKeydown);
  inp.addEventListener('input', wireLinearGroup(LEN_TO_M, 'len-err'));
});
/* Wire weight group */
document.querySelectorAll('.conv-input[data-group="weight"]').forEach(function(inp){
  inp.addEventListener('keydown', convNumericKeydown);
  inp.addEventListener('input', wireLinearGroup(WGT_TO_G, 'weight-err'));
});

/* ── Temperature ── */
function tempToK(val, unit){
  if(unit==='c') return val + 273.15;
  if(unit==='f') return (val - 32) * 5/9 + 273.15;
  return val;
}
function kToUnit(k, unit){
  if(unit==='c') return k - 273.15;
  if(unit==='f') return (k - 273.15) * 9/5 + 32;
  return k;
}
document.querySelectorAll('.conv-input[data-group="temp"]').forEach(function(inp){
  inp.addEventListener('keydown', convNumericKeydown);
  inp.addEventListener('input', function(){
    var cleaned = convValidateAndMark(inp, 'temp-err');
    var val = parseFloat(cleaned);
    var allTemp = document.querySelectorAll('.conv-input[data-group="temp"]');
    if(cleaned.trim()==='' || isNaN(val)){
      allTemp.forEach(function(i){ if(i!==inp) i.value=''; }); return;
    }
    convShowErr('temp-err', false);
    var k = tempToK(val, inp.dataset.unit);
    allTemp.forEach(function(i){ if(i!==inp) i.value = fmtNum(kToUnit(k, i.dataset.unit)); });
  });
});

/* ── Time converter ── */
var ctLock = false;
function ctUpdate(srcId, msVal){
  if(ctLock) return; ctLock = true;
  try{
    if(isNaN(msVal) || !isFinite(msVal)){ ctLock=false; return; }
    var d = new Date(msVal);
    if(srcId !== 'ctUnixSec') $('ctUnixSec').value = Math.round(msVal/1000);
    if(srcId !== 'ctUnixMs')  $('ctUnixMs').value  = msVal;
    if(srcId !== 'ctIso'){
      var tzOff = d.getTimezoneOffset()*60000;
      var local  = new Date(d - tzOff);
      $('ctIso').value = local.toISOString().slice(0,19);
    }
    $('ctHuman').value = d.toUTCString().replace('GMT','UTC');
  }catch(e){}
  ctLock = false;
}

$('ctUnixSec').addEventListener('keydown', convNumericKeydown);
$('ctUnixSec').addEventListener('input', function(){
  var cleaned = convValidateAndMark(this, 'time-err');
  var v = parseFloat(cleaned);
  if(cleaned.trim()===''){ [$('ctUnixMs'),$('ctIso'),$('ctHuman')].forEach(function(e){e.value='';}); return; }
  convShowErr('time-err', false);
  if(!isNaN(v)) ctUpdate('ctUnixSec', v * 1000);
});
$('ctUnixMs').addEventListener('keydown', convNumericKeydown);
$('ctUnixMs').addEventListener('input', function(){
  var cleaned = convValidateAndMark(this, 'time-err');
  var v = parseFloat(cleaned);
  if(cleaned.trim()===''){ [$('ctUnixSec'),$('ctIso'),$('ctHuman')].forEach(function(e){e.value='';}); return; }
  convShowErr('time-err', false);
  if(!isNaN(v)) ctUpdate('ctUnixMs', v);
});
$('ctIso').addEventListener('input', function(){
  if(this.value.trim()==='') { [$('ctUnixSec'),$('ctUnixMs'),$('ctHuman')].forEach(function(e){e.value='';}); return; }
  var d = new Date(this.value);
  if(!isNaN(d.getTime())) ctUpdate('ctIso', d.getTime());
});
$('ctNowBtn').addEventListener('click', function(){ ctUpdate('', Date.now()); });

/* ── Number Base Converter ── */
(function(){
  var fromSel = $('cbFromBase'), toSel = $('cbToBase');
  for(var b=2; b<=36; b++){
    var o1=document.createElement('option'), o2=document.createElement('option');
    o1.value=o2.value=b;
    o1.textContent = 'Base '+b+(b===2?' (Binary)':b===8?' (Octal)':b===10?' (Decimal)':b===16?' (Hexadecimal)':'');
    o2.textContent = o1.textContent;
    if(b===10) o1.selected=true;
    if(b===2)  o2.selected=true;
    fromSel.appendChild(o1); toSel.appendChild(o2);
  }
  function updateFromLbl(){ xssText($('cbFromLbl'), fromSel.value); }
  function updateToLbl()  { xssText($('cbToLbl'),   toSel.value); }
  function convert(){
    var raw = ($('cbFrom').value||'').trim();
    if(!raw){ $('cbTo').value=''; return; }
    try{
      var n = parseInt(raw, parseInt(fromSel.value,10));
      if(isNaN(n)){ $('cbTo').value='Invalid'; return; }
      $('cbTo').value = n.toString(parseInt(toSel.value,10)).toUpperCase();
    }catch(e){ $('cbTo').value='Error'; }
  }
  $('cbFrom').addEventListener('input', convert);
  fromSel.addEventListener('change', function(){ updateFromLbl(); convert(); });
  toSel.addEventListener('change',   function(){ updateToLbl();   convert(); });
  document.querySelectorAll('[data-qb]').forEach(function(btn){
    btn.addEventListener('click', function(){ fromSel.value = btn.dataset.qb; updateFromLbl(); convert(); });
  });
  document.querySelectorAll('[data-qb2]').forEach(function(btn){
    btn.addEventListener('click', function(){ toSel.value = btn.dataset.qb2; updateToLbl(); convert(); });
  });
  updateFromLbl(); updateToLbl();
})();

/* ── Converter tab switching ── */
document.querySelectorAll('.conv-tab').forEach(function(tab){
  tab.addEventListener('click', function(){
    document.querySelectorAll('.conv-tab').forEach(function(t){
      t.classList.remove('active');
      t.setAttribute('aria-selected','false');
    });
    document.querySelectorAll('.conv-panel').forEach(function(p){ p.classList.remove('active'); });
    tab.classList.add('active');
    tab.setAttribute('aria-selected','true');
    var panel = document.getElementById('ctab-'+tab.dataset.tab);
    if(panel){ panel.classList.add('active'); panel.focus(); }
  });
  tab.addEventListener('keydown', function(e){
    var tabs = Array.from(document.querySelectorAll('.conv-tab'));
    var idx  = tabs.indexOf(tab);
    if(e.key === 'ArrowRight'){ e.preventDefault(); tabs[(idx+1)%tabs.length].click(); tabs[(idx+1)%tabs.length].focus(); }
    else if(e.key === 'ArrowLeft'){ e.preventDefault(); tabs[(idx-1+tabs.length)%tabs.length].click(); tabs[(idx-1+tabs.length)%tabs.length].focus(); }
    else if(e.key === 'Home'){ e.preventDefault(); tabs[0].click(); tabs[0].focus(); }
    else if(e.key === 'End'){ e.preventDefault(); tabs[tabs.length-1].click(); tabs[tabs.length-1].focus(); }
  });
});

function openConv(){ openOverlay('convOverlay','convClose'); }
function closeConv(){ closeOverlay('convOverlay'); }
$('convBtn').addEventListener('click', openConv);
$('convClose').addEventListener('click', closeConv);
$('convOverlay').addEventListener('click', function(e){ if(e.target===this) closeConv(); });
