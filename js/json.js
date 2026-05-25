'use strict';

/* ══════════════════════════════════════════
   JSON FORMATTER
══════════════════════════════════════════ */
var inputArea  = $('inputArea');
var inNums     = $('inNums');
var outNums    = $('outNums');
var outContent = $('outContent');
var outWrap    = $('outWrap');
var errorBar   = $('errorBar');
var inBadge    = $('inBadge');
var outBadge   = $('outBadge');
var plainOutput = '', nodeCount = 0;

/* Apply config limits to inputs */
inputArea.maxLength = CFG.MAX_JSON_CHARS;
$('b64DecTa').maxLength = CFG.MAX_B64_CHARS;
$('b64EncTa').maxLength = CFG.MAX_B64_CHARS;
$('qrText').maxLength   = CFG.MAX_QR_CHARS;
$('taTa').maxLength     = CFG.MAX_TA_CHARS;

// Restore JSON input from localStorage on page load
(function(){
  try{
    var saved = localStorage.getItem('json_input');
    if(saved){ inputArea.value = saved; }
  }catch(e){}
})();

function showErr(msg){ errorBar.textContent='⚠  '+msg; errorBar.classList.add('show'); inputArea.setAttribute('aria-invalid','true'); }
function clearErr()  { errorBar.classList.remove('show'); inputArea.removeAttribute('aria-invalid'); }
function resetOut()  { outContent.innerHTML=''; outBadge.textContent='—'; outNums.textContent='1'; plainOutput=''; }

function updInNums(){
  var n = inputArea.value.split('\n').length;
  inNums.textContent = lineNums(n);
  inBadge.textContent = n+' line'+(n!==1?'s':'');
}
function updOutNums(){
  var text = outContent.innerText||outContent.textContent||'';
  outNums.textContent = lineNums(text.split('\n').length);
}

function errorPos(text, msg){
  var m = msg.match(/position (\d+)/i)||msg.match(/column (\d+)/i);
  if(!m) return '';
  var pos=+m[1], before=text.slice(0,pos);
  return ' (line '+before.split('\n').length+', col '+(pos-before.lastIndexOf('\n')-1)+')';
}

function buildHTML(val, depth){
  var i0='  '.repeat(depth), i1='  '.repeat(depth+1);
  if(val===null)             return '<span class="t-null">null</span>';
  if(typeof val==='boolean') return '<span class="t-bool">'+val+'</span>';
  if(typeof val==='number'){
    if(!isFinite(val)) return '<span class="t-null">'+val+'</span>';
    return '<span class="'+(Number.isInteger(val)?'t-int':'t-flt')+'">'+val+'</span>';
  }
  if(typeof val==='string')  return '<span class="t-str">"'+esc(val)+'"</span>';

  if(Array.isArray(val)){
    if(!val.length) return '<span class="t-punc">[]</span>';
    var id='n'+(++nodeCount);
    var items=val.map(function(v,i){
      return i1+buildHTML(v,depth+1)+(i<val.length-1?'<span class="t-punc">,</span>':'');
    }).join('\n');
    return '<span class="node" id="'+id+'"><button class="toggle" onclick="window._toggle(\''+id+'\')" aria-expanded="true" aria-label="Collapse array">▾</button><span class="t-punc">[</span><span class="t-count">'+val.length+'</span><span class="collapsible">\n'+items+'\n'+i0+'</span><span class="ellipsis"> … </span><span class="closing"><span class="t-punc">]</span></span><span class="closing-inline"><span class="t-punc">]</span></span></span>';
  }

  if(typeof val==='object'){
    var keys=Object.keys(val);
    if(!keys.length) return '<span class="t-punc">{}</span>';
    var id2='n'+(++nodeCount);
    var items2=keys.map(function(k,i){
      return i1+'<span class="t-key">"'+esc(k)+'"</span><span class="t-punc">: </span>'+buildHTML(val[k],depth+1)+(i<keys.length-1?'<span class="t-punc">,</span>':'');
    }).join('\n');
    return '<span class="node" id="'+id2+'"><button class="toggle" onclick="window._toggle(\''+id2+'\')" aria-expanded="true" aria-label="Collapse object">▾</button><span class="t-punc">{</span><span class="t-count">'+keys.length+'</span><span class="collapsible">\n'+items2+'\n'+i0+'</span><span class="ellipsis"> … </span><span class="closing"><span class="t-punc">}</span></span><span class="closing-inline"><span class="t-punc">}</span></span></span>';
  }
  return esc(String(val));
}

