'use strict';

/* ══════════════════════════════════════════
   UUID GENERATORS
══════════════════════════════════════════ */
var UUID_EPOCH = typeof BigInt !== 'undefined' ? BigInt('122192928000000000') : null;

function uuidV1(){
  var t = BigInt(Date.now())*BigInt(10000) + UUID_EPOCH;
  var tlo = (t & BigInt(0xFFFFFFFF)).toString(16).padStart(8,'0');
  var tmd = ((t >> BigInt(32)) & BigInt(0xFFFF)).toString(16).padStart(4,'0');
  var thi = ((t >> BigInt(48)) & BigInt(0xFFF)).toString(16).padStart(3,'0');
  var ch  = (((Math.random()*0x3F|0))|0x80).toString(16).padStart(2,'0');
  var cl  = (Math.random()*0x100|0).toString(16).padStart(2,'0');
  return tlo+'-'+tmd+'-1'+thi+'-'+ch+cl+'-'+rndH(12);
}

function uuidV4(){
  try{ if(crypto && crypto.randomUUID) return crypto.randomUUID(); }catch(e){}
  return rndH(8)+'-'+rndH(4)+'-4'+rndH(3)+'-'+((Math.random()*4|0)|8).toString(16)+rndH(3)+'-'+rndH(12);
}

function sha1(data){
  function rotl(n,s){ return ((n<<s)|(n>>>(32-s)))>>>0; }
  var H=[0x67452301,0xEFCDAB89,0x98BADCFE,0x10325476,0xC3D2E1F0];
  var m=[]; for(var i=0;i<data.length;i++) m.push(data[i]);
  var bl=m.length*8; m.push(0x80);
  while(m.length%64!==56) m.push(0);
  m.push(0,0,0,0,(bl>>>24)&0xFF,(bl>>>16)&0xFF,(bl>>>8)&0xFF,bl&0xFF);
  for(var bi=0;bi<m.length;bi+=64){
    var W=[];
    for(var j=0;j<16;j++) W[j]=(m[bi+j*4]<<24)|(m[bi+j*4+1]<<16)|(m[bi+j*4+2]<<8)|m[bi+j*4+3];
    for(j=16;j<80;j++) W[j]=rotl(W[j-3]^W[j-8]^W[j-14]^W[j-16],1);
    var a=H[0],b=H[1],c=H[2],d=H[3],e=H[4];
    for(j=0;j<80;j++){
      var f,k;
      if(j<20){f=((b&c)|(~b&d))>>>0;k=0x5A827999;}
      else if(j<40){f=(b^c^d)>>>0;k=0x6ED9EBA1;}
      else if(j<60){f=((b&c)|(b&d)|(c&d))>>>0;k=0x8F1BBCDC;}
      else{f=(b^c^d)>>>0;k=0xCA62C1D6;}
      var tmp=(rotl(a,5)+f+e+k+W[j])>>>0;
      e=d;d=c;c=rotl(b,30);b=a;a=tmp;
    }
    H[0]=(H[0]+a)>>>0;H[1]=(H[1]+b)>>>0;H[2]=(H[2]+c)>>>0;H[3]=(H[3]+d)>>>0;H[4]=(H[4]+e)>>>0;
  }
  var out=new Uint8Array(20);
  for(var i=0;i<5;i++){out[i*4]=(H[i]>>>24)&0xFF;out[i*4+1]=(H[i]>>>16)&0xFF;out[i*4+2]=(H[i]>>>8)&0xFF;out[i*4+3]=H[i]&0xFF;}
  return out;
}

function uuidV5(){
  var NS=[0x6b,0xa7,0xb8,0x10,0x9d,0xad,0x11,0xd1,0x80,0xb4,0x00,0xc0,0x4f,0xd4,0x30,0xc8];
  var nm; try{ nm=Array.from(new TextEncoder().encode(String(Date.now())+rndH(8))); }
  catch(e){ nm=String(Date.now()+rndH(8)).split('').map(function(c){ return c.charCodeAt(0); }); }
  var d=NS.concat(nm), h=sha1(d);
  h[6]=(h[6]&0x0F)|0x50; h[8]=(h[8]&0x3F)|0x80;
  var x=Array.from(h,function(b){ return b.toString(16).padStart(2,'0'); }).join('');
  return x.slice(0,8)+'-'+x.slice(8,12)+'-'+x.slice(12,16)+'-'+x.slice(16,20)+'-'+x.slice(20,32);
}

function uuidV6(){
  var t = BigInt(Date.now())*BigInt(10000) + UUID_EPOCH;
  var h48 = (t>>BigInt(12)) & BigInt('281474976710655');
  var lo12= (t&BigInt(0xFFF)).toString(16).padStart(3,'0');
  var g1  = ((h48>>BigInt(16)) & BigInt(0xFFFFFFFF)).toString(16).padStart(8,'0');
  var g2  = (h48&BigInt(0xFFFF)).toString(16).padStart(4,'0');
  var ch  = (((Math.random()*0x3F|0))|0x80).toString(16).padStart(2,'0');
  var cl  = (Math.random()*0x100|0).toString(16).padStart(2,'0');
  return g1+'-'+g2+'-6'+lo12+'-'+ch+cl+'-'+rndH(12);
}

