'use strict';

/* ══════════════════════════════════════════
   BASE64 ENCODER / DECODER
══════════════════════════════════════════ */
var b64EncTa = $('b64EncTa');
var b64DecTa = $('b64DecTa');
var b64Updating = false; // prevent feedback loops

function b64Encode(str){
  try{
    // Handle Unicode correctly via TextEncoder
    if(typeof TextEncoder !== 'undefined'){
      var bytes = new TextEncoder().encode(str);
      var bin = '';
      for(var i=0;i<bytes.length;i++) bin += String.fromCharCode(bytes[i]);
      return btoa(bin);
    }
    // Fallback: encode URI components then escape
    return btoa(unescape(encodeURIComponent(str)));
  }catch(e){ return ''; }
}

function b64Decode(str){
  try{
    var clean = str.replace(/\s/g,''); // strip whitespace/newlines
    if(!clean) return '';
    var bin = atob(clean);
    if(typeof TextDecoder !== 'undefined'){
      var bytes = new Uint8Array(bin.length);
      for(var i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder('utf-8',{fatal:false}).decode(bytes);
    }
    // Fallback
    return decodeURIComponent(escape(bin));
  }catch(e){ return null; } // null = invalid base64
}

var B64_ERR_CLS = 'b64-enc-err';
function setB64Error(ta, on){
  if(on){ ta.classList.add(B64_ERR_CLS); }
  else  { ta.classList.remove(B64_ERR_CLS); }
}

b64EncTa.addEventListener('input', function(){
  if(b64Updating) return;
  b64Updating = true;
  var decoded = b64Decode(b64EncTa.value);
  if(b64EncTa.value.trim() === ''){ b64DecTa.value=''; setB64Error(b64EncTa,false); }
  else if(decoded === null){ setB64Error(b64EncTa,true); } // invalid base64
  else{ b64DecTa.value = decoded; setB64Error(b64EncTa,false); }
  b64Updating = false;
});

b64DecTa.addEventListener('input', function(){
  if(b64Updating) return;
  b64Updating = true;
  setB64Error(b64EncTa, false);
  if(b64DecTa.value === ''){ b64EncTa.value=''; }
  else{ b64EncTa.value = b64Encode(b64DecTa.value); }
  b64Updating = false;
});

// Reliable paste: execCommand fires on every user-gesture click without permission prompts.
// Clipboard API used as fallback for browsers where execCommand paste is blocked.
function pasteInto(el, onDone){
  el.focus();
  el.select(); // select all so paste replaces content
  var ok = false;
  try{ ok = document.execCommand('paste'); }catch(e){}
  if(ok){
    if(onDone) onDone(el.value);
    el.dispatchEvent(new Event('input'));
    return;
  }
  // Fallback: Clipboard API
  if(navigator.clipboard && navigator.clipboard.readText){
    navigator.clipboard.readText()
      .then(function(txt){
        el.value = txt;
        if(onDone) onDone(txt);
        el.dispatchEvent(new Event('input'));
      })
      .catch(function(){});
  }
}

// Copy/Clear/Download helpers for each side
function wireB64Toolbar(copyId, clearId, dlId, ta, dlName){
  $(copyId).addEventListener('click', function(){
    if(!ta.value) return;
    copyText(ta.value); flashBtn($(copyId),'Copied!');
  });
  $(clearId).addEventListener('click', function(){
    ta.value=''; ta.dispatchEvent(new Event('input'));
    setB64Error(b64EncTa,false);
  });
  $(dlId).addEventListener('click', function(){
    if(!ta.value) return;
    downloadFile(ta.value, dlName, 'text/plain');
    flashBtn($(dlId),'Saved!');
  });
}
wireB64Toolbar('b64CopyDec','b64ClearDec','b64DlDec', b64DecTa, 'decoded.txt');
wireB64Toolbar('b64CopyEnc','b64ClearEnc','b64DlEnc', b64EncTa, 'encoded.txt');

// File upload → Base64 encode
function handleB64File(file){
  if(!file) return;
  if(file.size > CFG.MAX_B64_FILE_BYTES){
    xssText($('b64Fname'), 'File too large — max '+Math.round(CFG.MAX_B64_FILE_BYTES/1048576)+' MB.');
    return;
  }
  xssText($('b64Fname'), file.name+' ('+Math.round(file.size/1024)+' KB)');
  var reader = new FileReader();
  reader.onload = function(e){
    var result = e.target.result;
    var b64 = result.indexOf(',') !== -1 ? result.split(',')[1] : result;
    b64EncTa.value = b64;
    var dec = b64Decode(b64);
    b64DecTa.value = (dec !== null) ? dec : '(binary file — encoded above)';
    setB64Error(b64EncTa, false);
  };
  reader.onerror = function(){ xssText($('b64Fname'), 'Error reading file.'); };
  reader.readAsDataURL(file);
}

var b64Drop = $('b64Drop');
b64Drop.addEventListener('dragover', function(e){ e.preventDefault(); b64Drop.classList.add('drag-over'); });
b64Drop.addEventListener('dragleave', function(){ b64Drop.classList.remove('drag-over'); });
b64Drop.addEventListener('drop', function(e){
  e.preventDefault(); b64Drop.classList.remove('drag-over');
  var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if(f) handleB64File(f);
});
b64Drop.addEventListener('click', function(e){
  if(e.target.tagName!=='LABEL') $('b64FileIn').click();
});
b64Drop.addEventListener('keydown', function(e){
  if(e.key==='Enter'||e.key===' '){ e.preventDefault(); $('b64FileIn').click(); }
});
$('b64FileIn').addEventListener('change', function(){
  if(this.files && this.files[0]) handleB64File(this.files[0]);
});

function openB64(){ openOverlay('b64Overlay','b64Close'); }
function closeB64(){ closeOverlay('b64Overlay'); }
$('b64Btn').addEventListener('click', openB64);
$('b64Close').addEventListener('click', closeB64);
$('b64Overlay').addEventListener('click', function(e){ if(e.target===this) closeB64(); });