window._toggle = function(id){
  var el=document.getElementById(id); if(!el) return;
  var c=el.classList.toggle('collapsed');
  var t=el.querySelector('.toggle');
  if(t){
    t.textContent = c ? '▸' : '▾';
    t.setAttribute('aria-expanded', c ? 'false' : 'true');
    t.setAttribute('aria-label', c ? 'Expand' : 'Collapse');
  }
  updOutNums();
};

function setAllNodes(collapse){
  document.querySelectorAll('.node').forEach(function(n){
    n.classList.toggle('collapsed',collapse);
    var t=n.querySelector('.toggle');
    if(t){
      t.textContent = collapse ? '▸' : '▾';
      t.setAttribute('aria-expanded', collapse ? 'false' : 'true');
      t.setAttribute('aria-label', collapse ? 'Expand' : 'Collapse');
    }
  });
  updOutNums();
}

function doFormat(raw){
  clearErr();
  var trimmed=(raw||'').trim();
  if(!trimmed){ resetOut(); return; }
  if(trimmed.length>500000) showErr('Large input ('+Math.round(trimmed.length/1000)+' KB) — may be slow.');
  var decoded=decodeUnicode(trimmed);
  var parsed;
  try{ parsed=JSON.parse(decoded); }
  catch(e){ resetOut(); showErr(e.message+errorPos(decoded,e.message)); return; }
  nodeCount=0;
  var fmt=JSON.stringify(parsed,null,2);
  plainOutput=fmt;
  outBadge.textContent=fmt.split('\n').length+' lines';
  try{ outContent.innerHTML=buildHTML(parsed,0); }
  catch(e){ outContent.textContent=fmt; showErr('Renderer error — plain output. '+e.message); }
  updOutNums();
  // Re-apply search highlights after rerender
  if(window._searchHook) window._searchHook();
}

// Input events
inputArea.addEventListener('input', function(){
  updInNums(); doFormat(inputArea.value);
  try{ localStorage.setItem('json_input', inputArea.value); }catch(e){}
});
inputArea.addEventListener('paste', function(){ setTimeout(function(){ updInNums(); doFormat(inputArea.value); try{ localStorage.setItem('json_input', inputArea.value); }catch(e){} },0); });
inputArea.addEventListener('scroll', function(){ inNums.scrollTop=inputArea.scrollTop; });
inputArea.addEventListener('keydown', function(e){
  if(e.key!=='Tab') return;
  e.preventDefault();
  var s=inputArea.selectionStart, end=inputArea.selectionEnd;
  inputArea.value=inputArea.value.slice(0,s)+'  '+inputArea.value.slice(end);
  inputArea.selectionStart=inputArea.selectionEnd=s+2;
  updInNums();
});
outWrap.addEventListener('scroll', function(){ outNums.scrollTop=outWrap.scrollTop; });

// Toolbar
$('clearBtn').addEventListener('click', function(){ inputArea.value=''; updInNums(); clearErr(); resetOut(); try{ localStorage.removeItem('json_input'); }catch(e){} });
$('minifyBtn').addEventListener('click', function(){
  var raw=inputArea.value.trim();
  if(!raw){ showErr('Nothing to minify.'); return; }
  try{ var min=JSON.stringify(JSON.parse(decodeUnicode(raw))); inputArea.value=min; updInNums(); doFormat(min); }
  catch(e){ showErr('Cannot minify — invalid JSON: '+e.message); }
});
// Open file
$('openFileBtn').addEventListener('click', function(){ $('jsonFileInput').click(); });
$('jsonFileInput').addEventListener('change', function(){
  var file = this.files[0];
  if(!file) return;
  var reader = new FileReader();
  reader.onload = function(e){
    inputArea.value = e.target.result;
    updInNums(); clearErr(); doFormat(e.target.result);
  };
  reader.readAsText(file);
  this.value = '';
});