function uuidV7(){
  var ts=Date.now().toString(16).padStart(12,'0');
  return ts.slice(0,8)+'-'+ts.slice(8,12)+'-7'+rndH(3)+'-'+((Math.random()*4|0)|8).toString(16)+rndH(3)+'-'+rndH(12);
}

// Fallback for browsers without BigInt (IE, old Safari)
function uuidV1Fallback(){ return rndH(8)+'-'+rndH(4)+'-1'+rndH(3)+'-'+(((Math.random()*4|0)|8).toString(16))+rndH(3)+'-'+rndH(12); }
function uuidV6Fallback(){ return rndH(8)+'-'+rndH(4)+'-6'+rndH(3)+'-'+(((Math.random()*4|0)|8).toString(16))+rndH(3)+'-'+rndH(12); }

var hasBigInt = typeof BigInt !== 'undefined';
var UUID_GEN = {
  1: hasBigInt ? uuidV1 : uuidV1Fallback,
  4: uuidV4,
  5: uuidV5,
  6: hasBigInt ? uuidV6 : uuidV6Fallback,
  7: uuidV7
};
var UUID_LABEL = {
  1:'v1 — Gregorian time + node',4:'v4 — Random',
  5:'v5 — Name-based SHA-1',6:'v6 — Reordered time',7:'v7 — Unix-ms time'
};
var UUID_SEGS = {
  1:['time','time','ver','clk','node'],4:['rand','rand','ver','rand','rand'],
  5:['rand','rand','ver','rand','rand'],6:['time','time','ver','clk','node'],
  7:['time','time','ver','rand','rand']
};

function colorUUID(uuid, ver){
  var parts = uuid.split('-');
  if(parts.length!==5) return esc(uuid);
  var segs = UUID_SEGS[ver]||['rand','rand','ver','rand','rand'];
  var sep  = '<span class="sep">-</span>';
  return parts.map(function(p,i){ return '<span class="seg-'+segs[i]+'">'+p+'</span>'; }).join(sep);
}

var activeVer = 7, currentUUID = '';
var uuidValEl    = $('uuidVal');
var uuidHistRow  = $('uuidHistRow');
var uuidHistVal  = $('uuidHistVal');
var uuidLabelEl  = $('uuidLabel');

function renderUUID(){
  try{
    currentUUID = UUID_GEN[activeVer]();
    uuidValEl.innerHTML = colorUUID(currentUUID, activeVer);
    uuidLabelEl.textContent = UUID_LABEL[activeVer]||'UUID Generator';
  }catch(e){
    uuidValEl.textContent = '⚠ Error: '+e.message;
    currentUUID='';
  }
}

document.querySelectorAll('.uuid-ver-btn').forEach(function(btn){
  btn.addEventListener('click', function(){
    document.querySelectorAll('.uuid-ver-btn').forEach(function(b){
      b.classList.remove('active');
      b.setAttribute('aria-pressed','false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-pressed','true');
    activeVer = +btn.dataset.ver;
    uuidHistRow.classList.remove('show');
    renderUUID();
  });
});

$('uuidCopyBtn').addEventListener('click', function(){
  if(!currentUUID) return;
  var prev = currentUUID;
  copyText(prev);
  uuidHistVal.textContent = prev;
  uuidHistRow.classList.add('show');
  flashBtn($('uuidCopyBtn'),'Copied!',1200);
  setTimeout(renderUUID, 1200);
});
uuidHistVal.addEventListener('click', function(){ copyText(uuidHistVal.textContent); });
uuidHistVal.addEventListener('keydown', function(e){ if(e.key==='Enter'||e.key===' ') copyText(uuidHistVal.textContent); });

// Static clock snapshot
(function(){
  var now=new Date(), dow=now.getDay();
  $('dtDate').textContent = pad(now.getDate())+'.'+pad(now.getMonth()+1)+'.'+now.getFullYear();
  $('dtTime').textContent = pad(now.getHours())+':'+pad(now.getMinutes())+':'+pad(now.getSeconds());
  var sec=Math.floor(now.getTime()/1000);
  var ms=pad(now.getMilliseconds(),3);
  $('dtUnix').innerHTML = sec+'<span class="dt-unix-ms">.'+ms+'</span>';
  document.querySelectorAll('#wdTrack .wd').forEach(function(el){
    el.classList.toggle('today', +el.dataset.d===dow);
  });
})();

renderUUID();

// UUID section collapse
(function(){
  var section = $('uuid-section');
  var btn     = $('uuidToggleBtn');

  function setCollapsed(on){
    if(on){
      section.classList.add('uuid-hidden');
      btn.setAttribute('aria-label','Expand UUID section');
      btn.setAttribute('aria-expanded','false');
      btn.setAttribute('title','Expand UUID section');
      btn.classList.add('is-collapsed');
    } else {
      section.classList.remove('uuid-hidden');
      btn.setAttribute('aria-label','Collapse UUID section');
      btn.setAttribute('aria-expanded','true');
      btn.setAttribute('title','Collapse UUID section');
      btn.classList.remove('is-collapsed');
    }
    try{ localStorage.setItem('uuid_col', on ? '1' : '0'); }catch(e){}
  }

  btn.addEventListener('click', function(){
    setCollapsed(!section.classList.contains('uuid-hidden'));
  });

  try{ if(localStorage.getItem('uuid_col') === '1') setCollapsed(true); }catch(e){}
})();
