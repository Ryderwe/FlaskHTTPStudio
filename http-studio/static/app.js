// ========= utilities =========
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s||'')
  .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
  .replaceAll('"','&quot;').replaceAll("'","&#039;");

function nowTs(){ return new Date().toISOString(); }

function parseHostPath(url){
  try{
    const u = new URL(url);
    return {host: u.host, path: u.pathname};
  }catch{ return {host:'', path:''}; }
}

// ========= KV editor =========
function kvAdd(container, k='', v=''){
  const c = $(container);
  const row = document.createElement('div');
  row.className = 'kvrow';
  row.innerHTML = `
    <input placeholder="key" value="${esc(k)}"/>
    <input placeholder="value" value="${esc(v)}"/>
    <button class="iconbtn" type="button">×</button>
  `;
  row.querySelector('button').onclick = () => { row.remove(); syncKvToText(container); };
  // 实时同步到文本框
  row.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('input', () => syncKvToText(container));
  });
  c.appendChild(row);
}

function syncKvToText(container){
  if(container === 'kvQuery'){
    $('queryText').value = kvToText(kvGet('kvQuery'), 'kv');
  } else if(container === 'kvHeaders'){
    $('headersText').value = kvToText(kvGet('kvHeaders'), 'headers');
  }
}

function kvSet(container, pairs){
  $(container).innerHTML = '';
  (pairs||[]).forEach(([k,v])=>kvAdd(container,k,v));
  if(!pairs || pairs.length===0) kvAdd(container,'','');
}

function kvGet(container){
  const rows = [...$(container).querySelectorAll('.kvrow')];
  const out = [];
  rows.forEach(r=>{
    const k = r.children[0].value.trim();
    const v = r.children[1].value;
    if(k) out.push([k,v]);
  });
  return out;
}

function kvFromText(text, mode){
  const lines = (text||'').split('\n').map(x=>x.trim()).filter(Boolean).filter(x=>!x.startsWith('#'));
  const pairs = [];
  if(mode==='headers'){
    lines.forEach(line=>{
      const idx = line.indexOf(':');
      if(idx<0) return;
      pairs.push([line.slice(0,idx).trim(), line.slice(idx+1).trim()]);
    });
  }else{
    lines.forEach(line=>{
      const idx = line.indexOf('=');
      if(idx<0) pairs.push([line,'']);
      else pairs.push([line.slice(0,idx).trim(), line.slice(idx+1).trim()]);
    });
  }
  return pairs;
}

function kvToText(pairs, mode){
  if(mode==='headers') return (pairs||[]).map(([k,v])=>`${k}: ${v}`).join('\n');
  return (pairs||[]).map(([k,v])=>`${k}=${v}`).join('\n');
}

// ========= 手风琴面板切换 =========
function setActivePanel(name){
  document.querySelectorAll('.accordion-panel').forEach(panel=>{
    const id = panel.id.replace('panel-','');
    panel.classList.toggle('active', id===name);
  });
}

document.querySelectorAll('.accordion-hd').forEach(hd=>{
  hd.addEventListener('click', (e)=> {
    // 不要在点击 tab 按钮时触发
    if(e.target.classList.contains('tab')) return;
    setActivePanel(hd.dataset.panel);
  });
});

// hover 展开（延迟 300ms）
let hoverTimer = null;
document.querySelectorAll('.accordion-panel').forEach(panel=>{
  panel.addEventListener('mouseenter', ()=>{
    const id = panel.id.replace('panel-','');
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(()=> setActivePanel(id), 300);
  });
  panel.addEventListener('mouseleave', ()=>{
    clearTimeout(hoverTimer);
  });
});

// ========= Tabs =========
function setTab(name){
  document.querySelectorAll('.tab').forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.tab===name);
  });
  ['req','presets','adv'].forEach(t=>{
    $(`tab-${t}`).style.display = (t===name) ? 'block' : 'none';
  });
}

document.querySelectorAll('.tab').forEach(btn=>{
  btn.addEventListener('click', ()=> setTab(btn.dataset.tab));
});

