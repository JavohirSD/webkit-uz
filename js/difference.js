'use strict';

/* ══════════════════════════════════════════
   TEXT DIFF ANALYZER
══════════════════════════════════════════ */
(function(){
'use strict';

/* ── DOM refs ── */
var diffOrigTa    = $('diffOrigTa');
var diffChgdTa    = $('diffChgdTa');
var diffOrigHL    = $('diffOrigHL');
var diffChgdHL    = $('diffChgdHL');
var diffOrigLnums = $('diffOrigLnums');
var diffChgdLnums = $('diffChgdLnums');
var diffOrigInfo  = $('diffOrigInfo');
var diffChgdInfo  = $('diffChgdInfo');
var diffStatTotal = $('diffStatTotal');
var diffStatAdd   = $('diffStatAdd');
var diffStatDel   = $('diffStatDel');
var diffStatChg   = $('diffStatChg');
var diffStatOrig  = $('diffStatOrig');
var diffStatChgd  = $('diffStatChgd');
var diffStatSep1  = $('diffStatSep1');
var diffStatSep2  = $('diffStatSep2');

/* ── Constants: MUST match CSS values exactly ──
   .diff-hl  → font-size:14px  line-height:1.65  padding-h:13px
   .diff-lnums → width:54px                                       */
var DIFF_FONT_PX  = 14;      /* px — .diff-hl font-size           */
var DIFF_LINE_H   = 1.65;    /* .diff-hl line-height ratio        */
var DIFF_LNUMS_W  = 54;      /* px — .diff-lnums width            */
var DIFF_HL_PAD   = 26;      /* px — total horizontal padding (13px × 2) */
var DIFF_MAX_CHARS = 100000; /* per-input character limit         */

/* ── Canvas for precise text-width measurement ── */
var _mc = document.createElement('canvas');
var _mctx = _mc.getContext('2d');
var _diffFont = DIFF_FONT_PX + 'px "JetBrains Mono", Consolas, "Courier New", monospace';
_mctx.font = _diffFont;

/* Re-measure after web fonts load (avoids fallback-font measurements) */
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(function() {
    _mctx.font = _diffFont;
    scheduleDiff();
  });
}

/* ── Available text width (updated by ResizeObserver) ── */
var _origAvailW = 0;
var _chgdAvailW = 0;

function _calcAvailW(scrollEl) {
  /* clientWidth excludes scrollbar; subtract lnums + horizontal padding */
  return Math.max(1, scrollEl.clientWidth - DIFF_LNUMS_W - DIFF_HL_PAD);
}

/* How many visual rows does a single logical line occupy? */
function visualRows(line, availW) {
  if (!line || availW <= 0) return 1;
  _mctx.font = _diffFont; /* ensure font is set */
  var w = _mctx.measureText(line).width;
  return Math.max(1, Math.ceil(w / availW));
}

/* ResizeObserver — keeps available-width in sync with actual layout */
if (window.ResizeObserver) {
  var _ro = new ResizeObserver(function(entries) {
    var changed = false;
    entries.forEach(function(e) {
      if (e.target.id === 'diffOrigScroll') {
        var nw = _calcAvailW(e.target); if (nw !== _origAvailW) { _origAvailW = nw; changed = true; }
      } else if (e.target.id === 'diffChgdScroll') {
        var nw = _calcAvailW(e.target); if (nw !== _chgdAvailW) { _chgdAvailW = nw; changed = true; }
      }
    });
    if (changed) scheduleDiff();
  });
  _ro.observe($('diffOrigScroll'));
  _ro.observe($('diffChgdScroll'));
}

/* ── Core LCS diff (works on any array of values) ── */
function lcsOps(a, b) {
  var m = a.length, n = b.length;
  if (m === 0 && n === 0) return [];
  if (m === 0) return b.map(function(v){ return {t:'i', v:v}; });
  if (n === 0) return a.map(function(v){ return {t:'d', v:v}; });

  var dp = new Uint32Array((m+1)*(n+1));
  var stride = n + 1, i, j;
  for (i = 1; i <= m; i++) {
    for (j = 1; j <= n; j++) {
      if (a[i-1] === b[j-1]) {
        dp[i*stride+j] = dp[(i-1)*stride+(j-1)] + 1;
      } else {
        var u = dp[(i-1)*stride+j], l = dp[i*stride+(j-1)];
        dp[i*stride+j] = u > l ? u : l;
      }
    }
  }
  var ops = []; i = m; j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i-1] === b[j-1]) {
      ops.push({t:'e', v:a[i-1]}); i--; j--;
    } else if (j > 0 && (i===0 || dp[i*stride+(j-1)] >= dp[(i-1)*stride+j])) {
      ops.push({t:'i', v:b[j-1]}); j--;
    } else {
      ops.push({t:'d', v:a[i-1]}); i--;
    }
  }
  ops.reverse();
  return ops;
}

