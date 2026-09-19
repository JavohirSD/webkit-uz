'use strict';

/* ══════════════════════════════════════════
   XML FORMATTER
   Side-by-side modal, like the JSON formatter:
     • left  — editable raw XML (persisted to localStorage)
     • right — live, syntax-highlighted, line-numbered formatted view
   Left toolbar: Paste · Copy · Minify (in place) · Clear   Right: Copy

   Formatting uses a small tokenizer instead of the DOM, so the source is
   preserved exactly — entities, quote style, XML declaration, DOCTYPE,
   comments and CDATA stay untouched. Only whitespace between markup is
   rewritten, and xml:space="preserve" elements are emitted verbatim.
   Well-formedness is reported separately by the browser's DOMParser, so
   structurally sound fragments (e.g. an unbound namespace prefix) still
   format, with a warning.

   Nothing runs until the modal is opened; typing is debounced (longer for
   large inputs) and the formatted pane keeps its scroll position.

   Reuses global helpers from app.js: $, esc, CFG, copyText, flashBtn,
   pasteInto, safeHTML, openOverlay, closeOverlay. Styles: css/xml.css.
══════════════════════════════════════════ */
(function(){
  'use strict';

  var INDENT            = '  ';
  var LS_INPUT          = 'xml_input';
  var DEBOUNCE_MS       = 150;
  var DEBOUNCE_LARGE_MS = 500;     /* large inputs re-parse less eagerly while typing */
  var LARGE_CHARS       = 50000;
  var STATUS_TEXT = { ok:'✓ Valid XML', warn:'⚠ Not well-formed', err:'✗ Invalid XML' };
  var NAME_START  = /[A-Za-z_:À-￿]/;
  var NON_WS      = /[^ \t\r\n]/;

  /* ── DOM refs ── */
  var overlay  = $('xmlOverlay');
  var input    = $('xmlInput');
  var fmtPane  = $('xmlPaneFmt');
  var outWrap  = $('xmlOutWrap');
  var out      = $('xmlOut');
  var emptyMsg = $('xmlEmpty');
  var statusEl = $('xmlStatus');
  var msgBar   = $('xmlMsg');
  var rawBadge = $('xmlRawBadge');
  var fmtBadge = $('xmlFmtBadge');
  var copyBtn  = $('xmlCopy');

  /* ── state ── */
  var result = null;   /* last successful parse {toks, lines, text} — null when empty/invalid */
  var stale  = true;   /* input changed since the last run() */
  var timer  = null;

  /* ══════════════════════════════════════════
     STRING HELPERS  (index loops, no backtracking regexes on user input)
  ══════════════════════════════════════════ */
  function isWs(c){ return c === 32 || c === 10 || c === 9 || c === 13; }

  function xmlTrim(s){
    var a = 0, b = s.length;
    while(a < b && isWs(s.charCodeAt(a))) a++;
    while(b > a && isWs(s.charCodeAt(b-1))) b--;
    return s.slice(a, b);
  }

  function countLines(s){
    var n = 1, i = -1;
    while((i = s.indexOf('\n', i+1)) !== -1) n++;
    return n;
  }

  function lineCol(src, pos){
    var line = 1, last = -1;
    for(var i=0; i<pos; i++){ if(src.charCodeAt(i) === 10){ line++; last = i; } }
    return { line:line, col:pos-last };
  }

  /* ══════════════════════════════════════════
     TOKENIZER
     Flat token list + tag-balance check.
     Types: open · close · text · comment · cdata · pi · doctype
     Throws an Error carrying .pos (source index) on structural errors.
  ══════════════════════════════════════════ */
  function tokenize(src){
    var toks = [], stack = [], n = src.length, i = 0, c;

    function fail(msg, pos){ var e = new Error(msg); e.pos = pos; throw e; }

    /* index just past the next `end` found at/after `from` */
    function skipPast(end, from, what, start){
      var k = src.indexOf(end, from);
      if(k < 0) fail('Unterminated '+what, start);
      return k + end.length;
    }

    /* <!DOCTYPE …> including an optional [ … ] internal subset */
    function scanDeclaration(s){
      var j = s+2, depth = 0, quote = 0;
      while(j < n){
        c = src.charCodeAt(j);
        if(quote){ if(c === quote) quote = 0; }
        else if(c === 34 || c === 39) quote = c;
        else if(c === 60 && src.startsWith('<!--', j)){ j = skipPast('-->', j+4, 'comment', j); continue; }
        else if(c === 91) depth++;
        else if(c === 93) depth--;
        else if(c === 62 && depth <= 0) return j+1;
        j++;
      }
      fail('Unterminated <! declaration', s);
    }

    /* <name attr="value" …> or <name … /> */
    function scanOpenTag(s){
      var j = s+1;
      while(j < n && !isWs(c = src.charCodeAt(j)) && c !== 62 && c !== 47) j++;
      var name = src.slice(s+1, j);
      if(!name || !NAME_START.test(name.charAt(0))) fail("Unexpected '<' — write a literal < as &lt;", s);
      var tok = { t:'open', name:name, attrs:[], self:false, pos:s };

      for(;;){
        while(j < n && isWs(src.charCodeAt(j))) j++;
        if(j >= n) fail('Unterminated tag <'+name+'>', s);
        c = src.charCodeAt(j);
        if(c === 62){ j++; break; }                                                  /* >  */
        if(c === 47 && src.charCodeAt(j+1) === 62){ tok.self = true; j += 2; break; } /* /> */

        var a = j;
        while(j < n && !isWs(c = src.charCodeAt(j)) && c !== 61 && c !== 62 && c !== 47) j++;
        if(j === a) fail('Malformed attribute in <'+name+'>', j);
        var attr = { n:src.slice(a, j), v:null }, k = j;

        while(k < n && isWs(src.charCodeAt(k))) k++;
        if(src.charCodeAt(k) === 61){                                                /* =  */
          k++;
          while(k < n && isWs(src.charCodeAt(k))) k++;
          var vs = k, q = src.charCodeAt(k);
          if(q === 34 || q === 39){
            k = src.indexOf(src.charAt(vs), vs+1);
            if(k < 0) fail('Unterminated value for attribute '+attr.n, vs);
            k++;
          } else {  /* unquoted — not XML, but tolerated so it can still be formatted */
            while(k < n && !isWs(c = src.charCodeAt(k)) && c !== 62 && !(c === 47 && src.charCodeAt(k+1) === 62)) k++;
            if(k === vs) fail('Missing value for attribute '+attr.n, vs);
          }
          attr.v = src.slice(vs, k);
          j = k;
        }
        if(attr.n === 'xml:space' && /^["']?preserve["']?$/.test(attr.v)) tok.preserve = true;
        tok.attrs.push(attr);
      }

      if(!tok.self) stack.push(toks.length);
      toks.push(tok);
      return j;
    }

    while(i < n){
      var lt = src.indexOf('<', i);
      if(lt < 0) lt = n;
      if(lt > i){
        var txt = src.slice(i, lt);
        toks.push({ t:'text', v:txt, ws:!NON_WS.test(txt) });
        i = lt;
        continue;
      }
      var s = i;
      if(src.startsWith('<!--', s)){
        i = skipPast('-->', s+4, 'comment', s);
        toks.push({ t:'comment', v:src.slice(s, i) });
      } else if(src.startsWith('<![CDATA[', s)){
        i = skipPast(']]>', s+9, 'CDATA section', s);
        toks.push({ t:'cdata', v:src.slice(s, i) });
      } else if(src.startsWith('<?', s)){
        i = skipPast('?>', s+2, 'processing instruction', s);
        toks.push({ t:'pi', v:src.slice(s, i) });
      } else if(src.charCodeAt(s+1) === 33){                                         /* <! */
        i = scanDeclaration(s);
        toks.push({ t:'doctype', v:src.slice(s, i) });
      } else if(src.charCodeAt(s+1) === 47){                                         /* </ */
        i = skipPast('>', s+2, 'closing tag', s);
        var name = xmlTrim(src.slice(s+2, i-1));
        if(!stack.length) fail('Unexpected closing tag </'+name+'>', s);
        var open = toks[stack.pop()];
        if(open.name !== name) fail('Closing tag </'+name+'> does not match <'+open.name+'>', s);
        open.match = toks.length;
        toks.push({ t:'close', name:name });
      } else {
        i = scanOpenTag(s);
      }
    }

    if(stack.length){
      var unclosed = toks[stack[stack.length-1]];
      fail('Unclosed tag <'+unclosed.name+'>', unclosed.pos);
    }
    if(!toks.some(function(t){ return t.t === 'open'; })) fail('No XML element found', 0);
    return toks;
  }

  /* ══════════════════════════════════════════
     SERIALIZER
     walk() emits one item per logical line: emit(depth, segments),
     where a segment is [cssClass|null, text].
       pretty=true  → indented lines (formatted pane)
       pretty=false → whitespace between markup dropped (Minify)
  ══════════════════════════════════════════ */
  function tagSegs(tk){
    var segs = [['punc','<'], ['tag',tk.name]];
    tk.attrs.forEach(function(a){
      segs.push([null,' '], ['attr',a.n]);
      if(a.v !== null) segs.push(['punc','='], ['val',a.v]);
    });
    segs.push(['punc', tk.self ? '/>' : '>']);
    return segs;
  }

  function closeSegs(tk){ return [['punc','</'], ['tag',tk.name], ['punc','>']]; }

  /* entity references (&amp; &#169;) are highlighted separately */
  function textSegs(str){
    var segs = [];
    str.split(/(&#?[\w.:-]{1,32};)/).forEach(function(part, idx){
      if(part) segs.push([idx % 2 ? 'ent' : null, part]);
    });
    return segs;
  }

  function verbatimSegs(tk){
    if(tk.t === 'open')  return tagSegs(tk);
    if(tk.t === 'close') return closeSegs(tk);
    if(tk.t === 'text')  return textSegs(tk.v);
    return [[tk.t, tk.v]];
  }

  function nextSignificant(toks, k){
    while(k < toks.length && toks[k].t === 'text' && toks[k].ws) k++;
    return k;
  }
  function prevSignificant(toks, k){
    while(k >= 0 && toks[k].t === 'text' && toks[k].ws) k--;
    return k;
  }

  /* Text token → output lines.
     Pretty: one trimmed line per source line.
     Minify: whitespace runs collapsed; edges trimmed only next to the
     parent's own tags, so "Hello <b>World</b>!" keeps its spaces. */
  function textLines(toks, k, pretty){
    var v = toks[k].v;
    if(pretty) return v.split('\n').map(xmlTrim).filter(Boolean);
    v = v.replace(/[ \t\r\n]+/g, ' ');
    var prev = toks[prevSignificant(toks, k-1)], next = toks[nextSignificant(toks, k+1)];
    if(!prev || (prev.t === 'open' && !prev.self)) v = v.replace(/^ /, '');
    if(!next || next.t === 'close') v = v.replace(/ $/, '');
    return [v];
  }

  function walk(toks, pretty, emit){
    var depth = 0;
    for(var k=0; k<toks.length; k++){
      var tk = toks[k];

      if(tk.t === 'text'){
        if(!tk.ws) textLines(toks, k, pretty).forEach(function(l){ emit(depth, textSegs(l)); });
        continue;
      }
      if(tk.t === 'close'){
        depth--;
        emit(depth, closeSegs(tk));
        continue;
      }
      if(tk.t !== 'open'){                             /* comment · cdata · pi · doctype */
        emit(depth, [[tk.t, tk.v]]);
        continue;
      }

      var segs = tagSegs(tk);
      if(tk.self){ emit(depth, segs); continue; }

      if(tk.preserve){                                 /* xml:space="preserve" — contents untouched */
        for(var m=k+1; m<tk.match; m++) segs = segs.concat(verbatimSegs(toks[m]));
        emit(depth, segs.concat(closeSegs(toks[tk.match])));
        k = tk.match;
        continue;
      }

      /* keep <a></a> and <a>short text</a> on one line */
      var a = nextSignificant(toks, k+1), child = toks[a];
      if(a === tk.match){
        emit(depth, segs.concat(closeSegs(child)));
        k = a;
        continue;
      }
      if(nextSignificant(toks, a+1) === tk.match){
        var inner = null;
        if(child.t === 'text'){
          var tl = textLines(toks, a, pretty);
          if(tl.length === 1) inner = textSegs(tl[0]);
        } else if(child.t === 'cdata' && child.v.indexOf('\n') < 0){
          inner = [['cdata', child.v]];
        }
        if(inner){
          emit(depth, segs.concat(inner, closeSegs(toks[tk.match])));
          k = tk.match;
          continue;
        }
      }

      emit(depth, segs);
      depth++;
    }
  }

  /* Pretty-print → array of display lines, each an array of segments */
  function formatLines(toks){
    var lines = [];
    walk(toks, true, function(depth, segs){
      var line = depth > 0 ? [[null, INDENT.repeat(depth)]] : [];
      for(var s=0; s<segs.length; s++){
        var parts = segs[s][1].split('\n');   /* multi-line comments / preserved text */
        for(var p=0; p<parts.length; p++){
          if(p > 0){ lines.push(line); line = []; }
          if(parts[p]) line.push([segs[s][0], parts[p]]);
        }
      }
      lines.push(line);
    });
    return lines;
  }

  function minifyText(toks){
    var parts = [];
    walk(toks, false, function(depth, segs){
      for(var s=0; s<segs.length; s++) parts.push(segs[s][1]);
    });
    return parts.join('');
  }

  function lineText(line){
    var t = '';
    for(var s=0; s<line.length; s++) t += line[s][1];
    return t;
  }

  /* One <div> per line; --xi is the leading indent (ch) used for a hanging indent when a line wraps */
  function lineHtml(line){
    var html = '', indent = 0, leading = true;
    for(var s=0; s<line.length; s++){
      var cls = line[s][0], t = line[s][1];
      for(var i=0; leading && i<t.length; i++){
        var ch = t.charCodeAt(i);
        if(ch === 32) indent++;
        else if(ch === 9) indent += 2;
        else leading = false;
      }
      html += cls ? '<span class="xh-'+cls+'">'+esc(t)+'</span>' : esc(t);
    }
    return '<div class="xml-ln"'+(indent ? ' style="--xi:'+indent+'"' : '')+'>'+html+'</div>';
  }

  /* ══════════════════════════════════════════
     WELL-FORMEDNESS  (native DOMParser)
     Returns null when valid, else {line, col, msg}.
       Blink/WebKit: <div>"error on line 3 at column 7: <msg>"</div> inside <parsererror>
       Gecko:        "XML Parsing Error: <msg> … Line Number 3, Column 7:"
  ══════════════════════════════════════════ */
  var errorNs;  /* namespace of <parsererror>, detected on first use */
  function checkWellFormed(src){
    if(typeof DOMParser === 'undefined') return null;
    var parser = new DOMParser();
    if(errorNs === undefined){
      var probe = parser.parseFromString('<', 'application/xml').getElementsByTagName('parsererror')[0];
      errorNs = probe ? probe.namespaceURI : null;
    }
    var doc  = parser.parseFromString(src, 'application/xml');
    var errs = errorNs ? doc.getElementsByTagNameNS(errorNs, 'parsererror') : doc.getElementsByTagName('parsererror');
    if(!errs.length) return null;

    /* read only the message <div> where present — the element's full text runs into its headings */
    var detail = errs[0].querySelector('div');
    var text = (detail || errs[0]).textContent || '';
    var m = text.match(/line (\d+) at column (\d+):\s*([^\n]+)/i);
    if(m) return { line:+m[1], col:+m[2], msg:m[3].trim() };
    m = text.match(/Line Number (\d+), Column (\d+)/i);
    return {
      line: m ? +m[1] : 0,
      col:  m ? +m[2] : 0,
      msg:  text.replace(/^XML Parsing Error:\s*/i, '').split('\n')[0].trim() || 'Invalid XML'
    };
  }

  /* ══════════════════════════════════════════
     PIPELINE
  ══════════════════════════════════════════ */
  function describe(p){ return (p.line ? 'Line '+p.line+', col '+p.col+': ' : '') + p.msg; }

  function setBadge(el, lines){
    el.textContent = lines ? lines.toLocaleString()+(lines === 1 ? ' line' : ' lines') : '—';
  }

  function setStatus(kind, msg){
    statusEl.className   = 'xml-status' + (kind ? ' '+kind : '');
    statusEl.textContent = STATUS_TEXT[kind] || '';
    msgBar.className     = 'xml-msg' + (msg ? ' '+kind : '');
    msgBar.textContent   = msg || '';
    if(kind === 'err') input.setAttribute('aria-invalid', 'true');
    else               input.removeAttribute('aria-invalid');
  }

  function run(){
    clearTimeout(timer); timer = null;
    stale = false; result = null;

    var src = input.value.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    setBadge(rawBadge, src ? countLines(src) : 0);
    setBadge(fmtBadge, 0);

    if(!NON_WS.test(src)){
      setStatus('', '');
    } else if(src.length > CFG.MAX_XML_CHARS){
      setStatus('err', 'Input exceeds '+CFG.MAX_XML_CHARS.toLocaleString()+' characters.');
    } else {
      var problem = checkWellFormed(src);
      try{
        var toks  = tokenize(src);
        var lines = formatLines(toks);
        result = { toks:toks, lines:lines, text:null };
        setBadge(fmtBadge, lines.length);
        setStatus(problem ? 'warn' : 'ok', problem ? describe(problem) : '');
      }catch(e){
        /* prefer the native parser's message; fall back to the tokenizer's */
        if(!problem){
          problem = e.pos !== undefined ? lineCol(src, e.pos) : { line:0, col:0 };
          problem.msg = e.message;
        }
        setStatus('err', describe(problem));
      }
    }
    paint();
  }

  /* run() + persist the input. Used by the typing debounce, the toolbar, and
     wherever pending input must be processed early (copy, open). */
  function commit(){
    run();
    try{
      if(input.value) localStorage.setItem(LS_INPUT, input.value);
      else            localStorage.removeItem(LS_INPUT);
    }catch(e){}
  }

  /* repaint the formatted pane; its scroll position is kept so live editing doesn't jump */
  function paint(){
    fmtPane.classList.toggle('is-empty', !result);
    if(!result){
      out.textContent = '';
      emptyMsg.textContent = NON_WS.test(input.value)
        ? 'Fix the error above to see the formatted XML.'
        : 'Formatted XML will appear here.';
      return;
    }
    outWrap.style.setProperty('--xml-digits', Math.max(2, String(result.lines.length).length));
    safeHTML(out, result.lines.map(lineHtml).join(''));
  }

  function formattedText(){
    if(stale) commit();
    if(!result) return '';
    if(result.text === null) result.text = result.lines.map(lineText).join('\n');
    return result.text;
  }

  /* ══════════════════════════════════════════
     TOOLBARS
  ══════════════════════════════════════════ */
  $('xmlPaste').addEventListener('click', function(){
    var btn = this;
    pasteInto(input,
      function(){ flashBtn(btn, 'Pasted!'); },
      /* clipboard blocked — leave the input focused + selected so Ctrl+V works */
      function(){ input.focus(); input.select(); });
  });

  $('xmlCopyRaw').addEventListener('click', function(){
    if(!input.value) return;
    copyText(input.value);
    flashBtn(this, 'Copied!');
  });

  copyBtn.addEventListener('click', function(){
    var text = formattedText();
    if(!text) return;
    copyText(text);
    flashBtn(copyBtn, 'Copied!');
  });

  $('xmlMinify').addEventListener('click', function(){
    if(stale) commit();
    if(!result) return;                 /* empty or invalid — the message bar already says why */
    var before = input.value.length;
    input.value = minifyText(result.toks);
    var pct = before ? Math.round((1 - input.value.length / before) * 100) : 0;
    commit();
    flashBtn(this, pct > 0 ? 'Minified −'+pct+'%' : 'Minified');
  });

  $('xmlClear').addEventListener('click', function(){
    input.value = '';
    commit();
    outWrap.scrollTop = 0;
    input.focus();
  });

  input.addEventListener('input', function(){
    stale = true;
    clearTimeout(timer);
    timer = setTimeout(commit, input.value.length > LARGE_CHARS ? DEBOUNCE_LARGE_MS : DEBOUNCE_MS);
  });

  /* ══════════════════════════════════════════
     OPEN / CLOSE
  ══════════════════════════════════════════ */
  /* focus the editor on desktop only — on touch devices it would pop the keyboard */
  var FINE_POINTER = !!(window.matchMedia && window.matchMedia('(pointer: fine)').matches);

  function openXml(){
    openOverlay('xmlOverlay', FINE_POINTER ? 'xmlInput' : 'xmlClose');
    if(stale) commit();
  }
  function closeXml(){ closeOverlay('xmlOverlay'); }

  $('xmlBtn').addEventListener('click', openXml);
  $('xmlClose').addEventListener('click', closeXml);
  overlay.addEventListener('click', function(e){ if(e.target === this) closeXml(); });

  /* ══════════════════════════════════════════
     INIT  (restore only — parsing waits until the modal opens)
  ══════════════════════════════════════════ */
  input.maxLength = CFG.MAX_XML_CHARS;
  try{ var savedInput = localStorage.getItem(LS_INPUT); if(savedInput) input.value = savedInput; }catch(e){}
})();