// ========= Body mode UI =========
function updateBodyUI(){
  const mode = $('bodyMode').value;
  const hint = $('bodyHint');
  const multi = $('multipartFiles');
  const raw = $('rawFilePanel');

  if(mode==='json') hint.innerHTML = '粘贴 JSON；结构化解析发送。支持 JSON Path 预设改值。';
  else if(mode==='form-urlencoded') hint.innerHTML = '每行 key=value，以 x-www-form-urlencoded 发送。';
  else if(mode==='multipart') hint.innerHTML = '每行 key=value 或 key=@file；@file 会生成上传控件。';
  else if(mode==='raw') hint.innerHTML = '原样发送文本；也可上传文件作为 body。';
  else hint.innerHTML = '不发送请求体。';

  multi.style.display = (mode==='multipart') ? 'block' : 'none';
  raw.style.display = (mode==='raw') ? 'block' : 'none';

  if(mode==='multipart') refreshMultipartFileInputs();
}

function refreshMultipartFileInputs(){
  const body = $('bodyText').value || '';
  const keys = [];
  body.split('\n').map(x=>x.trim()).filter(Boolean).forEach(line=>{
    const idx = line.indexOf('=');
    if(idx<0) return;
    const k = line.slice(0,idx).trim();
    const v = line.slice(idx+1).trim();
    if(k && v.startsWith('@')) keys.push(k);
  });
  const box = $('fileInputs');
  box.innerHTML = '';
  if(keys.length===0){
    box.innerHTML = `<div class="hint">未检测到 @file 字段。</div>`;
    return;
  }
  keys.forEach(k=>{
    const div = document.createElement('div');
    div.style.marginTop = '8px';
    div.innerHTML = `
      <label>Upload file for field: <b>${esc(k)}</b></label>
      <input type="file" data-filekey="${esc(k)}"/>
    `;
    box.appendChild(div);
  });
}

$('bodyMode').addEventListener('change', updateBodyUI);
$('bodyText').addEventListener('input', ()=> {
  if($('bodyMode').value==='multipart') refreshMultipartFileInputs();
});

// ========= Presets =========
const PRESET_KEY = 'httpstudio_presets_v2';

function loadPresets(){
  try{ return JSON.parse(localStorage.getItem(PRESET_KEY) || '[]'); }catch{ return []; }
}
function savePresets(arr){
  localStorage.setItem(PRESET_KEY, JSON.stringify(arr||[]));
}
function presetClear(){
  $('psName').value='';
  $('psType').value='kv';
  $('psTarget').value='query';
  $('psMatch').value='';
  $('psValue').value='';
  $('psPrompt').value='true';
  $('psHost').value='';
  $('psPath').value='';
  $('psEnabled').value='true';
  $('psAuto').value='true';
}

function presetUpsert(){
  const name = $('psName').value.trim();
  if(!name) return alert('规则名不能为空');
  const item = {
    name,
    type: $('psType').value,
    target: $('psTarget').value,
    match: $('psMatch').value.trim(),
    value: $('psValue').value,
    prompt: $('psPrompt').value==='true',
    scopeHost: $('psHost').value.trim(),
    scopePath: $('psPath').value.trim(),
    enabled: $('psEnabled').value==='true',
    auto: $('psAuto').value==='true',
  };
  if(!item.match) return alert('匹配 key/path 不能为空');

  const list = loadPresets();
  const idx = list.findIndex(x=>x.name===name);
  if(idx>=0) list[idx]=item; else list.push(item);
  savePresets(list);
  renderPresetList();
  presetClear();
}