// Fullscreen
(function(){
  function requestFS(el){
    var fn = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
    if(fn) fn.call(el);
  }
  function exitFS(){
    var fn = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen;
    if(fn) fn.call(document);
  }
  $('fullscreenLeftBtn').addEventListener('click', function(){
    if(document.fullscreenElement || document.webkitFullscreenElement){ exitFS(); } else { requestFS($('colLeft')); }
  });
  $('fullscreenRightBtn').addEventListener('click', function(){
    if(document.fullscreenElement || document.webkitFullscreenElement){ exitFS(); } else { requestFS($('colRight')); }
  });
})();
$('copyBtn').addEventListener('click', function(){
  if(!plainOutput){ showErr('Nothing to copy — format valid JSON first.'); return; }
  copyText(plainOutput); flashBtn($('copyBtn'),'Copied!');
});

// Toggle expand / collapse
(function(){
  var btn = $('toggleExpandBtn');
  var icon = $('toggleExpandIcon');
  var lbl  = $('toggleExpandLbl');
  var expanded = true;
  btn.addEventListener('click', function(){
    if(!plainOutput) return;
    expanded = !expanded;
    setAllNodes(!expanded);
    if(expanded){
      icon.innerHTML = '<polyline points="18 15 12 9 6 15"/>';
      lbl.textContent = 'Collapse all';
      btn.setAttribute('aria-label','Collapse all JSON nodes');
    } else {
      icon.innerHTML = '<polyline points="6 9 12 15 18 9"/>';
      lbl.textContent = 'Expand all';
      btn.setAttribute('aria-label','Expand all JSON nodes');
    }
  });
  // Reset to expanded state when new JSON is formatted
  var origDoFormat = doFormat;
  doFormat = function(raw){
    origDoFormat(raw);
    expanded = true;
    icon.innerHTML = '<polyline points="18 15 12 9 6 15"/>';
    lbl.textContent = 'Collapse all';
    btn.setAttribute('aria-label','Collapse all JSON nodes');
  };
})();

