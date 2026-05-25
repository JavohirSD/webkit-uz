'use strict';

/* ══════════════════════════════════════════
   QR CODE GENERATOR
══════════════════════════════════════════ */
var qrLogoImg = null;
var qrGenerated = false;

function qrSetMsg(txt, type){
  var el = $('qrMsg');
  el.textContent = txt;
  el.className = 'qr-msg' + (type ? ' '+type : '');
}

function qrGenerate(){
  var text = ($('qrText').value||'').trim();
  if(!text){ qrSetMsg('Please enter text or URL to encode.','err'); return; }
  if(typeof QRCode === 'undefined'){ qrSetMsg('QR library not loaded. Check internet connection.','err'); return; }
  var size = parseInt($('qrSize').value, 10) || 512;
  var ecc  = $('qrEcc').value || 'H';
  var fg   = $('qrFg').value || '#000000';
  var bg   = $('qrBg').value || '#ffffff';
  qrSetMsg('Generating…');
  $('qrGenBtn').disabled = true;
  var canvas = $('qrCanvas');
  QRCode.toCanvas(canvas, text, {
    errorCorrectionLevel: ecc,
    width: size, margin: 2,
    color: { dark: fg, light: bg }
  }, function(err){
    $('qrGenBtn').disabled = false;
    if(err){ qrSetMsg('Error: '+err.message,'err'); return; }
    // Overlay logo if uploaded
    if(qrLogoImg){
      var ctx = canvas.getContext('2d');
      var logoSize = Math.round(canvas.width * 0.22);
      var x = Math.round((canvas.width - logoSize) / 2);
      var y = Math.round((canvas.height - logoSize) / 2);
      var pad = Math.round(logoSize * 0.08);
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x-pad, y-pad, logoSize+pad*2, logoSize+pad*2, pad) : ctx.rect(x-pad, y-pad, logoSize+pad*2, logoSize+pad*2);
      ctx.fill();
      ctx.drawImage(qrLogoImg, x, y, logoSize, logoSize);
    }
    $('qrPlaceholder').style.display = 'none';
    canvas.classList.remove('canvas-hidden');
    $('qrPreviewWrap').classList.add('qr-has-result');
    $('qrPreviewWrap').style.background = bg;
    $('qrSaveBtn').disabled = false;
    qrGenerated = true;
    qrSetMsg('QR code ready — '+size+'×'+size+' px','ok');
  });
}

function qrSave(){
  if(!qrGenerated) return;
  var src = $('qrCanvas');
  var exp = document.createElement('canvas');
  exp.width = src.width; exp.height = src.height;
  var ctx = exp.getContext('2d');
  ctx.fillStyle = $('qrBg').value || '#ffffff';
  ctx.fillRect(0, 0, exp.width, exp.height);
  ctx.drawImage(src, 0, 0);
  exp.toBlob(function(blob){
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'qrcode_'+Date.now()+'.jpg';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 30000);
    flashBtn($('qrSaveBtn'),'Saved!');
  }, 'image/jpeg', 0.96);
}

function qrClear(){
  $('qrText').value = '';
  xssText($('qrFname'), '');
  qrLogoImg = null; qrGenerated = false;
  var canvas = $('qrCanvas');
  canvas.classList.add('canvas-hidden');
  $('qrPlaceholder').style.display = '';
  $('qrPreviewWrap').classList.remove('qr-has-result');
  $('qrPreviewWrap').style.background = '';
  $('qrSaveBtn').disabled = true;
  qrSetMsg('');
  $('qrFileIn').value = '';
}

function qrHandleFile(file){
  if(!file || !file.type.match(/^image\//)) return;
  if(file.size > CFG.MAX_QR_FILE_BYTES){
    xssText($('qrFname'), 'Image too large — max '+Math.round(CFG.MAX_QR_FILE_BYTES/1048576)+' MB.');
    return;
  }
  xssText($('qrFname'), file.name);
  var reader = new FileReader();
  reader.onload = function(e){
    var img = new Image();
    img.onload = function(){ qrLogoImg = img; };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

$('qrGenBtn').addEventListener('click', qrGenerate);
$('qrSaveBtn').addEventListener('click', qrSave);
$('qrClearBtn').addEventListener('click', qrClear);
$('qrText').addEventListener('keydown', function(e){ if(e.ctrlKey && e.key==='Enter') qrGenerate(); });

var qrDrop = $('qrDrop');
qrDrop.addEventListener('dragover', function(e){ e.preventDefault(); qrDrop.classList.add('drag-over'); });
qrDrop.addEventListener('dragleave', function(){ qrDrop.classList.remove('drag-over'); });
qrDrop.addEventListener('drop', function(e){ e.preventDefault(); qrDrop.classList.remove('drag-over'); qrHandleFile(e.dataTransfer && e.dataTransfer.files[0]); });
qrDrop.addEventListener('click', function(e){ if(e.target.tagName !== 'LABEL') $('qrFileIn').click(); });
qrDrop.addEventListener('keydown', function(e){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); $('qrFileIn').click(); } });
$('qrFileIn').addEventListener('change', function(){ qrHandleFile(this.files && this.files[0]); });

function openQR(){ openOverlay('qrOverlay','qrClose'); }
function closeQR(){ closeOverlay('qrOverlay'); }
$('qrBtn').addEventListener('click', openQR);
$('qrClose').addEventListener('click', closeQR);
$('qrOverlay').addEventListener('click', function(e){ if(e.target===this) closeQR(); });