function renderPresetList(){
  const list = loadPresets();
  const box = $('presetList');
  box.innerHTML = '';
  if(list.length===0){
    box.innerHTML = `<div class="item"><div class="item-meta">暂无预设规则。</div></div>`;
    return;
  }

  list.forEach(p=>{
    const div = document.createElement('div');
    div.className = 'item';
    div.innerHTML = `
      <div class="item-title">
        <span>${esc(p.name)} ${p.enabled ? '' : '(OFF)'} ${p.auto ? '• auto' : ''}</span>
        <span class="pill">${esc(p.type)}</span>
      </div>
      <div class="item-meta">
        target=<b>${esc(p.target)}</b> · match=<b>${esc(p.match)}</b> · prompt=${p.prompt ? 'true':'false'}<br/>
        scope: host=${esc(p.scopeHost||'*')} path=${esc(p.scopePath||'*')}
      </div>
      <div class="item-actions">
        <button class="secondary" data-act="load">编辑</button>
        <button class="secondary" data-act="toggle">${p.enabled?'禁用':'启用'}</button>
        <button class="secondary" data-act="apply">应用</button>
        <button class="danger" data-act="del">删除</button>
      </div>
    `;
    div.querySelector('[data-act="load"]').onclick = ()=>{
      $('psName').value=p.name;
      $('psType').value=p.type;
      $('psTarget').value=p.target;
      $('psMatch').value=p.match;
      $('psValue').value=p.value || '';
      $('psPrompt').value=p.prompt ? 'true':'false';
      $('psHost').value=p.scopeHost || '';
      $('psPath').value=p.scopePath || '';
      $('psEnabled').value=p.enabled ? 'true':'false';
      $('psAuto').value=p.auto ? 'true':'false';
      setTab('presets');
    };
    div.querySelector('[data-act="toggle"]').onclick = ()=>{
      const list2 = loadPresets();
      const idx = list2.findIndex(x=>x.name===p.name);
      if(idx>=0){ list2[idx].enabled = !list2[idx].enabled; savePresets(list2); renderPresetList(); }
    };
    div.querySelector('[data-act="del"]').onclick = ()=>{
      if(!confirm('删除该规则？')) return;
      savePresets(loadPresets().filter(x=>x.name!==p.name));
      renderPresetList();
    };
    div.querySelector('[data-act="apply"]').onclick = ()=> applyPresets([p], true);

    box.appendChild(div);
  });
}

function exportPresets(){
  $('psIO').value = JSON.stringify(loadPresets(), null, 2);
}
function importPresets(){
  try{
    const arr = JSON.parse($('psIO').value || '[]');
    if(!Array.isArray(arr)) throw new Error('必须是数组');
    savePresets(arr);
    renderPresetList();
    alert('导入成功');
  }catch(e){
    alert('导入失败：' + (e.message||String(e)));
  }
}
function wipePresets(){
  if(confirm('清空全部预设？')){
    savePresets([]);
    renderPresetList();
  }
}

function scopeMatch(preset, url){
  const {host, path} = parseHostPath(url);
  if(preset.scopeHost && !host.includes(preset.scopeHost)) return false;
  if(preset.scopePath && !path.includes(preset.scopePath)) return false;
  return true;
}

// JSON path setter (simple dot path, supports arrays by [n] like items[0].id)
function setJsonPath(obj, path, value){
  const parts = path.split('.').filter(Boolean);
  let cur = obj;
  for(let i=0;i<parts.length;i++){
    const part = parts[i];
    const m = part.match(/^(\w+)\[(\d+)\]$/);
    if(m){
      const key = m[1], idx = parseInt(m[2],10);
      if(i===parts.length-1){
        if(!Array.isArray(cur[key])) cur[key]=[];
        cur[key][idx]=value;
        return true;
      }else{
        if(!Array.isArray(cur[key])) cur[key]=[];
        if(cur[key][idx] == null) cur[key][idx] = {};
        cur = cur[key][idx];
      }
    }else{
      if(i===parts.length-1){
        cur[part]=value;
        return true;
      }else{
        if(cur[part] == null || typeof cur[part] !== 'object') cur[part] = {};
        cur = cur[part];
      }
    }
  }
  return false;
}