// Save modal
(function(){
  var overlay  = $('saveOverlay');
  var closeBtn = $('saveClose');
  var status   = $('saveStatus');

  function openSaveModal(){
    if(!plainOutput){ showErr('Nothing to save — format valid JSON first.'); return; }
    status.textContent = '';
    overlay.classList.add('open');
  }
  function closeSaveModal(){ overlay.classList.remove('open'); }

  $('saveBtn').addEventListener('click', openSaveModal);
  closeBtn.addEventListener('click', closeSaveModal);
  overlay.addEventListener('click', function(e){ if(e.target===overlay) closeSaveModal(); });
  document.addEventListener('keydown', function(e){ if(e.key==='Escape' && overlay.classList.contains('open')) closeSaveModal(); });

  function saveFilename(ext){
    var now = new Date();
    var pad2 = function(n){ return n<10?'0'+n:String(n); };
    var dt = now.getFullYear()+pad2(now.getMonth()+1)+pad2(now.getDate())+'-'+pad2(now.getHours())+pad2(now.getMinutes())+pad2(now.getSeconds());
    return 'webkit-uz-json-'+dt+'.'+ext;
  }

  function addWatermark(canvas){
    var dark  = document.documentElement.getAttribute('data-theme') !== 'light';
    var scale = Math.max(window.devicePixelRatio || 1, 3);
    var fs    = Math.round(11 * scale);
    var pad   = Math.round(12 * scale);
    var ctx   = canvas.getContext('2d');
    ctx.save();
    /* html2canvas leaves scale(n,n) on the context; reset to physical pixels */
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = '500 '+fs+'px "JetBrains Mono",Consolas,"Courier New",monospace';
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'bottom';
    ctx.globalAlpha  = 0.30;
    ctx.fillStyle    = dark ? '#c8d0e0' : '#1a2236';
    ctx.fillText('webkit.uz', canvas.width - pad, canvas.height - pad);
    ctx.restore();
  }

  function captureTarget(){
    var el = $('colRight');
    var scale = Math.max(window.devicePixelRatio || 1, 3);
    var bg = getComputedStyle(el).backgroundColor;
    if(!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent'){
      bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#050608';
    }
    var opts = {
      scale: scale,
      useCORS: true,
      allowTaint: false,
      backgroundColor: bg,
      logging: false,
      onclone: function(doc){
        var clonedEl = doc.getElementById('colRight');
        if(clonedEl){ clonedEl.style.overflow = 'visible'; clonedEl.style.height = 'auto'; }
        var clonedWrap = doc.getElementById('outWrap');
        if(clonedWrap){ clonedWrap.style.overflow = 'visible'; clonedWrap.style.height = 'auto'; clonedWrap.style.maxHeight = 'none'; }
        var clonedNums = doc.getElementById('outNums');
        if(clonedNums){ clonedNums.style.overflow = 'visible'; clonedNums.style.height = 'auto'; }
      }
    };
    /* Browsers render fullscreen elements in a separate compositing layer
       that html2canvas cannot read — exit fullscreen first, then capture. */
    var fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    if(fsEl){
      var exitFn = document.exitFullscreen || document.webkitExitFullscreen;
      return exitFn.call(document).then(function(){ return html2canvas(el, opts); });
    }
    return html2canvas(el, opts);
  }

  $('saveImgFileBtn').addEventListener('click', function(){
    if(typeof html2canvas === 'undefined'){ status.textContent = 'html2canvas not loaded.'; return; }
    var fname = saveFilename('png');

    if(window.showSaveFilePicker){
      // Chrome / Edge: showSaveFilePicker must be called synchronously inside
      // the click handler to keep the browser's user-gesture activation context.
      var pickerPromise = window.showSaveFilePicker({
        suggestedName: fname,
        types: [{ description: 'PNG Image', accept: {'image/png': ['.png']} }]
      });
      status.textContent = 'Capturing…';
      Promise.all([pickerPromise, captureTarget()])
        .then(function(r){
          var fileHandle = r[0], canvas = r[1];
          addWatermark(canvas);
          canvas.toBlob(function(blob){
            fileHandle.createWritable()
              .then(function(w){ return w.write(blob).then(function(){ return w.close(); }); })
              .then(function(){ status.textContent = 'Image saved!'; setTimeout(closeSaveModal, 1200); })
              .catch(function(e){ status.textContent = 'Write failed: '+e.message; });
          }, 'image/png');
        })
        .catch(function(e){
          if(e.name === 'AbortError'){ status.textContent = ''; return; }
          status.textContent = 'Failed: '+e.message;
        });
    } else {
      status.textContent = 'Capturing…';
      captureTarget().then(function(canvas){
        addWatermark(canvas);
        canvas.toBlob(function(blob){
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url; a.download = fname;
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          setTimeout(function(){ URL.revokeObjectURL(url); }, 30000);
          status.textContent = 'Image saved!';
          setTimeout(closeSaveModal, 1200);
        }, 'image/png');
      }).catch(function(e){ status.textContent = 'Capture failed: '+e.message; });
    }
  });

  $('saveImgClipBtn').addEventListener('click', function(){
    if(typeof html2canvas === 'undefined'){ status.textContent = 'html2canvas not loaded.'; return; }
    status.textContent = 'Capturing…';
    captureTarget().then(function(canvas){
      addWatermark(canvas);
      canvas.toBlob(function(blob){
        if(!navigator.clipboard || !window.ClipboardItem){
          status.textContent = 'Clipboard API not supported in this browser.';
          return;
        }
        var item = new ClipboardItem({'image/png': blob});
        navigator.clipboard.write([item]).then(function(){
          status.textContent = 'Image copied to clipboard!';
          setTimeout(closeSaveModal, 1200);
        }).catch(function(e){
          status.textContent = 'Clipboard permission denied: '+e.message;
        });
      }, 'image/png');
    }).catch(function(e){ status.textContent = 'Capture failed: '+e.message; });
  });

  $('saveJsonFileBtn').addEventListener('click', function(){
    if(!plainOutput){ status.textContent = 'No formatted JSON to save.'; return; }
    downloadFile(plainOutput, saveFilename('json'));
    status.textContent = 'JSON file saved!';
    setTimeout(closeSaveModal, 1200);
  });
})();

