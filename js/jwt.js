'use strict';

/* ══════════════════════════════════════════
   JWT ENCODER / DECODER
══════════════════════════════════════════ */
(function(){
  /* ── Pure-JS HMAC-SHA256 (byte-array only — no string round-trips) ── */

  /* UTF-8 encode a JS string → Uint8Array-like plain array */
  function strToBytes(s){
    var out=[];
    for(var i=0;i<s.length;i++){
      var c=s.charCodeAt(i);
      if(c<0x80){ out.push(c); }
      else if(c<0x800){ out.push(0xC0|(c>>6), 0x80|(c&0x3F)); }
      else if(c>=0xD800&&c<=0xDBFF&&i+1<s.length){
        var lo=s.charCodeAt(++i);
        var cp=0x10000+((c-0xD800)<<10)+(lo-0xDC00);
        out.push(0xF0|(cp>>18),0x80|((cp>>12)&0x3F),0x80|((cp>>6)&0x3F),0x80|(cp&0x3F));
      } else { out.push(0xE0|(c>>12),0x80|((c>>6)&0x3F),0x80|(c&0x3F)); }
    }
    return out;
  }

  function bytesToB64url(bytes){
    var b=''; for(var i=0;i<bytes.length;i++) b+=String.fromCharCode(bytes[i]);
    return btoa(b).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  function b64urlToBytes(s){
    s=s.replace(/-/g,'+').replace(/_/g,'/');
    while(s.length%4) s+='=';
    var bin=atob(s),out=[];
    for(var i=0;i<bin.length;i++) out.push(bin.charCodeAt(i));
    return out;
  }
  function safeB64urlDecode(s){
    try{ return b64urlToBytes(s); }catch(e){ return null; }
  }
  function bytesToUtf8Str(bytes){
    /* Used only for JSON.parse after base64url-decoding header/payload */
    try{ return decodeURIComponent(bytes.map(function(b){ return '%'+('00'+b.toString(16)).slice(-2); }).join('')); }
    catch(e){ var s=''; for(var i=0;i<bytes.length;i++) s+=String.fromCharCode(bytes[i]); return s; }
  }

  /* SHA-256: accepts a plain byte array, returns a plain byte array.
     Never converts to/from string internally — that was the source of corruption. */
  var SHA256_K=[
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ];
  function rotr32(x,n){return(x>>>n)|(x<<(32-n));}

  function sha256(bytes){
    /* Work on a copy so callers' arrays are not mutated */
    var msg=bytes.slice();
    var bitLen=msg.length*8;
    msg.push(0x80);
    while((msg.length%64)!==56) msg.push(0);
    /* Append 64-bit big-endian bit length */
    for(var i=7;i>=0;i--) msg.push((bitLen / Math.pow(2,i*8)) & 0xFF);

    var h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a,
        h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;

    for(var bi=0;bi<msg.length;bi+=64){
      var w=new Array(64);
      for(var j=0;j<16;j++)
        w[j]=(msg[bi+j*4]<<24)|(msg[bi+j*4+1]<<16)|(msg[bi+j*4+2]<<8)|msg[bi+j*4+3];
      for(var t=16;t<64;t++){
        var s0=rotr32(w[t-15],7)^rotr32(w[t-15],18)^(w[t-15]>>>3);
        var s1=rotr32(w[t-2],17)^rotr32(w[t-2],19)^(w[t-2]>>>10);
        w[t]=(w[t-16]+s0+w[t-7]+s1)>>>0;
      }
      var a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,hh=h7;
      for(var r=0;r<64;r++){
        var S1=rotr32(e,6)^rotr32(e,11)^rotr32(e,25);
        var ch=(e&f)^(~e&g);
        var tmp1=(hh+S1+ch+SHA256_K[r]+w[r])>>>0;
        var S0=rotr32(a,2)^rotr32(a,13)^rotr32(a,22);
        var maj=(a&b)^(a&c)^(b&c);
        var tmp2=(S0+maj)>>>0;
        hh=g; g=f; f=e; e=(d+tmp1)>>>0; d=c; c=b; b=a; a=(tmp1+tmp2)>>>0;
      }
      h0=(h0+a)>>>0; h1=(h1+b)>>>0; h2=(h2+c)>>>0; h3=(h3+d)>>>0;
      h4=(h4+e)>>>0; h5=(h5+f)>>>0; h6=(h6+g)>>>0; h7=(h7+hh)>>>0;
    }
    var out=[];
    [h0,h1,h2,h3,h4,h5,h6,h7].forEach(function(hv){
      for(var s=24;s>=0;s-=8) out.push((hv>>>s)&0xFF);
    });
    return out;
  }

  /* HMAC-SHA256: key and message are plain byte arrays throughout */
  function hmacSha256(keyBytes,msgBytes){
    /* If key longer than block size, hash it first */
    var k = keyBytes.length > 64 ? sha256(keyBytes) : keyBytes.slice();
    /* Pad key to 64 bytes */
    while(k.length<64) k.push(0);
    var ipad=[], opad=[];
    for(var i=0;i<64;i++){ ipad.push(k[i]^0x36); opad.push(k[i]^0x5C); }
    /* inner = SHA256(ipad ∥ message)   — pure bytes, no string conversion */
    var inner = sha256(ipad.concat(msgBytes));
    /* outer = SHA256(opad ∥ inner)     — pure bytes */
    return sha256(opad.concat(inner));
  }

  /* ── JSON syntax highlighter ── */
  function highlightJSON(str){
    if(!str||!str.trim()) return '';
    try{ return renderVal(JSON.parse(str),0); }
    catch(e){ return '<span style="color:var(--err)">'+esc(str)+'</span>'; }
  }
  function renderVal(v,depth){
    if(v===null) return '<span class="t-null">null</span>';
    if(typeof v==='boolean') return '<span class="t-bool">'+v+'</span>';
    if(typeof v==='number'){
      var s=v.toString();
      return s.indexOf('.')!==-1?'<span class="t-flt">'+s+'</span>':'<span class="t-int">'+s+'</span>';
    }
    if(typeof v==='string') return '<span class="t-str">"'+esc(v)+'"</span>';
    if(Array.isArray(v)){
      if(!v.length) return '<span class="t-punc">[]</span>';
      var ind='  '.repeat(depth+1),cind='  '.repeat(depth);
      return '<span class="t-punc">[</span>\n'+v.map(function(item){return ind+renderVal(item,depth+1);}).join('<span class="t-punc">,</span>\n')+'\n'+cind+'<span class="t-punc">]</span>';
    }
    if(typeof v==='object'){
      var keys=Object.keys(v);
      if(!keys.length) return '<span class="t-punc">{}</span>';
      var ind2='  '.repeat(depth+1),cind2='  '.repeat(depth);
      return '<span class="t-punc">{</span>\n'+keys.map(function(k){
        return ind2+'<span class="t-key">"'+esc(k)+'"</span><span class="t-punc">: </span>'+renderVal(v[k],depth+1);
      }).join('<span class="t-punc">,</span>\n')+'\n'+cind2+'<span class="t-punc">}</span>';
    }
    return esc(String(v));
  }

  /* ── JWT core ── */
  function jsonB64url(obj){
    /* JSON.stringify → UTF-8 bytes → base64url */
    return bytesToB64url(strToBytes(JSON.stringify(obj)));
  }
  function b64urlToJson(s){
    var bytes=safeB64urlDecode(s);
    if(!bytes) return null;
    try{ return JSON.parse(bytesToUtf8Str(bytes)); }catch(e){ return null; }
  }
  function buildToken(hObj,pObj,secret,b64Secret){
    var h=jsonB64url(hObj), p=jsonB64url(pObj);
    /* The signing input is the ASCII string "header.payload" — strToBytes is correct here */
    var msgBytes=strToBytes(h+'.'+p);
    var keyBytes=b64Secret?(safeB64urlDecode(secret)||strToBytes(secret)):strToBytes(secret);
    var sig=bytesToB64url(hmacSha256(keyBytes,msgBytes));
    return h+'.'+p+'.'+sig;
  }

  /* ── Defaults ── */
  var DEFAULT_HEADER={alg:'HS256',typ:'JWT'};
  var DEFAULT_PAYLOAD={sub:'1234567890',name:'John Doe',iat:1516239022};
  var DEFAULT_SECRET='your-256-bit-secret';

  /* ── DOM refs ── */
  var headerTa=$('jwtHeaderTa'),   headerCode=$('jwtHeaderCode'),   headerHl=$('jwtHeaderHl');
  var payloadTa=$('jwtPayloadTa'), payloadCode=$('jwtPayloadCode'), payloadHl=$('jwtPayloadHl');
  var headerWrap=$('jwtHeaderWrap'), payloadWrap=$('jwtPayloadWrap');
  var headerValid=$('jwtHeaderValid'), payloadValid=$('jwtPayloadValid');
  var secretInput=$('jwtSecret'), b64Toggle=$('jwtSecretB64');
  var tokenDisplay=$('jwtTokenDisplay'), encodeValid=$('jwtEncodeValid');
  var decodeInput=$('jwtDecodeInput'), decodeHl=$('jwtDecodeHl');
  var decHeaderOut=$('jwtDecHeaderOut'), decPayloadOut=$('jwtDecPayloadOut');
  var decSigOut=$('jwtDecSigOut'), decodeValid=$('jwtDecodeValid');

  /* ══ MIRROR EDITOR helpers ══
     The textarea is transparent (only caret shows). The <pre> overlay renders
     coloured HTML. We sync scroll so both layers stay aligned. */
  function syncScroll(ta, hl){
    hl.scrollTop  = ta.scrollTop;
    hl.scrollLeft = ta.scrollLeft;
  }
  function syncHeight(ta, hl){
    /* Make the pre the same height as the scrollable area so it never clips */
    hl.style.minHeight = ta.scrollHeight + 'px';
  }
  function setMirrorContent(ta, code, hl, obj){
    var text=JSON.stringify(obj,null,2);
    ta.value=text;
    code.innerHTML=highlightJSON(text)+'<br>';
    syncHeight(ta,hl);
  }

  /* Refresh the highlight overlay from the textarea's current value */
  function refreshMirror(ta, code, hl){
    /* append '\n' so the last empty line gets correct height */
    code.innerHTML=highlightJSON(ta.value)+'<br>';
    syncHeight(ta,hl);
  }

  /* Wire a mirror pair: textarea → highlight + scroll sync */
  function wireMirror(ta, code, hl, wrap, badge, onChange){
    ta.addEventListener('input',function(){
      refreshMirror(ta,code,hl);
      validateMirror(ta,wrap,badge);
      if(onChange) onChange();
    });
    ta.addEventListener('scroll',function(){ syncScroll(ta,hl); });
    ta.addEventListener('keydown',function(e){
      /* Tab → insert 2 spaces instead of losing focus */
      if(e.key==='Tab'){
        e.preventDefault();
        var s=ta.selectionStart,end=ta.selectionEnd;
        ta.value=ta.value.substring(0,s)+'  '+ta.value.substring(end);
        ta.selectionStart=ta.selectionEnd=s+2;
        refreshMirror(ta,code,hl);
        validateMirror(ta,wrap,badge);
        if(onChange) onChange();
      }
    });
  }

  function validateMirror(ta, wrap, badge){
    var txt=(ta.value||'').trim();
    if(!txt){ wrap.classList.remove('ok','err'); badge.textContent=''; badge.className='jwt-validator'; return null; }
    try{
      var obj=JSON.parse(txt);
      wrap.classList.add('ok'); wrap.classList.remove('err');
      badge.textContent='✓ Valid JSON'; badge.className='jwt-validator ok';
      return obj;
    }catch(e){
      wrap.classList.add('err'); wrap.classList.remove('ok');
      badge.textContent='✗ Invalid JSON'; badge.className='jwt-validator err';
      return null;
    }
  }

  /* ── Render highlighted token parts (encode output) ── */
  function renderTokenDisplay(token){
    if(!token){ tokenDisplay.innerHTML='<span class="jwt-token-placeholder">Token will appear here…</span>'; return; }
    var p=token.split('.');
    if(p.length!==3){ tokenDisplay.innerHTML='<span style="color:var(--txt2);font-size:.73rem">'+esc(token)+'</span>'; return; }
    tokenDisplay.innerHTML=
      '<span class="jwt-part-header">'+esc(p[0])+'</span>'+
      '<span class="jwt-part-dot">.</span>'+
      '<span class="jwt-part-payload">'+esc(p[1])+'</span>'+
      '<span class="jwt-part-dot">.</span>'+
      '<span class="jwt-part-sig">'+esc(p[2])+'</span>';
  }

  /* ── Render coloured token inside the decode input overlay ── */
  function renderDecodeInputHl(raw){
    if(!raw||!raw.trim()){
      decodeHl.innerHTML='<span class="jwt-token-hl-placeholder">Paste a JWT token here…</span>';
      return;
    }
    var p=raw.split('.');
    if(p.length!==3){
      /* Could be partial or wrong — render whatever we have */
      var html='';
      p.forEach(function(seg,i){
        if(i>0) html+='<span class="jwt-part-dot">.</span>';
        var cls=i===0?'jwt-part-header':i===1?'jwt-part-payload':'jwt-part-sig';
        html+='<span class="'+cls+'">'+esc(seg)+'</span>';
      });
      decodeHl.innerHTML=html;
      return;
    }
    decodeHl.innerHTML=
      '<span class="jwt-part-header">'+esc(p[0])+'</span>'+
      '<span class="jwt-part-dot">.</span>'+
      '<span class="jwt-part-payload">'+esc(p[1])+'</span>'+
      '<span class="jwt-part-dot">.</span>'+
      '<span class="jwt-part-sig">'+esc(p[2])+'</span>';
  }

  var _currentToken='';

  /* ── Encode update ── */
  function updateEncode(){
    var hObj=validateMirror(headerTa,headerWrap,headerValid);
    var pObj=validateMirror(payloadTa,payloadWrap,payloadValid);
    if(!hObj||!pObj){
      encodeValid.textContent=''; renderTokenDisplay(''); _currentToken=''; return;
    }
    try{
      var token=buildToken(hObj,pObj,secretInput.value||'',b64Toggle.checked);
      _currentToken=token; renderTokenDisplay(token);
      encodeValid.textContent='✓ Valid'; encodeValid.className='jwt-token-valid ok';
    }catch(e){
      _currentToken=''; renderTokenDisplay('');
      encodeValid.textContent='✗ Error'; encodeValid.className='jwt-token-valid err';
    }
  }

  /* ── Initialise mirror editors ── */
  setMirrorContent(headerTa,  headerCode,  headerHl,  DEFAULT_HEADER);
  setMirrorContent(payloadTa, payloadCode, payloadHl, DEFAULT_PAYLOAD);
  secretInput.value=DEFAULT_SECRET;
  validateMirror(headerTa,  headerWrap,  headerValid);
  validateMirror(payloadTa, payloadWrap, payloadValid);

  wireMirror(headerTa,  headerCode,  headerHl,  headerWrap,  headerValid,  updateEncode);
  wireMirror(payloadTa, payloadCode, payloadHl, payloadWrap, payloadValid, updateEncode);
  secretInput.addEventListener('input', updateEncode);
  b64Toggle.addEventListener('change', updateEncode);

  /* ── Decode input overlay ── */
  decodeInput.addEventListener('input', function(){
    renderDecodeInputHl(decodeInput.value);
    /* sync overlay height */
    decodeHl.style.minHeight = decodeInput.scrollHeight + 'px';
    updateDecode();
  });
  decodeInput.addEventListener('scroll', function(){
    decodeHl.scrollTop  = decodeInput.scrollTop;
    decodeHl.scrollLeft = decodeInput.scrollLeft;
  });

  /* ── Decode update ── */
  function updateDecode(){
    var raw=(decodeInput.value||'').trim();
    if(!raw){
      decHeaderOut.innerHTML='<span class="jwt-decoded-placeholder">Header will appear here…</span>';
      decPayloadOut.innerHTML='<span class="jwt-decoded-placeholder">Payload will appear here…</span>';
      decSigOut.textContent='';
      decodeValid.textContent=''; decodeValid.className='jwt-token-valid';
      return;
    }
    var parts=raw.split('.');
    if(parts.length!==3){
      decHeaderOut.innerHTML='<span style="color:var(--err);font-size:.72rem">Not a valid JWT — expected 3 dot-separated parts</span>';
      decPayloadOut.innerHTML=''; decSigOut.textContent='';
      decodeValid.textContent='✗ Invalid JWT'; decodeValid.className='jwt-token-valid err';
      return;
    }
    var hObj=b64urlToJson(parts[0]), pObj=b64urlToJson(parts[1]);
    decHeaderOut.innerHTML = hObj
      ? highlightJSON(JSON.stringify(hObj,null,2))
      : '<span style="color:var(--err)">Could not decode header</span>';
    decPayloadOut.innerHTML = pObj
      ? highlightJSON(JSON.stringify(pObj,null,2))
      : '<span style="color:var(--err)">Could not decode payload</span>';
    decSigOut.textContent=parts[2];
    if(hObj&&pObj){ decodeValid.textContent='✓ Decoded'; decodeValid.className='jwt-token-valid ok'; }
    else { decodeValid.textContent='✗ Partial error'; decodeValid.className='jwt-token-valid err'; }
  }

  /* ── Copy helpers ── */
  function jwtFlashCopy(btn,text){
    copyText(text);
    var orig=btn.innerHTML;
    btn.innerHTML='<svg viewBox="0 0 24 24" width="11" height="11" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    btn.classList.add('ok');
    setTimeout(function(){ btn.innerHTML=orig; btn.classList.remove('ok'); },1500);
  }
  $('jwtCopyHeader').addEventListener('click',function(){ jwtFlashCopy(this,headerTa.value); });
  $('jwtCopyPayload').addEventListener('click',function(){ jwtFlashCopy(this,payloadTa.value); });
  $('jwtCopyToken').addEventListener('click',function(){ if(_currentToken) jwtFlashCopy(this,_currentToken); });
  $('jwtCopyDecHeader').addEventListener('click',function(){
    var p=(decodeInput.value||'').trim().split('.');
    var obj=p.length>=1?b64urlToJson(p[0]):null;
    if(obj) jwtFlashCopy(this,JSON.stringify(obj,null,2));
  });
  $('jwtCopyDecPayload').addEventListener('click',function(){
    var p=(decodeInput.value||'').trim().split('.');
    var obj=p.length>=2?b64urlToJson(p[1]):null;
    if(obj) jwtFlashCopy(this,JSON.stringify(obj,null,2));
  });
  $('jwtClearDecode').addEventListener('click',function(){
    decodeInput.value='';
    renderDecodeInputHl('');
    updateDecode();
  });

  /* ── Mode toggle ── */
  var encPanel=$('jwtEncodePanel'),decPanel=$('jwtDecodePanel');
  var encBtn=$('jwtEncodeBtn'),decBtn=$('jwtDecodeBtn');
  encBtn.addEventListener('click',function(){
    encPanel.style.display=''; decPanel.style.display='none';
    encBtn.classList.add('active'); encBtn.setAttribute('aria-pressed','true');
    decBtn.classList.remove('active'); decBtn.setAttribute('aria-pressed','false');
  });
  decBtn.addEventListener('click',function(){
    decPanel.style.display=''; encPanel.style.display='none';
    decBtn.classList.add('active'); decBtn.setAttribute('aria-pressed','true');
    encBtn.classList.remove('active'); encBtn.setAttribute('aria-pressed','false');
    /* Refresh overlay on first open */
    renderDecodeInputHl(decodeInput.value);
  });

  /* ── Open/close ── */
  function openJWT(){
    openOverlay('jwtOverlay','jwtClose');
    /* Re-sync mirror heights after layout paint */
    requestAnimationFrame(function(){
      syncHeight(headerTa,  headerHl);
      syncHeight(payloadTa, payloadHl);
      updateEncode();
    });
  }
  function closeJWT(){ closeOverlay('jwtOverlay'); }
  $('jwtBtn').addEventListener('click',openJWT);
  $('jwtClose').addEventListener('click',closeJWT);
  $('jwtOverlay').addEventListener('click',function(e){ if(e.target===this) closeJWT(); });

  /* Initialise decode placeholder */
  renderDecodeInputHl('');
})();