function applyPresets(presets=null, showMsg=false, onlyAuto=false){
  // get enabled presets
  let list = presets ? presets : loadPresets();
  list = list.filter(p=>p.enabled);
  if(onlyAuto) list = list.filter(p=>p.auto);

  const url = $('url').value.trim();
  list = list.filter(p=>scopeMatch(p, url));

  if(list.length===0){
    if(showMsg) $('sendMsg').innerHTML = `<span class="err">没有命中可用预设（检查启用/作用域）。</span>`;
    return;
  }

  // sync from kv to text (keep both coherent)
  const qPairs = kvGet('kvQuery');
  const hPairs = kvGet('kvHeaders');
  let bodyMode = $('bodyMode').value;
  let bodyText = $('bodyText').value || '';

  const setKV = (pairs, key, newVal)=>{
    let hit = false;
    const out = pairs.map(([k,v])=>{
      if(k===key){ hit=true; return [k,newVal]; }
      return [k,v];
    });
    if(!hit) out.push([key,newVal]);
    return {out, hit: true};
  };

  let hits = 0;
  let newQ = qPairs;
  let newH = hPairs;
  let newBody = bodyText;

  for(const p of list){
    let val = p.value ?? '';
    if(p.prompt){
      const typed = prompt(`输入 ${p.name} 的值：`, val);
      if(typed === null) continue;
      val = typed;
    }

    if(p.type === 'kv'){
      if(p.target === 'query'){
        newQ = setKV(newQ, p.match, val).out; hits++;
      }else if(p.target === 'headers'){
        newH = setKV(newH, p.match, val).out; hits++;
      }else if(p.target === 'body_kv'){
        if(bodyMode !== 'form-urlencoded' && bodyMode !== 'multipart') continue;
        const lines = newBody.split('\n');
        let found = false;
        const out = lines.map(line=>{
          const t = line.trim(); if(!t) return line;
          const idx = t.indexOf('=');
          if(idx<0) return line;
          const k = t.slice(0,idx).trim();
          if(k===p.match){ found=true; return `${k}=${val}`; }
          return line;
        });
        if(!found) out.push(`${p.match}=${val}`);
        newBody = out.join('\n');
        hits++;
      }
    } else if(p.type === 'jsonpath'){
      if(bodyMode !== 'json') continue;
      try{
        const obj = JSON.parse(newBody || '{}');
        setJsonPath(obj, p.match, val);
        newBody = JSON.stringify(obj, null, 2);
        hits++;
      }catch{
        // ignore invalid json
      }
    }
  }

  kvSet('kvQuery', newQ);
  kvSet('kvHeaders', newH);
  $('queryText').value = kvToText(newQ, 'kv');
  $('headersText').value = kvToText(newH, 'headers');
  $('bodyText').value = newBody;

  if($('bodyMode').value === 'multipart') refreshMultipartFileInputs();
  if(showMsg) $('sendMsg').innerHTML = `<span class="ok">已应用预设：</span>命中 ${hits} 处。`;
}

// ========= History / Favorites =========
const HISTORY_KEY = 'httpstudio_history_v1';
const STAR_KEY = 'httpstudio_star_v1';

function loadList(key){
  try{ return JSON.parse(localStorage.getItem(key) || '[]'); }catch{ return []; }
}
function saveList(key, arr){
  localStorage.setItem(key, JSON.stringify(arr||[]));
}
function snapshotRequest(response=null){
  // keep both forms consistent
  const qPairs = kvGet('kvQuery');
  const hPairs = kvGet('kvHeaders');
  return {
    ts: nowTs(),
    method: $('method').value,
    url: $('url').value.trim(),
    query_pairs: qPairs,
    headers_pairs: hPairs,
    queryText: $('queryText').value,
    headersText: $('headersText').value,
    bodyMode: $('bodyMode').value,
    bodyText: $('bodyText').value,
    timeout: $('timeout').value,
    allowRedirects: $('allowRedirects').value,
    verifySSL: $('verifySSL').value,
    proxy: $('proxy').value,
    authUser: $('authUser').value,
    cookies: $('cookies').value,
    // 保存 response
    response: response ? {
      ok: response.ok,
      status_code: response.status_code,
      reason: response.reason,
      final_url: response.final_url,
      elapsed_ms: response.elapsed_ms,
      body_len: response.body_len,
      content_type: response.content_type,
      headers_text: response.headers_text,
      body_text: (response.body_text || '').slice(0, 50000), // 限制大小
      truncated: response.truncated
    } : null
  };
}
function loadSnapshot(s){
  $('method').value = s.method || 'GET';
  $('url').value = s.url || '';
  kvSet('kvQuery', s.query_pairs || []);
  kvSet('kvHeaders', s.headers_pairs || []);
  $('queryText').value = s.queryText || kvToText(s.query_pairs||[], 'kv');
  $('headersText').value = s.headersText || kvToText(s.headers_pairs||[], 'headers');
  $('bodyMode').value = s.bodyMode || 'none';
  $('bodyText').value = s.bodyText || '';
  $('timeout').value = s.timeout || 20;
  $('allowRedirects').value = s.allowRedirects || 'true';
  $('verifySSL').value = s.verifySSL || 'true';
  $('proxy').value = s.proxy || '';
  $('authUser').value = s.authUser || '';
  $('cookies').value = s.cookies || '';
  updateBodyUI();
}