// Init from restored localStorage value
if(inputArea.value){ updInNums(); doFormat(inputArea.value); }

/* ══════════════════════════════════════════
   COLUMN RESIZER
══════════════════════════════════════════ */
(function(){
  var cols=document.getElementById('columns');
  var left=document.getElementById('colLeft');
  var right=document.getElementById('colRight');
  var handle=document.getElementById('colResizer');
  var MIN=180, drag=false, x0=0, lw=0, rw=0;

  function split(){
    if(window.innerWidth<=768) return;
    var avail=cols.offsetWidth-handle.offsetWidth;
    left.style.width=(avail/2)+'px';
    right.style.width=(avail/2)+'px';
  }
  split();
  window.addEventListener('resize', function(){ split(); });

  function start(x){ drag=true;x0=x;lw=left.offsetWidth;rw=right.offsetWidth;handle.classList.add('dragging');document.body.style.cursor='col-resize';document.body.style.userSelect='none';document.body.style.webkitUserSelect='none'; }
  function move(x){ if(!drag) return; var nl=Math.min(Math.max(lw+(x-x0),MIN),lw+rw-MIN); left.style.width=nl+'px'; right.style.width=(lw+rw-nl)+'px'; }
  function end(){ if(!drag) return; drag=false; handle.classList.remove('dragging'); document.body.style.cursor=''; document.body.style.userSelect=''; document.body.style.webkitUserSelect=''; }

  handle.addEventListener('mousedown', function(e){ start(e.clientX); e.preventDefault(); });
  document.addEventListener('mousemove', function(e){ move(e.clientX); });
  document.addEventListener('mouseup', end);
  handle.addEventListener('touchstart', function(e){ start(e.touches[0].clientX); e.preventDefault(); },{passive:false});
  document.addEventListener('touchmove', function(e){ if(drag){ move(e.touches[0].clientX); e.preventDefault(); } },{passive:false});
  document.addEventListener('touchend', end);
})();

updInNums();


