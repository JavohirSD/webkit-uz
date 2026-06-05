'use strict';

/* ══════════════════════════════════════════
   TELEGRAM BOT MANAGER
   Client-side helper for the Telegram Bot API.
   Only the bot token is entered (persisted to
   localStorage); the full https://api.telegram.org
   /bot… URL is built automatically. The token stays
   in the browser — requests go straight to Telegram.

   Action bar:
     • Set Webhook    → setWebhook (form)
     • Drop Updates   → setWebhook (form) + drop_pending_updates=true   [warning]
     • Delete Webhook → deleteWebhook (custom confirm dialog)           [danger]
     • Webhook Info   → getWebhookInfo (auto-run + cached)              [success]
     • Custom Request → any method + JSON body (syntax-highlighted)
══════════════════════════════════════════ */
(function(){
  'use strict';

  var TG_PREFIX = 'https://api.telegram.org/bot';
  var LS_TOKEN  = 'tg_bot_token';
  var DEFAULT_CUSTOM_BODY = '{\n  "chat_id": 1234567,\n  "text": "hello world",\n  "parse_mode": "html"\n}';

  /* allowed_updates types (Telegram Bot API) */
  var UPDATE_TYPES = [
    'message','edited_message','channel_post','edited_channel_post',
    'business_connection','business_message','edited_business_message',
    'deleted_business_messages','message_reaction','message_reaction_count',
    'inline_query','chosen_inline_result','callback_query','shipping_query',
    'pre_checkout_query','purchased_paid_media','poll','poll_answer',
    'my_chat_member','chat_member','chat_join_request','chat_boost','removed_chat_boost'
  ];

  var SECRET_RE = /^[A-Za-z0-9_-]{1,256}$/;

  /* ── DOM refs ── */
  var body       = $('tgBody');
  var tokenInput = $('tgToken');
  var urlBox     = $('tgUrlBox');
  var urlExtra   = $('tgUrlExtra');
  var methodBadge= $('tgMethodBadge');
  var runBtn     = $('tgRunBtn');
  var respWrap   = $('tgResponse');
  var respStatus = $('tgRespStatus');
  var respBody   = $('tgRespBody');

  /* set-webhook form */
  var fUrl=$('tgUrl'), fSecret=$('tgSecret'), fIp=$('tgIp'), fMax=$('tgMax'), fCert=$('tgCert'), auGrid=$('tgAllowedUpdates');
  /* custom request (syntax-highlighted mirror editor) */
  var cMethod=$('tgCustomMethod'), cBody=$('tgCustomBody'), cCode=$('tgCustomCode'), cPre=$('tgCustomPre'), cMirror=$('tgCustomMirror'), cValid=$('tgCustomValid');
  /* delete confirm dialog */
  var confirmEl=$('tgConfirm'), confirmDrop=$('tgConfirmDrop');

  var BAR = ['tgtab-set','tgtab-drop','tgtab-del','tgtab-info','tgtab-custom'];

  /* ── state ── */
  var activeView = 'set';   /* set | info | custom */
  var setAction  = 'set';   /* set | drop | del — operation while the Set panel is shown */
  var delDrop    = false;   /* drop_pending_updates chosen in the Delete confirm */
  var urlTouched = false;
  var infoCache  = null;    /* cached getWebhookInfo result: {status,data} */

  /* ── Restore saved token ── */
  try{ var saved=localStorage.getItem(LS_TOKEN); if(saved) tokenInput.value=saved; }catch(e){}

  /* ── Build allowed_updates checkboxes ── */
  UPDATE_TYPES.forEach(function(t){
    var lbl=document.createElement('label'); lbl.className='tg-check';
    var cb=document.createElement('input'); cb.type='checkbox'; cb.value=t; cb.className='tg-au-cb';
    var span=document.createElement('span'); span.textContent=t;
    lbl.appendChild(cb); lbl.appendChild(span); auGrid.appendChild(lbl);
  });
  function selectedUpdates(){
    return Array.prototype.slice.call(auGrid.querySelectorAll('.tg-au-cb'))
      .filter(function(c){ return c.checked; }).map(function(c){ return c.value; });
  }

  /* ── Helpers ── */
  function getToken(){
    return (tokenInput.value||'').trim()
      .replace(/^https?:\/\/api\.telegram\.org\/bot/i,'')
      .replace(/^\/+/,'').replace(/\/+$/,'');
  }
  function setFieldErr(input, errEl, msg){
    if(!input||!errEl) return;
    if(msg){ input.classList.add('tg-invalid'); errEl.textContent=msg; errEl.classList.add('show'); }
    else   { input.classList.remove('tg-invalid'); errEl.textContent=''; errEl.classList.remove('show'); }
  }
  function isSetField(t){
    return t===fUrl||t===fSecret||t===fIp||t===fMax||t===fCert||(t.classList&&t.classList.contains('tg-au-cb'));
  }

  /* ── JSON syntax highlighter (tolerant — works on as-typed text) ── */
  function hlEscape(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function highlightJsonText(src){
    return hlEscape(src).replace(
      /("(?:\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(?:true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)/g,
      function(m){
        var cls='tg-num';
        if(m.charAt(0)==='"'){ cls=/:\s*$/.test(m)?'tg-key':'tg-str'; }
        else if(m==='true'||m==='false'){ cls='tg-bool'; }
        else if(m==='null'){ cls='tg-null'; }
        return '<span class="'+cls+'">'+m+'</span>';
      });
  }
  function refreshCustomMirror(){
    cCode.innerHTML = highlightJsonText(cBody.value)+'\n';
    cPre.scrollTop=cBody.scrollTop; cPre.scrollLeft=cBody.scrollLeft;
  }

  /* ── Build a request descriptor for the current view/action ── */
  function buildRequest(){
    var token=getToken();
    var base=TG_PREFIX+token;
    var method='getWebhookInfo', pairs=[], notes=[], errors=[], cert=null;
    var fieldErrs={url:'',secret:'',max:'',method:''};
    var customState='empty';

    if(!token) errors.push('Bot token is required.');

    if(activeView==='set'){
      if(setAction==='set'||setAction==='drop'){
        method='setWebhook';
        cert=(fCert&&fCert.files&&fCert.files[0])||null;

        var urlVal=(fUrl.value||'').trim();
        if(!urlVal) errors.push('A webhook url is required.');
        else if(!/^https:\/\//i.test(urlVal)) notes.push('Telegram requires an HTTPS url.');
        if(urlVal) pairs.push(['url',urlVal]);
        fieldErrs.url=((urlTouched||setAction==='drop')&&!urlVal)?'Required.':'';

        var secret=(fSecret.value||'').trim();
        if(secret&&!SECRET_RE.test(secret)){ errors.push('Invalid secret_token.'); fieldErrs.secret='Invalid characters or length.'; }
        else if(secret) pairs.push(['secret_token',secret]);

        var ip=(fIp.value||'').trim(); if(ip) pairs.push(['ip_address',ip]);

        var maxv=(fMax.value||'').trim();
        if(maxv!==''){
          var n=parseInt(maxv,10);
          if(isNaN(n)||n<1||n>100){ errors.push('max_connections must be 1–100.'); fieldErrs.max='1–100 only.'; }
          else pairs.push(['max_connections',String(n)]);
        }

        var ups=selectedUpdates(); if(ups.length) pairs.push(['allowed_updates',JSON.stringify(ups)]);

        if(setAction==='drop'){ pairs.push(['drop_pending_updates','true']); notes.push('Re-sets the webhook and drops all pending updates (setWebhook + drop_pending_updates=true).'); }
        if(cert) notes.push('certificate “'+cert.name+'” sent as multipart/form-data.');

      } else { /* del */
        method='deleteWebhook'; if(delDrop) pairs.push(['drop_pending_updates','true']);
        notes.push('Delete webhook'+(delDrop?' and drop all pending updates.':' (pending updates kept).'));
      }

    } else if(activeView==='info'){
      method='getWebhookInfo';

    } else { /* custom */
      method=(cMethod.value||'').trim();
      if(!method){ errors.push('Method name is required.'); fieldErrs.method='Required.'; }
      else if(/[\/\s?#]/.test(method)){ errors.push('Invalid method name.'); fieldErrs.method='No spaces, /, ? or #.'; }

      var raw=(cBody.value||'').trim();
      if(!raw){ customState='empty'; }
      else {
        try{
          var obj=JSON.parse(raw);
          if(obj&&typeof obj==='object'&&!Array.isArray(obj)){
            Object.keys(obj).forEach(function(k){
              var v=obj[k];
              var sv=(v===null||typeof v==='object')?JSON.stringify(v):String(v);
              pairs.push([k,sv]);
            });
            customState='valid';
          } else { errors.push('Body must be a JSON object.'); customState='invalid'; }
        }catch(e){ errors.push('Invalid JSON body.'); customState='invalid'; }
      }
    }

    var httpMethod = cert ? 'POST' : 'GET';
    return { token:token, base:base, method:method, pairs:pairs, notes:notes, errors:errors,
             httpMethod:httpMethod, cert:cert, fieldErrs:fieldErrs, customState:customState };
  }

  /* ── Real (encoded) URL for fetch / copy ── */
  function composeUrl(req){
    var q=req.pairs.map(function(p){ return encodeURIComponent(p[0])+'='+encodeURIComponent(p[1]); }).join('&');
    return req.base+'/'+req.method+(q?('?'+q):'');
  }

  /* ── Highlighted URL preview (values shown readable) ── */
  function renderUrlPreview(req){
    var html='<span class="tg-u-base">'+esc(TG_PREFIX)+'</span>';
    html+= req.token ? '<span class="tg-u-token">'+esc(req.token)+'</span>'
                     : '<span class="tg-u-ph">&lt;bot_token&gt;</span>';
    html+='<span class="tg-u-punc">/</span><span class="tg-u-method">'+esc(req.method)+'</span>';
    req.pairs.forEach(function(p,idx){
      html+='<span class="tg-u-punc">'+(idx===0?'?':'&')+'</span>'+
            '<span class="tg-u-key">'+esc(p[0])+'</span>'+
            '<span class="tg-u-punc">=</span>'+
            '<span class="tg-u-val">'+esc(p[1])+'</span>';
    });
    urlBox.innerHTML=html;

    methodBadge.textContent=req.httpMethod;
    methodBadge.classList.toggle('post', req.httpMethod==='POST');

    if(req.notes.length){
      urlExtra.innerHTML=req.notes.map(function(n){ return '↳ '+esc(n); }).join('<br>');
      urlExtra.style.display='';
    } else { urlExtra.textContent=''; urlExtra.style.display='none'; }
  }

  /* ── Validate + reflect run button state ── */
  function validate(req){
    if(activeView==='set'&&setAction!=='del'){
      setFieldErr(fUrl, $('tgUrlErr'), req.fieldErrs.url);
      setFieldErr(fSecret, $('tgSecretErr'), req.fieldErrs.secret);
      setFieldErr(fMax, $('tgMaxErr'), req.fieldErrs.max);
    }
    if(activeView==='custom'){
      setFieldErr(cMethod, $('tgCustomMethodErr'), req.fieldErrs.method);
      cMirror.classList.toggle('tg-invalid', req.customState==='invalid');
      if(req.customState==='empty'){ cValid.textContent=''; cValid.className='tg-validator'; }
      else if(req.customState==='valid'){ cValid.textContent='✓ Valid JSON'; cValid.className='tg-validator ok'; }
      else { cValid.textContent='✗ Invalid JSON'; cValid.className='tg-validator err'; }
    }
    var ok=req.errors.length===0;
    runBtn.disabled=!ok;
    runBtn.title=ok?'Send the request to Telegram':(req.errors[0]||'');
    return ok;
  }

  function update(){ var req=buildRequest(); renderUrlPreview(req); validate(req); return req; }

  /* ── Minimal JSON syntax highlighter for the response ── */
  function renderJson(v, depth){
    var pad='  '.repeat(depth), pad1='  '.repeat(depth+1);
    if(v===null) return '<span class="tg-null">null</span>';
    var t=typeof v;
    if(t==='boolean') return '<span class="tg-bool">'+v+'</span>';
    if(t==='number')  return '<span class="tg-num">'+v+'</span>';
    if(t==='string')  return '<span class="tg-str">"'+esc(v)+'"</span>';
    if(Array.isArray(v)){
      if(!v.length) return '<span class="tg-punc">[]</span>';
      return '<span class="tg-punc">[</span>\n'+
        v.map(function(it){ return pad1+renderJson(it,depth+1); }).join('<span class="tg-punc">,</span>\n')+
        '\n'+pad+'<span class="tg-punc">]</span>';
    }
    var keys=Object.keys(v);
    if(!keys.length) return '<span class="tg-punc">{}</span>';
    return '<span class="tg-punc">{</span>\n'+
      keys.map(function(k){
        return pad1+'<span class="tg-key">"'+esc(k)+'"</span><span class="tg-punc">: </span>'+renderJson(v[k],depth+1);
      }).join('<span class="tg-punc">,</span>\n')+
      '\n'+pad+'<span class="tg-punc">}</span>';
  }

  function clearResponse(){
    respWrap.style.display='none';
    respStatus.textContent=''; respStatus.className='tg-resp-status';
    respBody.textContent='';
  }
  function showResponse(status, data){
    respWrap.style.display='flex';
    var tgOk=data&&typeof data==='object'&&data.ok===true;
    if(tgOk){
      respStatus.className='tg-resp-status ok';
      respStatus.textContent='✓ '+status+' · ok';
    } else {
      respStatus.className='tg-resp-status err';
      var code=(data&&data.error_code)?data.error_code:status;
      respStatus.textContent='✗ '+code+(data&&data.description?' · '+data.description:'');
    }
    if(data&&typeof data==='object'){ respBody.innerHTML=renderJson(data,0); }
    else { respBody.textContent=String(data); }
    respWrap.scrollIntoView({block:'nearest',behavior:'smooth'});
  }
  function showFailure(err){
    respWrap.style.display='flex';
    respStatus.className='tg-resp-status err';
    respStatus.textContent='✗ Request failed';
    respBody.textContent=
      (err&&err.message?err.message+'\n\n':'')+
      'The request could not be completed. This is usually a network/CORS issue or an '+
      'invalid token. The generated URL above is still correct — copy it and run it with '+
      'curl or paste it into a new browser tab.';
  }

  /* ── Run the request ── */
  function run(){
    var req=update();
    if(runBtn.disabled) return;
    var reqView=activeView;
    var url=composeUrl(req);

    var opts;
    if(req.httpMethod==='POST'&&req.cert){
      var fd=new FormData(); fd.append('certificate', req.cert, req.cert.name);
      opts={ method:'POST', body:fd };
    } else { opts={ method:'GET' }; }

    runBtn.disabled=true;
    var origHtml=runBtn.innerHTML;
    runBtn.innerHTML='<span class="tg-run-spin"></span> Sending…';

    fetch(url,opts).then(function(res){
      return res.json().then(
        function(data){ return {status:res.status, data:data}; },
        function(){ return res.text().then(function(txt){ return {status:res.status, data:txt}; }); }
      );
    }).then(function(r){
      showResponse(r.status, r.data);
      if(reqView==='info') infoCache={status:r.status, data:r.data};
    })['catch'](function(err){
      showFailure(err);
    }).then(function(){
      runBtn.innerHTML=origHtml; update();
    });
  }

  /* ── Copy helper ── */
  function flashCopy(btn){
    var o=btn.textContent; btn.textContent='Copied!'; btn.classList.add('ok');
    setTimeout(function(){ btn.textContent=o; btn.classList.remove('ok'); },1400);
  }

  /* ── View + action bar ── */
  function highlight(id){
    BAR.forEach(function(b){ var el=$(b); el.classList.toggle('active',b===id); el.setAttribute('aria-pressed', b===id?'true':'false'); });
  }
  function showView(v){
    activeView=v;
    $('tgpanel-set').classList.toggle('active', v==='set');
    $('tgpanel-custom').classList.toggle('active', v==='custom');
  }
  function gotoSet(action, btnId){
    showView('set'); setAction=action; highlight(btnId); clearResponse(); update();
  }

  $('tgtab-set').addEventListener('click', function(){ gotoSet('set','tgtab-set'); });
  $('tgtab-drop').addEventListener('click', function(){ gotoSet('drop','tgtab-drop'); });
  $('tgtab-del').addEventListener('click', openConfirm);
  $('tgtab-info').addEventListener('click', function(){
    showView('info'); highlight('tgtab-info'); update();
    if(infoCache) showResponse(infoCache.status, infoCache.data);  /* cached — no refetch */
    else run();                                                    /* first open — auto-send */
  });
  $('tgtab-custom').addEventListener('click', function(){
    showView('custom'); highlight('tgtab-custom'); clearResponse(); update(); refreshCustomMirror();
  });

  /* ── Delete confirm dialog ── */
  function openConfirm(){
    confirmDrop.checked=false;
    confirmEl.style.display='flex';
    setTimeout(function(){ $('tgConfirmCancel').focus(); },30);
  }
  function closeConfirm(){ confirmEl.style.display='none'; }
  $('tgConfirmCancel').addEventListener('click', closeConfirm);
  $('tgConfirmOk').addEventListener('click', function(){
    delDrop=confirmDrop.checked; closeConfirm(); gotoSet('del','tgtab-del');
  });
  confirmEl.addEventListener('click', function(e){ if(e.target===confirmEl) closeConfirm(); });
  /* Escape closes the confirm first (capture phase, before the modal's Esc handler) */
  document.addEventListener('keydown', function(e){
    if(e.key==='Escape' && confirmEl.style.display==='flex'){
      e.stopImmediatePropagation(); e.preventDefault(); closeConfirm();
    }
  }, true);

  /* ── Certificate file display ── */
  function updateCertUI(){
    var f=fCert.files&&fCert.files[0];
    $('tgCertName').textContent=f?f.name:'';
    $('tgCertPrompt').style.display=f?'none':'';
    $('tgCertClear').style.display=f?'':'none';
  }
  fCert.addEventListener('change', updateCertUI);
  $('tgCertClear').addEventListener('click', function(e){
    e.preventDefault();
    fCert.value=''; updateCertUI();
    if(activeView==='set'&&setAction==='del'){ setAction='set'; highlight('tgtab-set'); clearResponse(); }
    update();
  });

  /* ── allowed_updates select-all / clear ── */
  $('tgAuAll').addEventListener('click', function(){ auGrid.querySelectorAll('.tg-au-cb').forEach(function(c){ c.checked=true; }); update(); });
  $('tgAuNone').addEventListener('click', function(){ auGrid.querySelectorAll('.tg-au-cb').forEach(function(c){ c.checked=false; }); update(); });

  /* ── Reset form settings (keeps the saved token) ── */
  $('tgReset').addEventListener('click', function(){
    fUrl.value=''; fSecret.value=''; fIp.value=''; fMax.value='';
    fCert.value=''; updateCertUI();
    auGrid.querySelectorAll('.tg-au-cb').forEach(function(c){ c.checked=false; });
    cMethod.value='sendMessage'; cBody.value=DEFAULT_CUSTOM_BODY; refreshCustomMirror();
    delDrop=false; urlTouched=false; infoCache=null;
    gotoSet('set','tgtab-set');
  });

  /* ── Live update; editing the Set form returns to the Set operation ── */
  function onFormActivity(e){
    if(e.target===tokenInput){ infoCache=null; try{ localStorage.setItem(LS_TOKEN, tokenInput.value.trim()); }catch(err){} }
    if(e.target===cBody) refreshCustomMirror();
    if(activeView==='set'&&setAction==='drop'&&isSetField(e.target)){
      setAction='set'; highlight('tgtab-set'); clearResponse();
    }
    update();
  }
  body.addEventListener('input', onFormActivity);
  body.addEventListener('change', onFormActivity);
  fUrl.addEventListener('blur', function(){ urlTouched=true; update(); });
  cBody.addEventListener('scroll', function(){ cPre.scrollTop=cBody.scrollTop; cPre.scrollLeft=cBody.scrollLeft; });
  cBody.addEventListener('keydown', function(e){
    if(e.key==='Tab'){
      e.preventDefault();
      var s=cBody.selectionStart, en=cBody.selectionEnd;
      cBody.value=cBody.value.slice(0,s)+'  '+cBody.value.slice(en);
      cBody.selectionStart=cBody.selectionEnd=s+2;
      refreshCustomMirror(); update();
    }
  });

  /* ── Copy buttons ── */
  $('tgCopyUrl').addEventListener('click', function(){ copyText(composeUrl(buildRequest())); flashCopy(this); });
  $('tgCopyResp').addEventListener('click', function(){ if(respBody.textContent){ copyText(respBody.textContent); flashCopy(this); } });

  /* ── Run wiring (button + Ctrl/Cmd+Enter) ── */
  runBtn.addEventListener('click', run);
  body.addEventListener('keydown', function(e){ if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){ e.preventDefault(); run(); } });

  /* ── Open / close ── */
  function openTg(){ openOverlay('tgOverlay','tgToken'); update(); }
  function closeTg(){ closeConfirm(); closeOverlay('tgOverlay'); }
  $('tgBtn').addEventListener('click', openTg);
  $('tgClose').addEventListener('click', closeTg);
  $('tgOverlay').addEventListener('click', function(e){ if(e.target===this) closeTg(); });

  /* ── Init ── */
  refreshCustomMirror();
  update();
})();