function renderHistory(){
  const q = ($('historySearch').value||'').toLowerCase().trim();
  const hist = loadList(HISTORY_KEY);
  const stars = loadList(STAR_KEY);
  const all = [...stars.map(x=>({...x, _star:true})), ...hist.map(x=>({...x, _star:false}))];

  const filtered = q ? all.filter(s=>{
    const hay = `${s.method} ${s.url} ${s.ts}`.toLowerCase();
    return hay.includes(q);
  }) : all;

  const box = $('historyList');
  box.innerHTML = '';
  if(filtered.length===0){
    box.innerHTML = `<div class="item"><div class="item-meta">暂无记录。</div></div>`;
    return;
  }

  filtered.slice(0, 50).forEach(s=>{
    const div = document.createElement('div');
    div.className = 'item';
    const hasResp = s.response && s.response.status_code;
    const respInfo = hasResp ? `<span class="${s.response.ok ? 'ok' : 'err'}">${s.response.status_code}</span> · ${s.response.elapsed_ms}ms` : '<span class="muted">无响应</span>';
    div.innerHTML = `
      <div class="item-title">
        <span>${s._star ? '⭐ ' : ''}${esc(s.method)} ${esc(s.url)}</span>
        <span class="pill">${esc(new Date(s.ts).toLocaleString())}</span>
      </div>
      <div class="item-meta">body=${esc(s.bodyMode)} · q=${(s.query_pairs||[]).length} · h=${(s.headers_pairs||[]).length} · resp: ${respInfo}</div>
      <div class="item-actions">
        <button class="secondary" data-act="load">回放</button>
        <button class="secondary" data-act="send">回放并发送</button>
        ${hasResp ? '<button class="secondary" data-act="resp">查看响应</button>' : ''}
        <button class="danger" data-act="del">删除</button>
      </div>
    `;
    div.querySelector('[data-act="load"]').onclick = ()=> {
      loadSnapshot(s);
      setActivePanel('editor');
    };
    div.querySelector('[data-act="send"]').onclick = ()=>{
      loadSnapshot(s);
      setActivePanel('editor');
      sendNow();
    };
    if(hasResp){
      div.querySelector('[data-act="resp"]').onclick = ()=> renderResponse(s.response);
    }
    div.querySelector('[data-act="del"]').onclick = ()=>{
      if(!confirm('删除该条？')) return;
      if(s._star){
        saveList(STAR_KEY, loadList(STAR_KEY).filter(x=>x.ts!==s.ts));
      }else{
        saveList(HISTORY_KEY, loadList(HISTORY_KEY).filter(x=>x.ts!==s.ts));
      }
      renderHistory();
    };
    box.appendChild(div);
  });
}

// ========= Response drawer =========
let drawerOpen = false;
let lastDownloadId = null;
let previewMode = 'code'; // code or html
function openDrawer(){
  $('drawer').classList.add('open');
  $('backdrop').classList.add('show');
  drawerOpen = true;
}
function closeDrawer(){
  $('drawer').classList.remove('open');
  $('backdrop').classList.remove('show');
  drawerOpen = false;
}
$('btnCloseDrawer').onclick = closeDrawer;
$('backdrop').onclick = closeDrawer;