/* ── Group consecutive delete+insert sequences into replace blocks ── */
function groupOps(ops) {
  var groups = [], k = 0, len = ops.length;
  while (k < len) {
    var op = ops[k];
    if (op.t === 'e') {
      groups.push({t:'eq', line: op.v}); k++;
    } else if (op.t === 'd') {
      var dels = [];
      while (k < len && ops[k].t === 'd') { dels.push(ops[k].v); k++; }
      var ins = [];
      while (k < len && ops[k].t === 'i') { ins.push(ops[k].v); k++; }
      if (ins.length > 0) {
        groups.push({t:'rp', dels:dels, ins:ins});
      } else {
        for (var di=0; di<dels.length; di++) groups.push({t:'del', line:dels[di]});
      }
    } else {
      groups.push({t:'ins', line: op.v}); k++;
    }
  }
  return groups;
}

/* ── Character-level diff for inline highlights ── */
function charDiff(a, b) {
  if (a.length + b.length > 800) return null;
  var ops = lcsOps(a.split(''), b.split(''));
  var merged = [];
  for (var k=0; k<ops.length; k++) {
    var op = ops[k];
    if (merged.length && merged[merged.length-1].t === op.t) merged[merged.length-1].v += op.v;
    else merged.push({t:op.t, v:op.v});
  }
  return merged;
}

function renderCharOrig(line, cOps) {
  if (!cOps) return '<span class="dhl-char-del">' + esc(line) + '</span>';
  var h = '';
  for (var k=0; k<cOps.length; k++) {
    var op = cOps[k];
    if      (op.t === 'e') h += esc(op.v);
    else if (op.t === 'd') h += '<span class="dhl-char-del">' + esc(op.v) + '</span>';
  }
  return h;
}

function renderCharChgd(line, cOps) {
  if (!cOps) return '<span class="dhl-char-add">' + esc(line) + '</span>';
  var h = '';
  for (var k=0; k<cOps.length; k++) {
    var op = cOps[k];
    if      (op.t === 'e') h += esc(op.v);
    else if (op.t === 'i') h += '<span class="dhl-char-add">' + esc(op.v) + '</span>';
  }
  return h;
}

/* ── Build rendered HTML for one pane.
   availW: usable pixel width for text (used for visual-row wrap counting). ── */
function buildPane(groups, side, availW) {
  var lnHtml = '', hlHtml = '', ln = 0;

  /* Helper: emit line-number spans including visual continuation rows */
  function emitLnums(lnClass, line) {
    ln++;
    var vr = visualRows(line, availW);
    lnHtml += '<span class="' + lnClass + '">' + ln + '</span>';
    for (var r = 1; r < vr; r++) {
      lnHtml += '<span class="' + lnClass + ' dln-cont">↵</span>';
    }
  }

  for (var k=0; k<groups.length; k++) {
    var g = groups[k];

    if (g.t === 'eq') {
      emitLnums('dln-eq', g.line);
      hlHtml += '<span class="dhl-eq">' + esc(g.line) + '\n</span>';

    } else if (g.t === 'del') {
      if (side === 'orig') {
        emitLnums('dln-del', g.line);
        hlHtml += '<span class="dhl-del">' + esc(g.line) + '\n</span>';
      }

    } else if (g.t === 'ins') {
      if (side === 'chgd') {
        emitLnums('dln-add', g.line);
        hlHtml += '<span class="dhl-add">' + esc(g.line) + '\n</span>';
      }

    } else if (g.t === 'rp') {
      var lines    = side === 'orig' ? g.dels : g.ins;
      var partners = side === 'orig' ? g.ins  : g.dels;
      var cls      = side === 'orig' ? 'dln-chg' : 'dln-chg';
      for (var li=0; li<lines.length; li++) {
        emitLnums(cls, lines[li]);
        var partner  = partners[li] !== undefined ? partners[li] : '';
        var cOps     = side === 'orig' ? charDiff(lines[li], partner) : charDiff(partner, lines[li]);
        var rendered = side === 'orig' ? renderCharOrig(lines[li], cOps) : renderCharChgd(lines[li], cOps);
        hlHtml += '<span class="dhl-chg">' + rendered + '\n</span>';
      }
    }
  }
  return {lnHtml: lnHtml, hlHtml: hlHtml};
}

/* ── Reset a pane to its empty/placeholder state ── */
function resetPane(hlEl, lnEl, phText) {
  safeHTML(hlEl, '<span class="dhl-eq diff-hl-ph">' + esc(phText) + '</span>');
  safeHTML(lnEl, '<span class="dln-eq">1</span>');
}

