'use strict';

/* ══════════════════════════════════════════
   CRON EXPRESSION BUILDER  (Time modal → "Cron" tab)
   Two-way editor for standard 5-field crontab schedules:
       minute  hour  day-of-month  month  day-of-week
     • builder controls → expression (regenerated on every change)
     • typed expression → builder controls (the typed text is never rewritten)
   Also shows a plain-English description and the next run times in the
   device timezone.

   Understands @yearly/@annually/@monthly/@weekly/@daily/@midnight/@hourly,
   month and weekday names (JAN, MON…), 7 as Sunday and ? as *.
   Day matching follows Vixie cron: when day-of-month and day-of-week are
   both restricted, a run happens if EITHER matches.

   Tab switching lives in time.js; styles in css/cron.css.
   Reuses global helpers from app.js: $, pad, copyText, flashBtn.
══════════════════════════════════════════ */
(function(){
  'use strict';

  var LS_EXPR      = 'cron_expr';
  var DEFAULT_EXPR = '0 9 * * 1-5';

  var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

  var MACROS = {
    '@yearly':'0 0 1 1 *', '@annually':'0 0 1 1 *', '@monthly':'0 0 1 * *',
    '@weekly':'0 0 * * 0', '@daily':'0 0 * * *', '@midnight':'0 0 * * *', '@hourly':'0 * * * *'
  };

  /* One entry per field, in expression order.
     names: full names indexed from `min` · order: chip display order
     step / range: defaults used when the user switches to that mode */
  var FIELDS = [
    { key:'minute', title:'Minute',       legend:'minute',  min:0, max:59, unit:'minute', step:5, range:[0,29],
      modes:['every','interval','specific','range'] },
    { key:'hour',   title:'Hour',         legend:'hour',    min:0, max:23, unit:'hour',   step:2, range:[9,17],
      modes:['every','interval','specific','range'] },
    { key:'dom',    title:'Day of month', legend:'day',     min:1, max:31, unit:'day',    step:2, range:[1,15],
      modes:['every','interval','specific','range'] },
    { key:'month',  title:'Month',        legend:'month',   min:1, max:12, unit:'month',  step:3, range:[1,12],
      modes:['every','interval','specific'], names:MONTHS },
    { key:'dow',    title:'Day of week',  legend:'weekday', min:0, max:6,  unit:'day',    step:1, range:[1,5],
      modes:['every','specific'], names:DAYS, order:[1,2,3,4,5,6,0] }
  ];

  function hasMode(f, mode){ return f.modes.indexOf(mode) !== -1; }

  /* ══════════════════════════════════════════
     PARSER
     parse(text) → array of 5 {text, star, values[], mode, step, start, from, to}
     Throws an Error; field-level errors carry .field (index).
  ══════════════════════════════════════════ */
  var ITEM_RE = /^(\*|[^-\/]+)(?:-([^-\/]+))?(?:\/(\d+))?$/;

  function fieldError(i, msg){
    var e = new Error(FIELDS[i].title+': '+msg);
    e.field = i;
    return e;
  }

  /* "5", "MON", "jan" → number. Weekday 7 is kept here so "5-7" still works. */
  function toNumber(tok, i){
    var f = FIELDS[i], max = f.key === 'dow' ? 7 : f.max, n = -1;
    if(/^\d+$/.test(tok)){
      n = parseInt(tok, 10);
    } else if(f.names){
      for(var k=0; k<f.names.length; k++){
        if(f.names[k].slice(0, 3).toUpperCase() === tok.toUpperCase()){ n = k + f.min; break; }
      }
      if(n < 0) throw fieldError(i, '"'+tok+'" is not a valid name');
    } else {
      throw fieldError(i, '"'+tok+'" is not a number');
    }
    if(n < f.min || n > max) throw fieldError(i, tok+' is out of range '+f.min+'–'+max);
    return n;
  }

  function parseField(text, i){
    var f = FIELDS[i], set = {};
    if(text === '?') text = '*';
    if(/#|(^|,)(L|LW|\d+[LW])(,|$)/i.test(text)) throw fieldError(i, 'L, W and # are not supported by standard cron');

    text.split(',').forEach(function(item){
      if(!item) throw fieldError(i, 'empty value in the list');
      var m = item.match(ITEM_RE);
      if(!m || (m[1] === '*' && m[2] !== undefined)) throw fieldError(i, '"'+item+'" is not valid');
      var inc = m[3] !== undefined ? parseInt(m[3], 10) : 1;
      if(inc < 1) throw fieldError(i, 'step must be 1 or more');
      var lo = m[1] === '*' ? f.min : toNumber(m[1], i);
      var hi = m[1] === '*'         ? f.max
             : m[2] !== undefined   ? toNumber(m[2], i)
             : m[3] !== undefined   ? f.max
             : lo;
      if(lo > hi) throw fieldError(i, item+' runs backwards');
      for(var v=lo; v<=hi; v+=inc) set[f.key === 'dow' ? v % 7 : v] = true;
    });

    var res = {
      text:   text,
      star:   text.charAt(0) === '*',           /* Vixie day rule looks at a leading * */
      values: Object.keys(set).map(Number).sort(function(a, b){ return a - b; }),
      mode:   'specific'
    };

    /* friendliest builder mode for a single, simple item */
    var one = text.indexOf(',') < 0 ? text.match(ITEM_RE) : null;
    if(text === '*'){
      res.mode = 'every';
    } else if(one){
      var from = one[1] === '*' ? f.min : toNumber(one[1], i);
      var to   = one[2] !== undefined ? toNumber(one[2], i) : null;
      var step = one[3] !== undefined ? parseInt(one[3], 10) : 0;
      if(step && hasMode(f, 'interval') && (to === null || to === f.max) && step <= f.max - f.min){
        res.mode = 'interval'; res.step = step; res.start = from;
      } else if(!step && to !== null && hasMode(f, 'range')){
        res.mode = 'range'; res.from = from; res.to = to;
      }
    }
    return res;
  }

  var NAME_ABBR = MONTHS.concat(DAYS).map(function(n){ return n.slice(0, 3).toUpperCase(); });

  /* could this token be a cron field? "*", "0-5/2", "MON-FRI" → yes · "php", "/usr/bin/x" → no */
  function looksLikeField(tok){
    return /^[\d*?,\/-]+$/.test(tok) ||
      tok.split(/[,\/-]/).every(function(p){ return NAME_ABBR.indexOf(p.toUpperCase()) !== -1; });
  }

  /* Accepts a bare schedule or a full crontab line — anything after the 5 fields
     (the command) is ignored. Returns the 5 parsed fields plus .schedule (the typed schedule). */
  function parse(expr){
    var src = String(expr).trim().replace(/\s+/g, ' ');
    if(!src) throw new Error('Type a cron expression, for example */5 * * * *');
    var tokens = src.split(' '), fields, schedule;

    if(tokens[0].charAt(0) === '@'){
      var macro = tokens[0].toLowerCase();
      if(macro === '@reboot') throw new Error('@reboot runs once at system startup — it has no time schedule');
      if(!MACROS[macro]) throw new Error('Unknown shortcut '+tokens[0]+' — use @hourly, @daily, @weekly, @monthly or @yearly');
      fields   = MACROS[macro].split(' ');
      schedule = tokens[0];
    } else {
      var n = tokens.length;
      if(n > 5 && !looksLikeField(tokens[5])) n = 5;          /* the rest is a command — ignored */
      if(n !== 5){
        throw new Error('Cron needs 5 fields (minute hour day month weekday) — found '+n+
          (n === 6 ? '. Seconds and year fields are not standard cron.' : '.'));
      }
      fields   = tokens.slice(0, 5);
      schedule = fields.join(' ');
    }

    var parsed = fields.map(parseField);
    parsed.schedule = schedule;
    return parsed;
  }

  /* ══════════════════════════════════════════
     BUILDER STATE + SERIALIZER
     Each field remembers the settings of every mode, so switching
     modes back and forth never loses the user's choices.
  ══════════════════════════════════════════ */
  function defaultState(f){
    var sel = {};
    sel[f.key === 'dow' ? 1 : f.min] = true;
    return { mode:'every', step:f.step, start:f.min, from:f.range[0], to:f.range[1], sel:sel };
  }
  var state = FIELDS.map(defaultState);

  /* every field back to "every", remembered per-mode settings forgotten.
     Objects are updated in place — the builder's controls keep references to them. */
  function resetState(){
    FIELDS.forEach(function(f, i){
      var d = defaultState(f);
      for(var k in d) state[i][k] = d[k];
    });
  }

  function selectedValues(i){
    return Object.keys(state[i].sel).map(Number).sort(function(a, b){ return a - b; });
  }

  /* [1,2,3,5,7,8] → "1-3,5,7,8" (runs of 3+ become ranges) */
  function compress(values){
    var out = [], i = 0;
    while(i < values.length){
      var j = i;
      while(j+1 < values.length && values[j+1] === values[j] + 1) j++;
      if(j - i >= 2) out.push(values[i]+'-'+values[j]);
      else for(var k=i; k<=j; k++) out.push(String(values[k]));
      i = j + 1;
    }
    return out.join(',');
  }

  function fieldText(i){
    var f = FIELDS[i], st = state[i];
    if(st.mode === 'interval') return (st.start === f.min ? '*' : st.start+'-'+f.max)+'/'+st.step;
    if(st.mode === 'range')    return st.from === st.to ? String(st.from) : st.from+'-'+st.to;
    if(st.mode === 'specific'){
      var vals = selectedValues(i);
      return vals.length === f.max - f.min + 1 ? '*' : compress(vals);
    }
    return '*';
  }

  function buildExpression(){
    return FIELDS.map(function(f, i){ return fieldText(i); }).join(' ');
  }

  /* typed expression → builder state */
  function applyParsed(parsed){
    parsed.forEach(function(p, i){
      var st = state[i];
      st.mode = p.mode;
      if(p.mode === 'interval'){ st.step = p.step; st.start = p.start; }
      if(p.mode === 'range'){ st.from = p.from; st.to = p.to; }
      if(p.mode !== 'every'){ st.sel = {}; p.values.forEach(function(v){ st.sel[v] = true; }); }
    });
  }

  /* user picked a mode — carry the current schedule over where it makes sense */
  function switchMode(i, mode){
    var st = state[i], prev = st.mode;
    if(mode === prev) return;
    if(prev !== 'every'){
      var values = parseField(fieldText(i), i).values;
      if(mode === 'specific'){ st.sel = {}; values.forEach(function(v){ st.sel[v] = true; }); }
      if(mode === 'range'){ st.from = values[0]; st.to = values[values.length-1]; }
    }
    st.mode = mode;
  }

  /* ══════════════════════════════════════════
     PLAIN-ENGLISH DESCRIPTION
     "0 9-17 * * 1-5" → "Every hour from 09:00 to 17:00, on Monday through Friday"
  ══════════════════════════════════════════ */
  function hhmm(h, m){ return pad(h)+':'+pad(m); }

  function joinList(items){
    return items.length < 2 ? items.join('') : items.slice(0, -1).join(', ')+' and '+items[items.length-1];
  }

  function contiguous(vals){
    return vals.every(function(v, k){ return !k || v === vals[k-1] + 1; });
  }

  /* month / weekday names; 3+ in a row read as "June through August" */
  function nameList(p, i){
    var f = FIELDS[i];
    var pos  = function(v){ return f.order ? f.order.indexOf(v) : v; };
    var vals = p.values.slice().sort(function(a, b){ return pos(a) - pos(b); });
    var name = function(v){ return f.names[v - f.min]; };
    var run  = vals.length >= 3 && vals.every(function(v, k){ return !k || pos(v) === pos(vals[k-1]) + 1; });
    return run ? name(vals[0])+' through '+name(vals[vals.length-1]) : joinList(vals.map(name));
  }

  function minutePhrase(p, everyHour){
    var v = p.values, hour = everyHour ? 'every hour' : 'the hour';
    if(v.length === 60)         return 'Every minute';
    if(p.mode === 'interval')   return 'Every '+p.step+' minutes'+(p.start ? ', starting at minute '+p.start : '');
    if(v.length >= 3 && contiguous(v)) return 'Every minute from :'+pad(v[0])+' to :'+pad(v[v.length-1]);
    if(v.length === 1)          return v[0] === 0 ? 'At the start of '+hour : 'At '+v[0]+' minute'+(v[0] === 1 ? '' : 's')+' past '+hour;
    return 'At minutes '+joinList(v.map(String))+' past '+hour;
  }

  function hourPhrase(p){
    var v = p.values;
    if(v.length === 24)       return '';
    if(p.mode === 'interval') return 'every '+p.step+' hours'+(p.start ? ', starting at '+hhmm(p.start, 0) : '');
    if(contiguous(v))         return 'between '+hhmm(v[0], 0)+' and '+hhmm(v[v.length-1], 59);
    return 'during hours '+joinList(v.map(function(h){ return pad(h); }));
  }

  function timePhrase(mi, ho){
    var m = mi.values, h = ho.values;
    var minuteFixed = m.length < 60 && mi.mode !== 'interval' && !(m.length >= 3 && contiguous(m));
    var hourFixed   = h.length < 24 && ho.mode !== 'interval';

    /* a handful of exact clock times: "At 09:00 and 17:30" */
    if(minuteFixed && hourFixed && m.length * h.length <= 6){
      var times = [];
      h.forEach(function(hh){ m.forEach(function(mm){ times.push(hhmm(hh, mm)); }); });
      return 'At '+joinList(times);
    }
    if(m.length === 1 && mi.mode !== 'interval'){
      if(ho.mode === 'interval'){
        return 'Every '+ho.step+' hours at :'+pad(m[0])+(ho.start ? ', starting at '+hhmm(ho.start, m[0]) : '');
      }
      if(h.length >= 2 && h.length < 24 && contiguous(h)){
        return 'Every hour from '+hhmm(h[0], m[0])+' to '+hhmm(h[h.length-1], m[0]);
      }
    }
    var hp = hourPhrase(ho);
    return minutePhrase(mi, !hp) + (hp ? ', '+hp : '');
  }

  function domPhrase(p){
    var v = p.values;
    if(v.length === 31)       return '';
    if(p.mode === 'interval') return 'every '+p.step+' days'+(p.start > 1 ? ', starting on day '+p.start : '');
    if(v.length >= 3 && contiguous(v)) return 'on days '+v[0]+' to '+v[v.length-1]+' of the month';
    return 'on day'+(v.length > 1 ? 's ' : ' ')+joinList(v.map(String))+' of the month';
  }

  function monthPhrase(p){
    if(p.values.length === 12) return '';
    if(p.mode === 'interval')  return 'every '+p.step+' months'+(p.start > 1 ? ', starting in '+MONTHS[p.start-1] : '');
    return 'in '+nameList(p, 3);
  }

  /* Vixie rule: both day fields restricted (neither starts with *) → EITHER may match */
  function eitherDayRule(parsed){
    return !parsed[2].star && !parsed[4].star && parsed[2].values.length < 31 && parsed[4].values.length < 7;
  }

  function describe(parsed){
    var dom = parsed[2], dow = parsed[4];
    var bothRestricted = !dom.star && !dow.star;
    var days = [domPhrase(dom), dow.values.length === 7 ? '' : 'on '+nameList(dow, 4)].filter(Boolean);
    /* restricted-but-complete day field under the OR rule means "any day" */
    var dayText = bothRestricted && (dom.values.length === 31 || dow.values.length === 7)
      ? '' : days.join(eitherDayRule(parsed) ? ' or ' : ', ');
    var text = [timePhrase(parsed[0], parsed[1]), dayText, monthPhrase(parsed[3])].filter(Boolean).join(', ');
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  /* ══════════════════════════════════════════
     NEXT RUN TIMES  (device local time)
     Jumps month → day → hour → minute, so rare schedules stay fast.
  ══════════════════════════════════════════ */
  var SEARCH_YEARS = 5;

  function nextRuns(parsed, count){
    var sets = parsed.map(function(p){ var s = {}; p.values.forEach(function(v){ s[v] = true; }); return s; });
    var anyStar = parsed[2].star || parsed[4].star;
    var d = new Date();
    d.setSeconds(0, 0);
    d.setMinutes(d.getMinutes() + 1);
    var limit = new Date(d.getTime());
    limit.setFullYear(limit.getFullYear() + SEARCH_YEARS);

    var runs = [];
    while(runs.length < count && d < limit){
      if(!sets[3][d.getMonth() + 1]){ d.setMonth(d.getMonth() + 1, 1); d.setHours(0, 0, 0, 0); continue; }
      var domOk = !!sets[2][d.getDate()], dowOk = !!sets[4][d.getDay()];
      if(!(anyStar ? domOk && dowOk : domOk || dowOk)){ d.setDate(d.getDate() + 1); d.setHours(0, 0, 0, 0); continue; }
      if(!sets[1][d.getHours()]){ d.setHours(d.getHours() + 1, 0, 0, 0); continue; }
      if(!sets[0][d.getMinutes()]){ d.setMinutes(d.getMinutes() + 1, 0, 0); continue; }
      runs.push(new Date(d.getTime()));
      d.setMinutes(d.getMinutes() + 1, 0, 0);
    }
    return runs;
  }

  var RUN_DATE = (function(){
    try{ return new Intl.DateTimeFormat('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' }); }
    catch(e){ return null; }
  })();

  function formatRun(d){
    return (RUN_DATE ? RUN_DATE.format(d) : d.toDateString())+' · '+hhmm(d.getHours(), d.getMinutes());
  }

  function fromNow(d){
    var mins = Math.round((d.getTime() - Date.now()) / 60000);
    if(mins < 1)  return 'in <1 min';
    if(mins < 60) return 'in '+mins+' min';
    var h = Math.floor(mins / 60), m = mins % 60;
    if(h < 48)    return 'in '+h+' h'+(m ? ' '+m+' min' : '');
    var days = Math.round(mins / 1440);
    return days < 60 ? 'in '+days+' days' : 'in '+Math.round(days / 30.44)+' months';
  }

  /* ══════════════════════════════════════════
     UI
  ══════════════════════════════════════════ */
  var PRESETS = [
    ['Every minute',       '* * * * *'],
    ['Every 5 minutes',    '*/5 * * * *'],
    ['Every 15 minutes',   '*/15 * * * *'],
    ['Every hour',         '0 * * * *'],
    ['Daily at 00:00',     '0 0 * * *'],
    ['Weekdays at 09:00',  '0 9 * * 1-5'],
    ['Every Sunday',       '0 0 * * 0'],
    ['1st of the month',   '0 0 1 * *'],
    ['Every year, Jan 1',  '0 0 1 1 *']
  ];
  var MODE_LABELS = { every:'Every', interval:'Interval', specific:'Specific', range:'Range' };
  var EVERY_TEXT  = { minute:'Runs every minute.', hour:'Runs every hour.', dom:'Runs on any day of the month.',
                      month:'Runs in every month.', dow:'Runs on any day of the week.' };
  var START_WORD  = { minute:'starting at minute', hour:'starting at', dom:'starting on day', month:'starting in' };
  var PICK_HINT   = { minute:'Pick one or more minutes.', hour:'Pick one or more hours.', dom:'Pick one or more days.',
                      month:'Pick one or more months.', dow:'Pick one or more weekdays.' };
  var DOW_SHORTCUTS = [['Weekdays',[1,2,3,4,5]], ['Weekend',[6,0]], ['Every day',[0,1,2,3,4,5,6]]];

  var overlay   = $('timeOverlay');
  var panel     = $('tpanel-cron');
  var exprInput = $('cronExpr');
  var partsBox  = $('cronParts');
  var descEl    = $('cronDesc');
  var noteEl    = $('cronNote');
  var presetBox = $('cronPresets');
  var fieldsBox = $('cronFields');
  var runsList  = $('cronRuns');
  var runsEmpty = $('cronRunsEmpty');

  var legend = [];      /* per field: {btn, val} */
  var cards  = [];      /* per field: {root, code, seg[], body, mode, update} */
  var lastParsed = null;

  function el(tag, cls, text){
    var n = document.createElement(tag);
    if(cls) n.className = cls;
    if(text !== undefined) n.textContent = text;
    return n;
  }
  function button(cls, text){ var b = el('button', cls, text); b.type = 'button'; return b; }

  function valuesOf(f){
    if(f.order) return f.order;
    var out = [];
    for(var v=f.min; v<=f.max; v++) out.push(v);
    return out;
  }

  /* chip / option text: 05 · 17 · 9 · Jan · Mon */
  function shortLabel(i, v){
    var f = FIELDS[i];
    if(f.names) return f.names[v - f.min].slice(0, 3);
    return f.key === 'dom' ? String(v) : pad(v);
  }

  /* native <select> — the most comfortable picker on touch devices */
  function makeSelect(label, values, current, fmt, onChange){
    var s = el('select', 'time-select');
    s.setAttribute('aria-label', label);
    values.forEach(function(v){
      var o = el('option', '', fmt(v));
      o.value = v;
      s.appendChild(o);
    });
    s.value = current;
    s.addEventListener('change', function(){ onChange(parseInt(s.value, 10)); });
    return s;
  }

  function span(text){ return el('span', '', text); }

  /* ── mode bodies: each builds its controls once and returns an update() ── */
  function bodyEvery(i){
    cards[i].body.appendChild(el('div', 'cron-muted', EVERY_TEXT[FIELDS[i].key]));
    return function(){};
  }

  function bodyInterval(i){
    var f = FIELDS[i], st = state[i], row = el('div', 'cron-sentence');
    var steps = [];
    for(var n=1; n<=f.max - f.min; n++) steps.push(n);
    var unit = span('');
    var stepSel = makeSelect(f.title+' interval', steps, st.step, String, function(v){ st.step = v; fromBuilder(); });
    var startSel = makeSelect(f.title+' start', valuesOf(f), st.start, function(v){
      return f.key === 'hour' ? pad(v)+':00' : f.key === 'month' ? MONTHS[v-1] : shortLabel(i, v);
    }, function(v){ st.start = v; fromBuilder(); });
    [span('Every'), stepSel, unit, span(START_WORD[f.key]), startSel].forEach(function(n){ row.appendChild(n); });
    cards[i].body.appendChild(row);
    return function(){
      stepSel.value = st.step;
      startSel.value = st.start;
      unit.textContent = f.unit+(st.step === 1 ? '' : 's')+',';
    };
  }

  function bodySpecific(i){
    var f = FIELDS[i], st = state[i], body = cards[i].body;
    var values = valuesOf(f), grid = el('div', 'cron-chips'+(f.names ? ' wide' : ''));
    var chips = values.map(function(v){
      var b = button('cron-chip', shortLabel(i, v));
      b.setAttribute('aria-label', f.names ? f.names[v - f.min] : f.title+' '+v);
      b.addEventListener('click', function(){
        if(st.sel[v]){
          if(Object.keys(st.sel).length === 1) return;   /* keep at least one selected */
          delete st.sel[v];
        } else {
          st.sel[v] = true;
        }
        fromBuilder();
      });
      grid.appendChild(b);
      return b;
    });
    body.appendChild(grid);

    if(f.key === 'dow'){
      var row = el('div', 'cron-shortcuts');
      DOW_SHORTCUTS.forEach(function(s){
        var b = button('cron-mini', s[0]);
        b.addEventListener('click', function(){
          st.sel = {};
          s[1].forEach(function(v){ st.sel[v] = true; });
          fromBuilder();
        });
        row.appendChild(b);
      });
      body.appendChild(row);
    }
    body.appendChild(el('div', 'cron-muted', PICK_HINT[f.key]));
    return function(){
      chips.forEach(function(b, k){ b.setAttribute('aria-pressed', st.sel[values[k]] ? 'true' : 'false'); });
    };
  }

  function bodyRange(i){
    var f = FIELDS[i], st = state[i], row = el('div', 'cron-sentence'), values = valuesOf(f);
    var hour = f.key === 'hour';
    var fromSel = makeSelect(f.title+' from', values, st.from, function(v){ return hour ? pad(v)+':00' : shortLabel(i, v); },
      function(v){ st.from = v; if(st.to < v) st.to = v; fromBuilder(); });
    var toSel = makeSelect(f.title+' to', values, st.to, function(v){ return hour ? pad(v)+':59' : shortLabel(i, v); },
      function(v){ st.to = v; if(st.from > v) st.from = v; fromBuilder(); });
    var words = hour ? ['Between', 'and'] : f.key === 'minute' ? ['From minute', 'to'] : ['From day', 'to'];
    [span(words[0]), fromSel, span(words[1]), toSel].forEach(function(n){ row.appendChild(n); });
    cards[i].body.appendChild(row);
    return function(){ fromSel.value = st.from; toSel.value = st.to; };
  }

  var BODIES = { every:bodyEvery, interval:bodyInterval, specific:bodySpecific, range:bodyRange };

  function renderCard(i, text){
    var card = cards[i], st = state[i];
    card.seg.forEach(function(b){
      var on = b.getAttribute('data-mode') === st.mode;
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
    card.code.textContent = text;
    if(card.mode !== st.mode){          /* rebuild only when the mode changes, so focus stays put */
      card.mode = st.mode;
      card.body.textContent = '';
      card.update = BODIES[st.mode](i);
    }
    card.update();
  }

  /* ── build static pieces ── */
  function buildLegend(){
    FIELDS.forEach(function(f, i){
      var b = button('cron-part cron-c'+i), val = el('span', 'cron-part-val', '*');
      b.appendChild(val);
      b.appendChild(el('span', 'cron-part-lbl', f.legend));
      b.setAttribute('aria-label', 'Jump to '+f.title.toLowerCase()+' settings');
      b.addEventListener('click', function(){ focusCard(i); });
      partsBox.appendChild(b);
      legend.push({ btn:b, val:val });
    });
  }

  function buildPresets(){
    PRESETS.forEach(function(p){
      var b = button('cron-preset', p[0]);
      b.title = p[1];
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function(){ exprInput.value = p[1]; fromExpression(); });
      presetBox.appendChild(b);
    });
  }

  function buildCards(){
    FIELDS.forEach(function(f, i){
      var root = el('div', 'cron-field cron-c'+i), head = el('div', 'cron-field-head');
      var title = el('div', 'cron-field-title', f.title), code = el('span', 'cron-field-code');
      var seg = el('div', 'cron-seg'), body = el('div', 'cron-field-body');
      title.appendChild(code);
      seg.setAttribute('role', 'radiogroup');
      seg.setAttribute('aria-label', f.title+' mode');

      var segBtns = f.modes.map(function(mode){
        var b = button('cron-seg-btn', MODE_LABELS[mode]);
        b.setAttribute('role', 'radio');
        b.setAttribute('data-mode', mode);
        b.addEventListener('click', function(){ switchMode(i, mode); fromBuilder(); });
        seg.appendChild(b);
        return b;
      });
      /* radiogroup keyboard: arrows move the selection */
      seg.addEventListener('keydown', function(e){
        var dir = (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 1 : (e.key === 'ArrowLeft' || e.key === 'ArrowUp') ? -1 : 0;
        if(!dir) return;
        e.preventDefault();
        var k = (f.modes.indexOf(state[i].mode) + dir + f.modes.length) % f.modes.length;
        switchMode(i, f.modes[k]);
        fromBuilder();
        segBtns[k].focus();
      });

      head.appendChild(title);
      head.appendChild(seg);
      root.appendChild(head);
      root.appendChild(body);
      fieldsBox.appendChild(root);
      cards.push({ root:root, code:code, seg:segBtns, body:body, mode:null, update:null });
    });
  }

  function focusCard(i){
    var root = cards[i].root;
    root.scrollIntoView({ block:'nearest', behavior:'smooth' });
    root.classList.add('flash');
    setTimeout(function(){ root.classList.remove('flash'); }, 900);
    var active = root.querySelector('.cron-seg-btn[aria-checked="true"]');
    if(active) active.focus({ preventScroll:true });
  }

  /* ── render results ── */
  function normalized(){ return exprInput.value.trim().replace(/\s+/g, ' '); }

  function markPreset(expr){
    Array.prototype.forEach.call(presetBox.children, function(b, k){
      b.setAttribute('aria-pressed', PRESETS[k][1] === expr ? 'true' : 'false');
    });
  }

  function renderRuns(){
    runsList.textContent = '';
    var runs = lastParsed ? nextRuns(lastParsed, 5) : [];
    runs.forEach(function(d){
      var li = el('li', 'cron-run');
      li.appendChild(el('span', 'cron-run-date', formatRun(d)));
      li.appendChild(el('span', 'cron-run-in', fromNow(d)));
      runsList.appendChild(li);
    });
    runsEmpty.hidden = runs.length > 0;
    runsEmpty.textContent = lastParsed
      ? 'This schedule never matches a real date in the next '+SEARCH_YEARS+' years (for example, February 30).'
      : 'Fix the expression above to see upcoming runs.';
  }

  function save(){
    try{ localStorage.setItem(LS_EXPR, exprInput.value); }catch(e){}
  }

  var lastExprValue = null;   /* expression text last processed (dedupes the many edit events) */

  function refresh(parsed){
    lastParsed = parsed;
    exprInput.classList.remove('invalid');
    exprInput.removeAttribute('aria-invalid');
    parsed.forEach(function(p, i){
      legend[i].btn.classList.remove('invalid');
      legend[i].val.textContent = p.text;
      renderCard(i, p.text);
    });
    descEl.className = 'cron-desc';
    descEl.textContent = describe(parsed);
    noteEl.hidden = !eitherDayRule(parsed);
    noteEl.textContent = 'Cron runs this when EITHER the day of month OR the weekday matches.';
    markPreset(parsed.schedule);
    renderRuns();
    save();
  }

  function showError(err){
    lastParsed = null;
    exprInput.classList.add('invalid');
    exprInput.setAttribute('aria-invalid', 'true');
    var raw = normalized().split(' ');
    legend.forEach(function(p, i){
      p.val.textContent = raw[i] || '—';
      p.btn.classList.toggle('invalid', err.field === i);
    });
    descEl.className = 'cron-desc err';
    descEl.textContent = err.message;
    noteEl.hidden = true;
    markPreset('');
    renderRuns();
    save();
  }

  /* builder changed → rewrite the expression */
  function fromBuilder(){
    exprInput.value = lastExprValue = buildExpression();
    refresh(parse(exprInput.value));
  }

  /* expression typed / preset picked → update the builder (typed text is left as is) */
  function fromExpression(){
    lastExprValue = exprInput.value;
    var parsed;
    try{ parsed = parse(exprInput.value); }
    catch(e){ showError(e); return; }
    applyParsed(parsed);
    refresh(parsed);
  }

  /* ── events ── */
  /* sync on every way the text can change: typing, IME, paste, cut, drop, autofill */
  function onExprEdit(){
    if(exprInput.value !== lastExprValue) fromExpression();
  }
  exprInput.addEventListener('input', onExprEdit);
  ['change', 'keyup', 'paste', 'cut', 'drop', 'compositionend'].forEach(function(type){
    exprInput.addEventListener(type, function(){ setTimeout(onExprEdit, 0); });
  });

  $('cronCopy').addEventListener('click', function(){
    if(!lastParsed) return;
    copyText(lastParsed.schedule);
    flashBtn(this, 'Copied!');
  });

  /* Reset: "* * * * *" with every field on "Every" and remembered choices forgotten */
  $('cronReset').addEventListener('click', function(){
    resetState();
    fromBuilder();
    flashBtn(this, 'Cleared');
  });

  /* keep "in 5 min" honest: refresh when the tab/modal opens, then every 30 s while visible */
  function refreshRunsIfVisible(){
    if(lastParsed && panel.classList.contains('active') && overlay.classList.contains('open')) renderRuns();
  }
  $('ttab-cron').addEventListener('click', refreshRunsIfVisible);
  $('timeBtn').addEventListener('click', refreshRunsIfVisible);
  setInterval(refreshRunsIfVisible, 30000);

  /* ── init ── */
  try{ $('cronTz').textContent = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local time'; }
  catch(e){ $('cronTz').textContent = 'Local time'; }

  buildLegend();
  buildPresets();
  buildCards();

  var savedExpr = null;
  try{ savedExpr = localStorage.getItem(LS_EXPR); }catch(e){}
  exprInput.value = (savedExpr && savedExpr.trim()) ? savedExpr : DEFAULT_EXPR;
  fromExpression();
})();