$('btnToggleView').onclick = ()=>{
  previewMode = (previewMode === 'code') ? 'html' : 'code';
  $('htmlPreview').style.display = (previewMode === 'html') ? 'block' : 'none';
  $('respBody').style.display = (previewMode === 'html') ? 'none' : 'block';
};

$('btnDownload').onclick = ()=>{
  if(!lastDownloadId) return alert('没有可下载内容');
  window.open(`/api/download/${lastDownloadId}`, '_blank');
};

function renderResponse(resp){
  lastDownloadId = resp.download_id || null;

  const ok = !!resp.ok;
  $('respStatus').textContent = `${resp.status_code} ${resp.reason||''}`.trim();
  $('respStatus').style.color = ok ? 'var(--ok)' : 'var(--danger)';
  $('respUrl').textContent = resp.final_url || '';
  $('respHeaders').textContent = resp.headers_text || '';
  $('respBody').textContent = resp.body_text || '';
  $('respMeta').textContent = `耗时 ${resp.elapsed_ms} ms · size ${resp.body_len} bytes` + (resp.truncated ? ' · 预览已截断' : '');
  $('respHint').textContent = resp.truncated ? '提示：响应预览已截断（安全限制）。可用下载按钮获取完整内容（同样可能受预览限制）。' : '';

  // HTML preview
  const ct = (resp.content_type || '').toLowerCase();
  if(ct.includes('text/html')){
    $('htmlPreview').innerHTML = resp.body_text || '';
    $('btnToggleView').style.display = 'inline-block';
  }else{
    $('htmlPreview').innerHTML = '';
    $('btnToggleView').style.display = 'none';
    previewMode = 'code';
    $('htmlPreview').style.display = 'none';
    $('respBody').style.display = 'block';
  }

  openDrawer();
}

// ========= Send (AJAX + AbortController) =========
let currentAbort = null;

function setSending(isSending){
  $('btnSend').disabled = isSending;
  $('btnSend').textContent = isSending ? '发送中…（点我取消）' : '发送';
}

async function sendNow(){
  // sync text areas with kv
  const qPairs = kvGet('kvQuery');
  const hPairs = kvGet('kvHeaders');
  $('queryText').value = kvToText(qPairs, 'kv');
  $('headersText').value = kvToText(hPairs, 'headers');

  $('sendMsg').innerHTML = `<span class="ok">发送中…</span>`;
  // allow cancel by clicking send button again
  if(currentAbort){
    currentAbort.abort();
    currentAbort = null;
    $('sendMsg').innerHTML = `<span class="err">已取消（前端）</span>`;
    setSending(false);
    return;
  }

  currentAbort = new AbortController();
  setSending(true);

  const fd = new FormData();
  fd.append('method', $('method').value);
  fd.append('url', $('url').value);
  fd.append('query_params', $('queryText').value);
  fd.append('headers', $('headersText').value);
  fd.append('body_mode', $('bodyMode').value);
  fd.append('body_text', $('bodyText').value);
  fd.append('timeout', $('timeout').value);
  fd.append('verify_ssl', $('verifySSL').value);
  fd.append('allow_redirects', $('allowRedirects').value);
  fd.append('proxy', $('proxy').value);
  fd.append('auth_user', $('authUser').value);
  fd.append('cookies', $('cookies').value);

  if($('bodyMode').value === 'multipart'){
    document.querySelectorAll('#fileInputs input[type="file"]').forEach(inp=>{
      const key = inp.dataset.filekey;
      if(inp.files && inp.files[0]) fd.append(key, inp.files[0]);
    });
  }
  if($('bodyMode').value === 'raw'){
    if($('rawFile').files && $('rawFile').files[0]) fd.append('__raw_file__', $('rawFile').files[0]);
  }

  try{
    const res = await fetch('/api/send', {method:'POST', body: fd, signal: currentAbort.signal});
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || '发送失败');
    $('sendMsg').innerHTML = `<span class="ok">成功：</span>${data.status_code} ${esc(data.reason||'')}`;
    renderResponse(data);
    // auto save to history with response
    const hist = loadList(HISTORY_KEY);
    hist.unshift(snapshotRequest(data));
    saveList(HISTORY_KEY, hist.slice(0, 80));
    renderHistory();
  }catch(e){
    $('sendMsg').innerHTML = `<span class="err">失败：</span>${esc(e.message||String(e))}`;
  }finally{
    currentAbort = null;
    setSending(false);
  }
}