/* ── Render a pane in read-only plain mode (no diff, just numbered lines) ── */
function renderPlain(text, hlEl, lnEl, availW) {
  var lines = text.split('\n');
  var lnHtml = '', hlHtml = '', ln = 0;
  for (var i=0; i<lines.length; i++) {
    ln++;
    var vr = visualRows(lines[i], availW);
    lnHtml += '<span class="dln-eq">' + ln + '</span>';
    for (var r=1; r<vr; r++) lnHtml += '<span class="dln-eq dln-cont">↵</span>';
    hlHtml += '<span class="dhl-eq">' + esc(lines[i]) + '\n</span>';
  }
  safeHTML(hlEl, hlHtml || '<span class="dhl-eq diff-hl-ph">…</span>');
  safeHTML(lnEl, lnHtml || '<span class="dln-eq">1</span>');
}

/* ── Main diff runner ── */
var _diffTimer = null;

function runDiff() {
  /* Seed available widths on first run if ResizeObserver hasn't fired yet */
  if (!_origAvailW) _origAvailW = _calcAvailW($('diffOrigScroll'));
  if (!_chgdAvailW) _chgdAvailW = _calcAvailW($('diffChgdScroll'));

  var origText = diffOrigTa.value;
  var chgdText = diffChgdTa.value;

  /* Enforce per-input character limit (truncate silently if pasted over) */
  if (origText.length > DIFF_MAX_CHARS) {
    origText = origText.slice(0, DIFF_MAX_CHARS);
    diffOrigTa.value = origText;
  }
  if (chgdText.length > DIFF_MAX_CHARS) {
    chgdText = chgdText.slice(0, DIFF_MAX_CHARS);
    diffChgdTa.value = chgdText;
  }

  /* Per-pane counters */
  var origLineCount = origText.length ? origText.split('\n').length : 0;
  var chgdLineCount = chgdText.length ? chgdText.split('\n').length : 0;
  diffOrigInfo.textContent = origText.length + ' chars · ' + origLineCount + ' line' + (origLineCount !== 1 ? 's' : '');
  diffChgdInfo.textContent = chgdText.length + ' chars · ' + chgdLineCount + ' line' + (chgdLineCount !== 1 ? 's' : '');
  diffStatOrig.textContent = 'Original: ' + origText.length + ' / ' + DIFF_MAX_CHARS + ' chars';
  diffStatChgd.textContent = 'Changed: '  + chgdText.length + ' / ' + DIFF_MAX_CHARS + ' chars';

  /* ── FIX 4: Only diff when BOTH inputs have content ── */
  if (!origText.length && !chgdText.length) {
    /* Both empty — full placeholder state */
    resetPane(diffOrigHL, diffOrigLnums, 'Paste original text here…');
    resetPane(diffChgdHL, diffChgdLnums, 'Paste changed text here…');
    diffStatTotal.textContent = 'Paste text in both panels to begin';
    diffStatSep1.style.display = diffStatSep2.style.display = 'none';
    diffStatAdd.style.display  = diffStatDel.style.display  = diffStatChg.style.display = 'none';
    return;
  }

  if (!origText.length) {
    /* Only original is empty */
    resetPane(diffOrigHL, diffOrigLnums, 'Paste original text here…');
    renderPlain(chgdText, diffChgdHL, diffChgdLnums, _chgdAvailW);
    diffStatTotal.textContent = 'Enter text in the Original panel to compare';
    diffStatSep1.style.display = diffStatSep2.style.display = 'none';
    diffStatAdd.style.display  = diffStatDel.style.display  = diffStatChg.style.display = 'none';
    return;
  }

  if (!chgdText.length) {
    /* Only changed is empty */
    renderPlain(origText, diffOrigHL, diffOrigLnums, _origAvailW);
    resetPane(diffChgdHL, diffChgdLnums, 'Paste changed text here…');
    diffStatTotal.textContent = 'Enter text in the Changed panel to compare';
    diffStatSep1.style.display = diffStatSep2.style.display = 'none';
    diffStatAdd.style.display  = diffStatDel.style.display  = diffStatChg.style.display = 'none';
    return;
  }

  /* Both panels have content — run the diff */
  var origLines = origText.split('\n');
  var chgdLines = chgdText.split('\n');

  /* Performance guard */
  if (origLines.length > 3000 || chgdLines.length > 3000) {
    renderPlain(origText, diffOrigHL, diffOrigLnums, _origAvailW);
    renderPlain(chgdText, diffChgdHL, diffChgdLnums, _chgdAvailW);
    diffStatTotal.textContent = '⚠ Input exceeds 3,000 lines — diff skipped, showing plain text';
    diffStatSep1.style.display = diffStatSep2.style.display = 'none';
    diffStatAdd.style.display  = diffStatDel.style.display  = diffStatChg.style.display = 'none';
    return;
  }

  var lineOps = lcsOps(origLines, chgdLines);
  var groups  = groupOps(lineOps);

  /* Count change categories */
  var adds = 0, dels = 0, chgs = 0;
  for (var k=0; k<groups.length; k++) {
    var g = groups[k];
    if      (g.t === 'ins') adds++;
    else if (g.t === 'del') dels++;
    else if (g.t === 'rp')  chgs += Math.max(g.dels.length, g.ins.length);
  }
  var total = adds + dels + chgs;

  /* Update stats bar */
  diffStatTotal.textContent = total === 0
    ? '✓ Identical — no differences found'
    : total + ' change' + (total !== 1 ? 's' : '');
  var hasCounts = total > 0;
  diffStatSep1.style.display = diffStatSep2.style.display = hasCounts ? '' : 'none';
  if (adds > 0) { diffStatAdd.textContent = '+ ' + adds + ' added';   diffStatAdd.style.display = ''; }
  else            diffStatAdd.style.display = 'none';
  if (dels > 0) { diffStatDel.textContent = '− ' + dels + ' deleted'; diffStatDel.style.display = ''; }
  else            diffStatDel.style.display = 'none';
  if (chgs > 0) { diffStatChg.textContent = '~ ' + chgs + ' changed'; diffStatChg.style.display = ''; }
  else            diffStatChg.style.display = 'none';

  /* Render both panes */
  var origPane = buildPane(groups, 'orig', _origAvailW);
  var chgdPane = buildPane(groups, 'chgd', _chgdAvailW);

  safeHTML(diffOrigHL,    origPane.hlHtml || '<span class="dhl-eq diff-hl-ph">…</span>');
  safeHTML(diffChgdHL,    chgdPane.hlHtml || '<span class="dhl-eq diff-hl-ph">…</span>');
  safeHTML(diffOrigLnums, origPane.lnHtml || '<span class="dln-eq">1</span>');
  safeHTML(diffChgdLnums, chgdPane.lnHtml || '<span class="dln-eq">1</span>');
}