/* ══════════════════════════════════════════
   JSON SEARCH
══════════════════════════════════════════ */
(function(){
  var searchBar    = $('jsonSearchBar');
  var searchInput  = $('jsonSearchInput');
  var searchCount  = $('searchCount');
  var prevBtn      = $('searchPrev');
  var nextBtn      = $('searchNext');
  var closeBtn     = $('searchClose');
  var toggleBtn    = $('searchToggleBtn');
  var hits         = [];
  var activeIdx    = -1;
  var isOpen       = false;

  /* ── open / close the search bar ── */
  function openSearch(){
    isOpen = true;
    searchBar.classList.remove('search-bar-hidden');
    toggleBtn.setAttribute('aria-expanded','true');
    toggleBtn.classList.add('primary');
    searchInput.focus();
    searchInput.select();
  }
  function closeSearch(){
    isOpen = false;
    searchBar.classList.add('search-bar-hidden');
    toggleBtn.setAttribute('aria-expanded','false');
    toggleBtn.classList.remove('primary');
    clearHighlights();
    searchInput.value = '';
    searchCount.textContent = '';
    prevBtn.disabled = true;
    nextBtn.disabled = true;
  }

  toggleBtn.addEventListener('click', function(){
    if(isOpen) closeSearch(); else openSearch();
  });
  closeBtn.addEventListener('click', closeSearch);

  /* ── clear all <mark> highlights ── */
  function clearHighlights(){
    /* normalise before we walk, so adjacent text nodes merge */
    outContent.normalize();
    outContent.querySelectorAll('mark.s-hit').forEach(function(m){
      var p = m.parentNode; if(!p) return;
      while(m.firstChild) p.insertBefore(m.firstChild, m);
      p.removeChild(m);
    });
    outContent.normalize();
    hits = []; activeIdx = -1;
  }

  /* ── collect ALL text nodes into a plain array first ──
       We must snapshot before touching the DOM so we never
       process a text node that we ourselves just created.    */
  function collectTextNodes(root){
    var result = [];
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    var n;
    while((n = walker.nextNode())) result.push(n);
    return result;
  }

  /* ── highlight a single text node for a given query ── */
  function highlightNode(tn, lowerQuery, queryLen){
    var val  = tn.nodeValue;
    var lval = val.toLowerCase();
    var pos  = lval.indexOf(lowerQuery);
    if(pos === -1) return;                 /* nothing to do */

    var frag = document.createDocumentFragment();
    var last = 0;
    while(pos !== -1){
      /* text before the match */
      if(pos > last) frag.appendChild(document.createTextNode(val.slice(last, pos)));
      /* the match itself */
      var mark = document.createElement('mark');
      mark.className = 's-hit';
      mark.setAttribute('aria-hidden','true');
      mark.textContent = val.slice(pos, pos + queryLen);
      frag.appendChild(mark);
      hits.push(mark);
      last = pos + queryLen;
      pos  = lval.indexOf(lowerQuery, last);
    }
    /* text after the last match */
    if(last < val.length) frag.appendChild(document.createTextNode(val.slice(last)));

    tn.parentNode.replaceChild(frag, tn);
  }

  /* ── set the active (bright) hit and scroll to it ── */
  function setActive(idx){
    if(!hits.length){ activeIdx = -1; return; }
    if(idx < 0)            idx = hits.length - 1;
    if(idx >= hits.length) idx = 0;
    if(activeIdx >= 0 && hits[activeIdx]) hits[activeIdx].classList.remove('s-active');
    activeIdx = idx;
    hits[activeIdx].classList.add('s-active');
    hits[activeIdx].scrollIntoView({block:'nearest', behavior:'smooth'});
    searchCount.textContent = (activeIdx + 1) + ' / ' + hits.length;
    searchCount.className   = 'search-count has-match';
  }

  /* ── main search routine ── */
  function runSearch(){
    clearHighlights();
    var query = (searchInput.value || '').trim();
    if(!query){
      searchCount.textContent = '';
      searchCount.className   = 'search-count';
      prevBtn.disabled = true;
      nextBtn.disabled = true;
      return;
    }

    /* snapshot text nodes BEFORE any DOM mutation */
    var nodes      = collectTextNodes(outContent);
    var lowerQuery = query.toLowerCase();
    var queryLen   = query.length;

    nodes.forEach(function(tn){ highlightNode(tn, lowerQuery, queryLen); });

    if(!hits.length){
      searchCount.textContent = '0 results';
      searchCount.className   = 'search-count';
      prevBtn.disabled = true;
      nextBtn.disabled = true;
    } else {
      prevBtn.disabled = false;
      nextBtn.disabled = false;
      setActive(0);
    }
  }

  /* hook called by doFormat after output is rebuilt */
  window._searchHook = function(){ if(isOpen && searchInput.value) runSearch(); };

  /* ── event wiring ── */
  searchInput.addEventListener('input', runSearch);
  searchInput.addEventListener('keydown', function(e){
    if(e.key === 'Enter'){
      e.preventDefault();
      setActive(e.shiftKey ? activeIdx - 1 : activeIdx + 1);
    }
    if(e.key === 'Escape'){ e.preventDefault(); closeSearch(); }
  });
  nextBtn.addEventListener('click', function(){ setActive(activeIdx + 1); });
  prevBtn.addEventListener('click', function(){ setActive(activeIdx - 1); });

  /* Ctrl+F / Cmd+F → open search and focus input */
  document.addEventListener('keydown', function(e){
    if((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')){
      e.preventDefault();
      openSearch();
    }
  });
})();

/* ══════════════════════════════════════════
   COL RESIZER — KEYBOARD SUPPORT
══════════════════════════════════════════ */
(function(){
  var handle = $('colResizer');
  handle.addEventListener('keydown', function(e){
    if(window.innerWidth <= 768) return;
    var left  = $('colLeft');
    var right = $('colRight');
    var step  = 20;
    var lw = left.offsetWidth, rw = right.offsetWidth, MIN = 180;
    var nl;
    if(e.key === 'ArrowLeft'){ nl = Math.max(lw - step, MIN); }
    else if(e.key === 'ArrowRight'){ nl = Math.min(lw + step, lw+rw-MIN); }
    else return;
    e.preventDefault();
    left.style.width  = nl + 'px';
    right.style.width = (lw + rw - nl) + 'px';
  });
})();
