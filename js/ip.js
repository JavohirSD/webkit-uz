'use strict';

/* ══════════════════════════════════════════
   IP INFO MODAL
══════════════════════════════════════════ */
var IP_SERVICES = [
  { url:'https://geo.kamero.ai/api/geo',
    parse:function(d){
      var rows=[],add=function(k,v){if(v!==undefined&&v!==null&&v!=='')rows.push([k,String(v)]);};
      add('IP Address',d.ip);
      add('City',d.city);
      add('Country Code',d.country);
      add('Region Code',d.countryRegion);
      add('Continent',d.continent);
      add('Latitude',d.latitude);
      add('Longitude',d.longitude);
      add('Timezone',d.timezone);
      add('Region',d.region);
      return rows.length?rows:null;
    }
  },
  { url:'https://geoip.vuiz.net/geoip',
    parse:function(d){
      var rows=[],add=function(k,v){if(v!==undefined&&v!==null&&v!=='')rows.push([k,String(v)]);};
      add('IP Address',d.ip);
      add('City',d.city);
      add('Region',d.region+(d.region_code?' ('+d.region_code+')':''));
      add('Country',d.country+(d.country_code?' ('+d.country_code+')':''));
      add('Continent',d.continent_code);
      add('Postal Code',d.postal_code);
      add('Latitude',d.latitude);
      add('Longitude',d.longitude);
      add('Timezone',d.timezone);
      add('ISP',d.isp);
      add('Organization',d.organization);
      add('ASN Org',d.asn_organization);
      add('ASN',d.asn!==undefined&&d.asn!==null?String(d.asn):'');
      return rows.length?rows:null;
    }
  },
  { url:'http://ipwho.is/',
    parse:function(d){
      if(d.success===false) return null;
      var rows=[],add=function(k,v){if(v!==undefined&&v!==null&&v!=='')rows.push([k,String(v)]);};
      add('IP Address',d.ip);
      add('IP Type',d.type);
      add('City',d.city);
      add('Region',d.region+(d.region_code?' ('+d.region_code+')':''));
      add('Country',d.country+(d.country_code?' ('+d.country_code+')':''));
      add('Continent',d.continent+(d.continent_code?' ('+d.continent_code+')':''));
      add('Postal Code',d.postal);
      add('Latitude',d.latitude);
      add('Longitude',d.longitude);
      add('EU Member',d.is_eu?'Yes':'No');
      add('Calling Code',d.calling_code);
      add('Capital',d.capital);
      add('Borders',d.borders);
      add('Flag',d.flag&&d.flag.emoji?d.flag.emoji+' ('+d.flag.emoji_unicode+')':'');
      add('ISP',d.connection&&d.connection.isp?d.connection.isp:'');
      add('Org',d.connection&&d.connection.org?d.connection.org:'');
      add('ASN',d.connection&&d.connection.asn?String(d.connection.asn):'');
      add('Domain',d.connection&&d.connection.domain?d.connection.domain:'');
      add('Timezone',d.timezone&&d.timezone.id?d.timezone.id:'');
      add('UTC Offset',d.timezone&&d.timezone.utc?d.timezone.utc:'');
      add('DST',d.timezone&&d.timezone.is_dst!==undefined?(d.timezone.is_dst?'Yes':'No'):'');
      return rows.length?rows:null;
    }
  },
  { url:'https://api.country.is/',
    parse:function(d){
      var rows=[],add=function(k,v){if(v!==undefined&&v!==null&&v!=='')rows.push([k,String(v)]);};
      add('IP Address',d.ip);
      add('Country Code',d.country);
      return rows.length?rows:null;
    }
  }
];

var ipCacheRows  = null;  // non-null = successful fetch cached
var ipFetchDone  = false; // true after first attempt (success OR all-failed)

function renderIPTable(rows){
  ipCacheRows = rows;
  ipFetchDone = true;
  var tbody=$('ipInfoTable').querySelector('tbody');
  tbody.innerHTML='';
  rows.forEach(function(r){
    var val=r[1]||'—';
    var tr=document.createElement('tr');
    var td1=document.createElement('td');
    var td2=document.createElement('td');
    xssText(td1, r[0]);
    if(val==='—'){ var sp=document.createElement('span'); sp.className='info-na'; xssText(sp,'—'); td2.appendChild(sp); }
    else{ xssText(td2, val); }
    tr.appendChild(td1); tr.appendChild(td2);
    tbody.appendChild(tr);
  });
  $('ipLoading').style.display='none';
  $('ipError').style.display='none';
  $('ipInfoTable').style.display='table';
}

function showIPError(){
  ipFetchDone = true; // cache the error — do not retry until page reload
  $('ipLoading').style.display='none';
  $('ipInfoTable').style.display='none';
  $('ipError').style.display='block';
}

function tryIPService(idx){
  if(idx>=IP_SERVICES.length){showIPError();return;}
  var svc=IP_SERVICES[idx], done=false;
  var timer=setTimeout(function(){ if(!done){done=true;tryIPService(idx+1);} },6000);
  try{
    fetch(svc.url,{method:'GET',headers:{'Accept':'application/json'},mode:'cors'})
      .then(function(res){ if(!res.ok) throw new Error('HTTP '+res.status); return res.json(); })
      .then(function(data){
        if(done) return; done=true; clearTimeout(timer);
        var rows; try{rows=svc.parse(data);}catch(e){rows=null;}
        if(rows&&rows.length){renderIPTable(rows);}else{tryIPService(idx+1);}
      })
      .catch(function(){ if(done) return; done=true; clearTimeout(timer); tryIPService(idx+1); });
  }catch(e){ clearTimeout(timer); tryIPService(idx+1); }
}

function openIPModal(){
  openOverlay('ipModalOverlay','ipModalClose');

  // Already have data — show it instantly, no request
  if(ipCacheRows){ renderIPTable(ipCacheRows); return; }

  // Already failed this page session — show error instantly, no request
  if(ipFetchDone){ showIPError(); return; }

  // First open: fetch now
  $('ipLoading').style.display='flex';
  $('ipInfoTable').style.display='none';
  $('ipError').style.display='none';
  if(typeof fetch==='undefined'){ showIPError(); return; }
  tryIPService(0);
}
function closeIPModal(){ closeOverlay('ipModalOverlay'); }

$('ipInfoBtn').addEventListener('click', openIPModal);
$('ipModalClose').addEventListener('click', closeIPModal);
$('ipModalOverlay').addEventListener('click', function(e){if(e.target===this)closeIPModal();});