function scheduleDiff() {
  clearTimeout(_diffTimer);
  _diffTimer = setTimeout(runDiff, 120);
}

/* ── Input listeners (real-time) ── */
diffOrigTa.addEventListener('input', scheduleDiff);
diffChgdTa.addEventListener('input', scheduleDiff);

/* ── Tab key support ── */
function insertTab(ta) {
  var s = ta.selectionStart, e = ta.selectionEnd;
  ta.value = ta.value.substring(0, s) + '  ' + ta.value.substring(e);
  ta.selectionStart = ta.selectionEnd = s + 2;
  scheduleDiff();
}
diffOrigTa.addEventListener('keydown', function(e){ if(e.key==='Tab'){e.preventDefault();insertTab(this);} });
diffChgdTa.addEventListener('keydown', function(e){ if(e.key==='Tab'){e.preventDefault();insertTab(this);} });

/* ── Copy / Paste / Clear buttons ── */
function wireDiffCopy(btnId, ta) {
  $(btnId).addEventListener('click', function() {
    if (ta.value) { copyText(ta.value); flashBtn(this, 'Copied!'); }
  });
}
function wireDiffPaste(btnId, ta) {
  $(btnId).addEventListener('click', function() {
    var btn = this;
    if (navigator.clipboard && navigator.clipboard.readText) {
      navigator.clipboard.readText().then(function(text) {
        /* Enforce limit on paste */
        ta.value = text.length > DIFF_MAX_CHARS ? text.slice(0, DIFF_MAX_CHARS) : text;
        scheduleDiff();
        flashBtn(btn, 'Pasted!');
      }).catch(function() { ta.focus(); });
    } else { ta.focus(); }
  });
}
function wireDiffClear(btnId, ta) {
  $(btnId).addEventListener('click', function() {
    ta.value = '';
    scheduleDiff();
    ta.focus();
  });
}

wireDiffCopy('diffOrigCopy',   diffOrigTa);
wireDiffPaste('diffOrigPaste', diffOrigTa);
wireDiffClear('diffOrigClear', diffOrigTa);
wireDiffCopy('diffChgdCopy',   diffChgdTa);
wireDiffPaste('diffChgdPaste', diffChgdTa);
wireDiffClear('diffChgdClear', diffChgdTa);

/* ── Open / close ── */
function openDiff()  { openOverlay('diffOverlay', 'diffClose'); }
function closeDiff() { closeOverlay('diffOverlay'); }
$('diffBtn').addEventListener('click',     openDiff);
$('diffClose').addEventListener('click',   closeDiff);
$('diffOverlay').addEventListener('click', function(e){ if (e.target === this) closeDiff(); });

/* Initialise */
runDiff();

})(); /* end text-diff IIFE */