// ========= cURL parse =========
async function parseCurl(){
  const curl = $('curlText').value || '';
  $('parseMsg').innerHTML = '';
  try{
    const res = await fetch('/api/parse_curl', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({curl})
    });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || '解析失败');

    $('method').value = data.method || 'GET';
    $('url').value = data.url || '';
    kvSet('kvQuery', data.query_pairs || []);
    kvSet('kvHeaders', Object.entries(data.headers || {}));
    $('queryText').value = kvToText(kvGet('kvQuery'), 'kv');
    $('headersText').value = kvToText(kvGet('kvHeaders'), 'headers');
    $('bodyMode').value = data.body_mode || 'none';
    $('bodyText').value = data.body_text || '';
    $('timeout').value = data.timeout || 20;
    $('verifySSL').value = data.insecure ? 'false' : 'true';
    $('allowRedirects').value = data.follow_redirects ? 'true' : 'false';
    $('proxy').value = data.proxy || '';
    $('authUser').value = data.auth_user || '';
    $('cookies').value = data.cookies || '';

    updateBodyUI();

    // auto apply presets (enabled+auto & scope match)
    applyPresets(null, false, true);

    $('parseMsg').innerHTML = `<span class="ok">解析成功</span>（已自动套用 auto 预设）`;
    setActivePanel('editor');
    setTab('req');
  }catch(e){
    $('parseMsg').innerHTML = `<span class="err">解析失败：</span>${esc(e.message||String(e))}`;
  }
}

function fillExample(){
  $('curlText').value =
`curl 'https://httpbin.org/post?x=1' \\
  -X POST \\
  -H 'content-type: application/json' \\
  -H 'x-demo: 123' \\
  -b 'a=1; b=2' \\
  --data-raw '{"hello":"world","realtime":"00:11:00","data":{"realtime":"00:11:00"}}' \\
  -L -k -m 15`;
}

// ========= export curl =========
function exportCurl(){
  const qPairs = kvGet('kvQuery');
  const hPairs = kvGet('kvHeaders');
  const url = $('url').value.trim();
  const method = $('method').value;
  const query = kvToText(qPairs, 'kv').split('\n').map(x=>x.trim()).filter(Boolean).join('&');
  const headers = kvToText(hPairs, 'headers').split('\n').map(x=>x.trim()).filter(Boolean);
  const mode = $('bodyMode').value;
  const body = $('bodyText').value || '';

  let full = url;
  if(query) full += (url.includes('?') ? '&' : '?') + query;

  const parts = [`curl '${full.replaceAll("'", "\\'")}'`];
  if(method !== 'GET') parts.push(`-X ${method}`);
  headers.forEach(h=> parts.push(`-H '${h.replaceAll("'", "\\'")}'`));

  if(mode==='json' && body.trim()) parts.push(`--data-raw '${body.replaceAll("'", "\\'")}'`);
  if(mode==='form-urlencoded' && body.trim()){
    const flat = body.split('\n').map(x=>x.trim()).filter(Boolean).join('&');
    parts.push(`--data '${flat.replaceAll("'", "\\'")}'`);
  }
  if(mode==='raw' && body.trim()) parts.push(`--data-binary '${body.replaceAll("'", "\\'")}'`);
  if(mode==='multipart' && body.trim()){
    body.split('\n').map(x=>x.trim()).filter(Boolean).forEach(line=>{
      parts.push(`-F '${line.replaceAll("'", "\\'")}'`);
    });
  }

  const proxy = $('proxy').value.trim();
  if(proxy) parts.push(`-x '${proxy.replaceAll("'", "\\'")}'`);
  const auth = $('authUser').value.trim();
  if(auth) parts.push(`-u '${auth.replaceAll("'", "\\'")}'`);
  const cookies = $('cookies').value.trim();
  if(cookies) parts.push(`-b '${cookies.replaceAll("'", "\\'")}'`);
  if($('verifySSL').value==='false') parts.push(`-k`);
  if($('allowRedirects').value==='true') parts.push(`-L`);
  if($('timeout').value) parts.push(`-m ${$('timeout').value}`);

  navigator.clipboard.writeText(parts.join(' \\\n  '));
  $('sendMsg').innerHTML = `<span class="ok">已复制 cURL</span>`;
}

