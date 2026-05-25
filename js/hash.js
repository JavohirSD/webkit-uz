'use strict';

/* ══════════════════════════════════════════
   HASHING TOOLS  (libraries: forge · bcryptjs · argon2-browser)
══════════════════════════════════════════ */
(function(){
'use strict';

/* ── Utilities ─────────────────────────────── */
function toBytes(str){
  try{ return Array.from(new TextEncoder().encode(str)); }
  catch(e){
    var out=[];
    for(var i=0;i<str.length;i++){
      var c=str.charCodeAt(i);
      if(c<0x80){out.push(c);}
      else if(c<0x800){out.push(0xC0|(c>>6),0x80|(c&0x3F));}
      else{out.push(0xE0|(c>>12),0x80|((c>>6)&0x3F),0x80|(c&0x3F));}
    }
    return out;
  }
}
function bytesToHex(bytes){
  return bytes.map(function(b){return('0'+b.toString(16)).slice(-2);}).join('');
}

/* ── node-forge wrappers ─────────────────────
   Covers: MD5, SHA-1, SHA-256, SHA-384, SHA-512 */
function forgeHash(algoKey, text){
  var md = forge.md[algoKey].create();
  md.update(text, 'utf8');
  return md.digest().toHex();
}

/* ── CRC-16  (CRC-16-ARC / IBM, reflected poly 0x8005) ── */
function crc16hex(text){
  var b=toBytes(text),crc=0;
  for(var i=0;i<b.length;i++){crc^=b[i];for(var j=0;j<8;j++)crc=(crc&1)?((crc>>>1)^0xA001):(crc>>>1);}
  return bytesToHex([(crc>>>8)&0xFF,crc&0xFF]);
}

/* ── CRC-32  (ISO 3309, reflected poly 0xEDB88320) ── */
var CRC32T=(function(){
  var t=[];for(var i=0;i<256;i++){var c=i;for(var k=0;k<8;k++)c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);t[i]=c;}
  return t;
})();
function crc32hex(text){
  var b=toBytes(text),crc=0xFFFFFFFF;
  for(var i=0;i<b.length;i++)crc=(crc>>>8)^CRC32T[(crc^b[i])&0xFF];
  crc=(crc^0xFFFFFFFF)>>>0;
  return bytesToHex([(crc>>>24)&0xFF,(crc>>>16)&0xFF,(crc>>>8)&0xFF,crc&0xFF]);
}

/* ── CRC-64  (ECMA-182, reflected poly 0xC96C5795D7870F42) ── */
var CRC64T=(function(){
  var PH=0xC96C5795,PL=0xD7870F42,t=[];
  for(var i=0;i<256;i++){
    var ch=0,cl=i;
    for(var k=0;k<8;k++){var lsb=cl&1;cl=(cl>>>1)|((ch&1)<<31);ch=ch>>>1;if(lsb){ch^=PH;cl^=PL;}}
    t[i]={h:ch>>>0,l:cl>>>0};
  }return t;
})();
function crc64hex(text){
  var b=toBytes(text),hi=0xFFFFFFFF,lo=0xFFFFFFFF;
  for(var i=0;i<b.length;i++){
    var idx=(lo^b[i])&0xFF,e=CRC64T[idx];
    var nl=(lo>>>8)|(hi<<24),nh=hi>>>8;
    hi=(nh^e.h)>>>0;lo=(nl^e.l)>>>0;
  }
  hi=(hi^0xFFFFFFFF)>>>0;lo=(lo^0xFFFFFFFF)>>>0;
  return bytesToHex([(hi>>>24)&0xFF,(hi>>>16)&0xFF,(hi>>>8)&0xFF,hi&0xFF,(lo>>>24)&0xFF,(lo>>>16)&0xFF,(lo>>>8)&0xFF,lo&0xFF]);
}

/* ── BLAKE2b-256  (pure-JS, RFC 7693) ── */
var B2B_IV=[[0x6a09e667,0xf3bcc908],[0xbb67ae85,0x84caa73b],[0x3c6ef372,0xfe94f82b],[0xa54ff53a,0x5f1d36f1],
            [0x510e527f,0xade682d1],[0x9b05688c,0x2b3e6c1f],[0x1f83d9ab,0xfb41bd6b],[0x5be0cd19,0x137e2179]];
var B2B_SIGMA=[[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],[14,10,4,8,9,15,13,6,1,12,0,2,11,7,5,3],
  [11,8,12,0,5,2,15,13,10,14,3,6,7,1,9,4],[7,9,3,1,13,12,11,14,2,6,5,10,4,0,15,8],
  [9,0,5,7,2,4,10,15,14,1,11,12,6,8,3,13],[2,12,6,10,0,11,8,3,4,13,7,5,15,14,1,9],
  [12,5,1,15,14,13,4,10,0,7,6,3,9,2,8,11],[13,11,7,14,12,1,3,9,5,0,15,4,8,6,2,10],
  [6,15,14,9,11,3,0,8,12,2,13,7,1,4,10,5],[10,2,8,4,7,6,1,5,15,11,9,14,3,12,13,0],
  [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],[14,10,4,8,9,15,13,6,1,12,0,2,11,7,5,3]];
function blake2b256(bytes){
  var outLen=32,h=B2B_IV.map(function(v){return[v[0],v[1]];});
  h[0][0]^=0x01010000^outLen;
  var msg=bytes.slice(),dLen=msg.length;
  if(msg.length===0)msg.push(0);
  while(msg.length%128!==0)msg.push(0);
  var blocks=msg.length/128;
  function add64(ah,al,bh,bl){var l=(al+bl)>>>0;return{h:(ah+bh+(l<(al>>>0)?1:0))>>>0,l:l};}
  function xor64(a,b){return{h:(a.h^b.h)>>>0,l:(a.l^b.l)>>>0};}
  function rot64(a,n){
    if(n===32)return{h:a.l,l:a.h};
    if(n<32)return{h:(a.h>>>n)|(a.l<<(32-n)),l:(a.l>>>n)|(a.h<<(32-n))};
    n-=32;return{h:(a.l>>>n)|(a.h<<(32-n)),l:(a.h>>>n)|(a.l<<(32-n))};
  }
  for(var blk=0;blk<blocks;blk++){
    var off=blk*128,isLast=(blk===blocks-1);
    var cntLo=(isLast?dLen:((blk+1)*128))>>>0;
    var m=[];
    for(var i=0;i<16;i++){
      var o=off+i*8;
      m[i]={h:((msg[o+4]||0)|(msg[o+5]||0)<<8|(msg[o+6]||0)<<16|(msg[o+7]||0)<<24)>>>0,
            l:((msg[o]||0)|(msg[o+1]||0)<<8|(msg[o+2]||0)<<16|(msg[o+3]||0)<<24)>>>0};
    }
    var v=h.map(function(x){return{h:x[0],l:x[1]};}).concat(B2B_IV.map(function(x){return{h:x[0],l:x[1]};}));
    v[12]=xor64(v[12],{h:0,l:cntLo});
    if(isLast){v[14]=xor64(v[14],{h:0xFFFFFFFF,l:0xFFFFFFFF});}
    function G(a,b,c,d,xi,yi){
      v[a]=add64(v[a].h,v[a].l,v[b].h,v[b].l);v[a]=add64(v[a].h,v[a].l,m[xi].h,m[xi].l);
      v[d]=xor64(v[d],v[a]);v[d]=rot64(v[d],32);
      v[c]=add64(v[c].h,v[c].l,v[d].h,v[d].l);
      v[b]=xor64(v[b],v[c]);v[b]=rot64(v[b],24);
      v[a]=add64(v[a].h,v[a].l,v[b].h,v[b].l);v[a]=add64(v[a].h,v[a].l,m[yi].h,m[yi].l);
      v[d]=xor64(v[d],v[a]);v[d]=rot64(v[d],16);
      v[c]=add64(v[c].h,v[c].l,v[d].h,v[d].l);
      v[b]=xor64(v[b],v[c]);v[b]=rot64(v[b],63);
    }
    for(var rnd=0;rnd<12;rnd++){
      var s=B2B_SIGMA[rnd];
      G(0,4,8,12,s[0],s[1]);G(1,5,9,13,s[2],s[3]);G(2,6,10,14,s[4],s[5]);G(3,7,11,15,s[6],s[7]);
      G(0,5,10,15,s[8],s[9]);G(1,6,11,12,s[10],s[11]);G(2,7,8,13,s[12],s[13]);G(3,4,9,14,s[14],s[15]);
    }
    for(var i=0;i<8;i++){h[i][0]=(h[i][0]^v[i].h^v[i+8].h)>>>0;h[i][1]=(h[i][1]^v[i].l^v[i+8].l)>>>0;}
  }
  var out=[];
  for(var i=0;i<outLen/8;i++)out.push(h[i][1]&0xFF,(h[i][1]>>>8)&0xFF,(h[i][1]>>>16)&0xFF,(h[i][1]>>>24)&0xFF,
    h[i][0]&0xFF,(h[i][0]>>>8)&0xFF,(h[i][0]>>>16)&0xFF,(h[i][0]>>>24)&0xFF);
  return out;
}

/* ── BLAKE3-256  (pure-JS, single-chunk, output 32 bytes) ── */
var B3_IV=[0x6A09E667,0xBB67AE85,0x3C6EF372,0xA54FF53A,0x510E527F,0x9B05688C,0x1F83D9AB,0x5BE0CD19];
var B3_PERM=[2,6,3,10,7,0,4,13,1,11,12,5,9,14,15,8];
function blake3(bytes){
  function rotr(x,n){return(x>>>n)|(x<<(32-n));}
  function compress(cv,blk,ctr,blen,flags){
    var m=blk.slice();
    var v=[cv[0],cv[1],cv[2],cv[3],cv[4],cv[5],cv[6],cv[7],
           B3_IV[0],B3_IV[1],B3_IV[2],B3_IV[3],ctr&0xFFFFFFFF,0,blen>>>0,flags>>>0];
    function G(a,b,c,d,mx,my){
      v[a]=(v[a]+v[b]+mx)>>>0;v[d]=rotr(v[d]^v[a],16);v[c]=(v[c]+v[d])>>>0;v[b]=rotr(v[b]^v[c],12);
      v[a]=(v[a]+v[b]+my)>>>0;v[d]=rotr(v[d]^v[a],8); v[c]=(v[c]+v[d])>>>0;v[b]=rotr(v[b]^v[c],7);
    }
    for(var r=0;r<7;r++){
      G(0,4,8,12,m[0],m[1]);G(1,5,9,13,m[2],m[3]);G(2,6,10,14,m[4],m[5]);G(3,7,11,15,m[6],m[7]);
      G(0,5,10,15,m[8],m[9]);G(1,6,11,12,m[10],m[11]);G(2,7,8,13,m[12],m[13]);G(3,4,9,14,m[14],m[15]);
      var nm=new Array(16);for(var i=0;i<16;i++)nm[i]=m[B3_PERM[i]];m=nm;
    }
    var out=new Array(8);for(var i=0;i<8;i++)out[i]=(v[i]^v[i+8])>>>0;
    return out;
  }
  var msg=bytes.slice(),origLen=msg.length;
  while(msg.length%64!==0)msg.push(0);
  if(msg.length===0){for(var i=0;i<64;i++)msg.push(0);}
  var blocks=msg.length/64,cv=B3_IV.slice();
  for(var bi=0;bi<blocks;bi++){
    var isFirst=(bi===0),isLast=(bi===blocks-1);
    var flags=(isFirst?1:0)|(isLast?10:0);
    var blen=isLast?((origLen%64)||64):64;
    var blk=new Array(16);
    for(var i=0;i<16;i++)blk[i]=(msg[bi*64+i*4]|msg[bi*64+i*4+1]<<8|msg[bi*64+i*4+2]<<16|msg[bi*64+i*4+3]<<24)>>>0;
    cv=compress(cv,blk,0,blen,flags);
  }
  var out=[];for(var i=0;i<8;i++)out.push(cv[i]&0xFF,(cv[i]>>>8)&0xFF,(cv[i]>>>16)&0xFF,(cv[i]>>>24)&0xFF);
  return out;
}

/* ── CRYPTO_ALGOS table ── */
var CRYPTO_ALGOS=[
  {id:'md5',    name:'MD5',     bits:128, fn:function(t){return forgeHash('md5',t);}},
  {id:'sha1',   name:'SHA-1',   bits:160, fn:function(t){return forgeHash('sha1',t);}},
  {id:'sha256', name:'SHA-256', bits:256, fn:function(t){return forgeHash('sha256',t);}},
  {id:'sha384', name:'SHA-384', bits:384, fn:function(t){return forgeHash('sha384',t);}},
  {id:'sha512', name:'SHA-512', bits:512, fn:function(t){return forgeHash('sha512',t);}},
  {id:'crc16',  name:'CRC-16',  bits:16,  fn:crc16hex},
  {id:'crc32',  name:'CRC-32',  bits:32,  fn:crc32hex},
  {id:'crc64',  name:'CRC-64',  bits:64,  fn:crc64hex},
  {id:'blake2b',name:'BLAKE2b', bits:256, fn:function(t){return bytesToHex(blake2b256(toBytes(t)));}},
  {id:'blake3', name:'BLAKE3',  bits:256, fn:function(t){return bytesToHex(blake3(toBytes(t)));}}
];

/* ── DOM refs ── */
var hashCryptoInput=document.getElementById('hashCryptoInput');
var hashCryptoResults=document.getElementById('hashCryptoResults');
var hashCryptoCount=document.getElementById('hashCryptoCount');
var hashPwInput=document.getElementById('hashPwInput');
var hashPwCount=document.getElementById('hashPwCount');
var hashPwResults=document.getElementById('hashPwResults');
var hashPwWarn=document.getElementById('hashPwWarn');

/* ── Build crypto result cards ── */
CRYPTO_ALGOS.forEach(function(algo){
  var card=document.createElement('div');
  card.className='hash-card';card.id='hcard-'+algo.id;
  card.innerHTML=
    '<div class="hash-card-info">'+
      '<span class="hash-algo-name">'+algo.name+'</span>'+
      '<span class="hash-algo-len" id="hlen-'+algo.id+'">'+algo.bits+' bit</span>'+
    '</div>'+
    '<input class="hash-val-input" id="hval-'+algo.id+'" readonly placeholder="—" aria-label="'+algo.name+' hash value">'+
    '<button class="hash-copy-btn" id="hcopy-'+algo.id+'" aria-label="Copy '+algo.name+'" title="Copy">'+
      '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'+
    '</button>';
  hashCryptoResults.appendChild(card);
  document.getElementById('hcopy-'+algo.id).addEventListener('click',function(){
    var val=document.getElementById('hval-'+algo.id).value;
    if(!val||val==='—')return;
    copyText(val);
    var btn=this,orig=btn.innerHTML;
    btn.innerHTML='<svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    btn.classList.add('ok');setTimeout(function(){btn.innerHTML=orig;btn.classList.remove('ok');},1500);
  });
});

/* ── Crypto hash computation ── */
function runCryptoHash(text){
  var bytes=toBytes(text);
  hashCryptoCount.textContent=text.length+' chars / '+bytes.length+' bytes';
  CRYPTO_ALGOS.forEach(function(algo){
    var valEl=document.getElementById('hval-'+algo.id);
    var lenEl=document.getElementById('hlen-'+algo.id);
    if(!text){valEl.value='';lenEl.textContent=algo.bits+' bit';return;}
    try{
      var result=algo.fn(text);
      valEl.value=result;
      lenEl.textContent=algo.bits+' bit · '+result.length+' hex chars';
    }catch(e){valEl.value='error';}
  });
}

var _cryptoTimer=null;
hashCryptoInput.addEventListener('input',function(){
  clearTimeout(_cryptoTimer);_cryptoTimer=setTimeout(function(){runCryptoHash(hashCryptoInput.value);},60);
});

/* ── Paste / Clear helpers ── */
function wirePaste(btnId, targetEl, countEl, afterPaste){
  document.getElementById(btnId).addEventListener('click',function(){
    var btn=this;
    if(navigator.clipboard&&navigator.clipboard.readText){
      navigator.clipboard.readText().then(function(text){
        targetEl.value=text;if(afterPaste)afterPaste(text);
        var orig=btn.textContent;btn.textContent='✓ Pasted';btn.classList.add('ok');
        setTimeout(function(){btn.textContent=orig;btn.classList.remove('ok');},1500);
      }).catch(function(){targetEl.focus();});
    }else{targetEl.focus();}
  });
}
wirePaste('hashCryptoPaste',hashCryptoInput,hashCryptoCount,function(t){runCryptoHash(t);});
document.getElementById('hashCryptoClear').addEventListener('click',function(){hashCryptoInput.value='';runCryptoHash('');});
wirePaste('hashPwPaste',hashPwInput,hashPwCount,function(t){hashPwCount.textContent=t.length+' chars';});
document.getElementById('hashPwClear').addEventListener('click',function(){hashPwInput.value='';hashPwCount.textContent='0 chars';});
hashPwInput.addEventListener('input',function(){hashPwCount.textContent=hashPwInput.value.length+' chars';});

/* ── Password algo tabs ── */
var curPwAlgo='bcrypt';
document.querySelectorAll('.hash-pw-algo-btn').forEach(function(btn){
  btn.addEventListener('click',function(){
    document.querySelectorAll('.hash-pw-algo-btn').forEach(function(b){b.classList.remove('active');});
    btn.classList.add('active');curPwAlgo=btn.dataset.pwalgo;
    ['bcrypt','argon2'].forEach(function(a){
      document.getElementById('pw-params-'+a).style.display=(a===curPwAlgo?'':'none');
    });
  });
});

/* ── Compute button helper ── */
var COMPUTE_ICON='<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
document.getElementById('hashPwCompute').addEventListener('click',function(){
  var password=hashPwInput.value.trim();
  if(!password){hashPwWarn.textContent='Please enter a password or input text.';hashPwWarn.style.display='';return;}
  hashPwWarn.style.display='none';
  var btn=this;
  function setBusy(){btn.disabled=true;btn.innerHTML='<span class="hash-computing"></span> Computing…';}
  function setReady(){btn.disabled=false;btn.innerHTML=COMPUTE_ICON+' Compute Hash';}
  function showErr(msg){hashPwWarn.textContent=msg;hashPwWarn.style.display='';setReady();}
  setBusy();

  if(curPwAlgo==='bcrypt'){
    var cost=Math.min(CFG.MAX_BCRYPT_COST,Math.max(4,parseInt(document.getElementById('bcrypt-cost').value)||10));
    setTimeout(function(){
      try{
        /* bcryptjs: window.dcodeIO.bcrypt or window.bcrypt */
        var lib=(window.dcodeIO&&window.dcodeIO.bcrypt)||window.bcrypt;
        if(!lib){showErr('bcryptjs library failed to load. Check network.');return;}
        var salt=lib.genSaltSync(cost);
        var hash=lib.hashSync(password,salt);
        addPwResult('bcrypt','cost='+cost+' (new random salt each run)',hash);
        setReady();
      }catch(e){showErr('bcrypt error: '+e.message);}
    },30);

  }else if(curPwAlgo==='argon2'){
    var variant=document.getElementById('argon2-variant').value||'id';
    var t=parseInt(document.getElementById('argon2-t').value)||3;
    var m=parseInt(document.getElementById('argon2-m').value)||4096;
    var pp=parseInt(document.getElementById('argon2-p').value)||1;
    var len=parseInt(document.getElementById('argon2-len').value)||32;
    var s2=document.getElementById('argon2-salt').value||'somesalt';
    var meta2='t='+t+', mem='+m+'KB, p='+pp+', len='+len+', salt="'+s2+'"';
    if(typeof argon2==='undefined'||!argon2.hash){showErr('argon2-browser library failed to load.');return;}
    var typeMap={d:0,i:1,id:2};
    argon2.hash({pass:password,salt:s2,time:t,mem:m,parallelism:pp,hashLen:len,type:typeMap[variant]||2})
      .then(function(h){addPwResult('Argon2'+variant,meta2,h.encoded);setReady();})
      .catch(function(e){showErr('Argon2 error: '+(e.message||JSON.stringify(e)));});
  }
});

/* ── Add password result card ── */
function addPwResult(algo,meta,value){
  var empty=hashPwResults.querySelector('.hash-pw-empty');if(empty)empty.remove();
  var card=document.createElement('div');card.className='hash-pw-result-card';
  var ts=new Date().toLocaleTimeString();
  card.innerHTML=
    '<div class="hash-pw-result-header">'+
      '<span class="hash-pw-result-algo">'+algo+'</span>'+
      '<span class="hash-pw-result-meta">'+esc(meta)+' &nbsp;·&nbsp; '+ts+'</span>'+
    '</div>'+
    '<div class="hash-pw-result-val">'+esc(value)+'</div>'+
    '<div class="hash-pw-result-actions">'+
      '<button class="hash-paste-btn" style="gap:5px;">'+
        '<svg viewBox="0 0 24 24" width="11" height="11" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy'+
      '</button>'+
      '<button class="hash-paste-btn" style="gap:5px;color:var(--err)">'+
        '<svg viewBox="0 0 24 24" width="11" height="11" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg> Remove'+
      '</button>'+
    '</div>';
  hashPwResults.insertBefore(card,hashPwResults.firstChild);
  var btns=card.querySelectorAll('.hash-paste-btn');
  btns[0].addEventListener('click',function(){
    copyText(value);var orig=btns[0].textContent;btns[0].textContent='✓ Copied!';btns[0].classList.add('ok');
    setTimeout(function(){btns[0].textContent=orig;btns[0].classList.remove('ok');},1500);
  });
  btns[1].addEventListener('click',function(){
    card.remove();
    if(!hashPwResults.querySelector('.hash-pw-result-card'))
      hashPwResults.innerHTML='<div class="hash-pw-empty">Configure parameters above and click <strong>Compute Hash</strong></div>';
  });
}

/* ── Tab switching ── */
document.querySelectorAll('.hash-tab').forEach(function(tab){
  tab.addEventListener('click',function(){
    document.querySelectorAll('.hash-tab').forEach(function(t){t.classList.remove('active');t.setAttribute('aria-selected','false');});
    document.querySelectorAll('.hash-panel').forEach(function(p){p.classList.remove('active');});
    tab.classList.add('active');tab.setAttribute('aria-selected','true');
    var panel=document.getElementById(tab.getAttribute('aria-controls'));
    if(panel)panel.classList.add('active');
  });
});

/* ── Open / close ── */
function openHash(){openOverlay('hashOverlay','hashClose');runCryptoHash(hashCryptoInput.value);}
function closeHash(){closeOverlay('hashOverlay');}
document.getElementById('hashBtn').addEventListener('click',openHash);
document.getElementById('hashClose').addEventListener('click',closeHash);
document.getElementById('hashOverlay').addEventListener('click',function(e){if(e.target===this)closeHash();});

/* Initialise */
runCryptoHash('');
hashPwCount.textContent='0 chars';
})();