// ========= reset =========
function resetAll(){
  $('curlText').value='';
  $('method').value='GET';
  $('url').value='';
  kvSet('kvQuery',[['','']]);
  kvSet('kvHeaders',[['','']]);
  $('queryText').value='';
  $('headersText').value='';
  $('bodyMode').value='none';
  $('bodyText').value='';
  $('timeout').value=20;
  $('allowRedirects').value='true';
  $('verifySSL').value='true';
  $('proxy').value='';
  $('authUser').value='';
  $('cookies').value='';
  $('parseMsg').innerHTML='';
  $('sendMsg').innerHTML='';
  updateBodyUI();
}

// ========= wiring =========
$('btnExample').onclick = fillExample;
$('btnParse').onclick = parseCurl;
$('btnSend').onclick = sendNow;
$('btnApplyPresets').onclick = ()=> applyPresets(null, true, false);
$('btnExportCurl').onclick = exportCurl;
$('btnReset').onclick = resetAll;

$('qAdd').onclick = ()=> { kvAdd('kvQuery'); syncKvToText('kvQuery'); };
$('hAdd').onclick = ()=> { kvAdd('kvHeaders'); syncKvToText('kvHeaders'); };
$('qSync').onclick = ()=> $('queryText').value = kvToText(kvGet('kvQuery'),'kv');
$('hSync').onclick = ()=> $('headersText').value = kvToText(kvGet('kvHeaders'),'headers');
$('qImport').onclick = ()=> kvSet('kvQuery', kvFromText($('queryText').value, 'kv'));
$('hImport').onclick = ()=> kvSet('kvHeaders', kvFromText($('headersText').value, 'headers'));

// 文本框实时同步到 KV
$('queryText').addEventListener('input', ()=> kvSet('kvQuery', kvFromText($('queryText').value, 'kv')));
$('headersText').addEventListener('input', ()=> kvSet('kvHeaders', kvFromText($('headersText').value, 'headers')));

$('psSave').onclick = presetUpsert;
$('psClear').onclick = presetClear;
$('psApply').onclick = ()=> applyPresets(null, true, false);
$('psExport').onclick = exportPresets;
$('psImport').onclick = importPresets;
$('psWipe').onclick = wipePresets;

$('historySearch').addEventListener('input', renderHistory);
$('btnSaveHistory').onclick = ()=>{
  const hist = loadList(HISTORY_KEY);
  hist.unshift(snapshotRequest());
  saveList(HISTORY_KEY, hist.slice(0, 80));
  renderHistory();
};
$('btnSaveStar').onclick = ()=>{
  const stars = loadList(STAR_KEY);
  stars.unshift(snapshotRequest());
  saveList(STAR_KEY, stars.slice(0, 80));
  renderHistory();
};
$('btnClearHistory').onclick = ()=>{
  if(confirm('清空历史（不含收藏）？')){
    saveList(HISTORY_KEY, []);
    renderHistory();
  }
};

// mobile bar
$('mParse').onclick = ()=> { setActivePanel('curl'); };
$('mPresets').onclick = ()=> applyPresets(null, true, false);
$('mSend').onclick = sendNow;

// init
(function init(){
  kvSet('kvQuery',[['','']]);
  kvSet('kvHeaders',[['','']]);
  updateBodyUI();
  renderPresetList();
  renderHistory();
  setTab('req');
  setActivePanel('editor');
})();
