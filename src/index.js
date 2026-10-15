import { createHash } from 'node:crypto';
import { handleYspRequest } from './ysp.js';

// ==================== 常量 ====================
const KANKAN_API_BASE = 'https://kapi.kankanews.com';
const KANKAN_API_VERSION = '2.42.23';
const KANKAN_API_SECRET = '28c8edde3d61a0411511d3b1866f0636';
const KANKAN_UA =
  'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.5845.97 Safari/537.36 SE 2.X MetaSr 1.0';

const LIVE_URL_CACHE_TTL = 600;
const LIVE_URL_MIN_LEFT = 90;
const DONOR_SCAN_DAYS = 7;
const FALLBACK_LIVE_URL = 'https://cdn.jsdelivr.net/gh/jkwu5472/first/media.m3u8';

const channelInfo = {
  dfws:   { cid: 1,  name: '东方卫视',   desc: '上海卫视主频道' },
  shxwzh: { cid: 2,  name: '新闻综合',   desc: '上海新闻综合频道' },
  shds:   { cid: 4,  name: '上海都市',   desc: '上海都市频道' },
  dycj:   { cid: 5,  name: '第一财经',   desc: '第一财经频道' },
  hhxd:   { cid: 9,  name: '哈哈炫动',   desc: '少儿频道' },
  wxty:   { cid: 10, name: '五星体育',   desc: '五星体育频道' },
  mdy:    { cid: 11, name: '魅力音乐',   desc: '魅力音乐频道' },
  jsrw:   { cid: 12, name: '纪实人文',   desc: '纪实人文频道' },
};


// ==================== 工具函数 ====================

function md5(str) {
  return createHash('md5').update(str).digest('hex');
}

function getnonce(len = 8) {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let nonce = '';
  for (let i = 0; i < len; i++) nonce += alphabet[bytes[i] % alphabet.length];
  return nonce;
}

function getuuid(len = 21) {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_');
  return b64.slice(0, len);
}

let _stableUuid = null;
function getStableUuid() {
  if (_stableUuid) return _stableUuid;
  _stableUuid = getuuid();
  return _stableUuid;
}

function shanghaiDate(offsetDays = 0) {
  const now = new Date(Date.now() - offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

function toLocalProxyUrl(url, env) {
  const prefix = env?.KK_PROXY_PREFIX || '';
  if (!prefix) return url;
  if (url.startsWith('https://')) return prefix + url.slice(8);
  return url;
}


// ==================== RSA 公钥解密 ====================

const KANKAN_PUBLIC_KEY_B64 =
  'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDP5hzPUW5RFeE2xBT1ERB3hHZI' +
  'Votn/qatWhgc1eZof09qKjElFN6Nma461ZAwGpX4aezKP8Adh4WJj4u2O54xCXDt' +
  'wzKRqZO2oNZkuNmF2Va8kLgiEQAAcxYc8JgTN+uQQNpsep4n/o1sArTJooZIF17E' +
  'tSqSgXDcJ7yDj5rc7wIDAQAB';

let _rsaKey = null;

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function parseAsn1Integers(der) {
  const ints = [];
  const len = der.length;
  let i = 0;
  while (i + 2 < len) {
    if (der[i] !== 0x02) { i++; continue; }
    let l = der[i + 1];
    let start = i + 2;
    if (l & 0x80) {
      const n = l & 0x7f;
      l = 0;
      for (let j = 0; j < n; j++) l = (l << 8) | der[start + j];
      start += n;
    }
    if (start + l <= len) {
      let hex = '';
      for (let j = start; j < start + l; j++)
        hex += der[j].toString(16).padStart(2, '0');
      hex = hex.replace(/^0+/, '') || '0';
      ints.push(hex);
      i = start + l;
    } else { i++; }
  }
  return ints;
}

function getRsaKey() {
  if (_rsaKey) return _rsaKey;
  const der = base64ToBytes(KANKAN_PUBLIC_KEY_B64);
  const ints = parseAsn1Integers(der);
  _rsaKey = {
    n: BigInt('0x' + ints[0]),
    e: BigInt('0x' + ints[1]),
  };
  return _rsaKey;
}

function modPow(base, exp, mod) {
  let result = 1n;
  base = base % mod;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;
    exp >>= 1n;
    base = (base * base) % mod;
  }
  return result;
}

function bytesToBigInt(bytes) {
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return BigInt('0x' + (hex || '0'));
}

function bigIntToBytes(val, length) {
  let hex = val.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  const hexBytes = hex.match(/.{2}/g) || [];
  const bytes = new Uint8Array(length);
  const offset = length - hexBytes.length;
  for (let i = 0; i < hexBytes.length; i++)
    bytes[offset + i] = parseInt(hexBytes[i], 16);
  return bytes;
}

function rsaPublicDecrypt(str) {
  if (!str || typeof str !== 'string' || str === '') return null;
  let encData;
  try { encData = base64ToBytes(str); } catch { return null; }
  if (encData.length < 128) return null;

  const key = getRsaKey();
  let result = '';

  for (let i = 0; i + 128 <= encData.length; i += 128) {
    const chunk = encData.slice(i, i + 128);
    const c = bytesToBigInt(chunk);
    const m = modPow(c, key.e, key.n);
    const block = bigIntToBytes(m, 128);

    // PKCS1 type 1 padding: 0x00 0x01 0xFF...0xFF 0x00 <message>
    if (block[0] !== 0x00 || block[1] !== 0x01) continue;
    let j = 2;
    while (j < 128 && block[j] === 0xff) j++;
    if (j >= 128 || block[j] !== 0x00) continue;

    const msgBytes = block.slice(j + 1);
    let msg = '';
    for (let k = 0; k < msgBytes.length; k++)
      msg += String.fromCharCode(msgBytes[k]);
    result += msg;
  }

  return result || null;
}

// ==================== API 请求 ====================

async function kankanApiGet(path, params, env, clientIp) {
  const t = Math.floor(Date.now() / 1000);
  const nonce = getnonce(8);
  const uuid = getStableUuid();

  const all = { ...params };
  all['Api-Version'] = 'v1';
  all['nonce'] = nonce;
  all['platform'] = 'pc';
  all['timestamp'] = t;
  all['version'] = KANKAN_API_VERSION;

  const sortedKeys = Object.keys(all).sort();
  let signStr = '';
  for (const k of sortedKeys) {
    let v = all[k];
    if (v === null || v === undefined) continue;
    if (typeof v === 'object') {
      v = JSON.stringify(v).replace(/\//g, '\\/');
    }
    signStr += k + '=' + v + '&';
  }
  const sign = md5(md5(signStr + KANKAN_API_SECRET));

  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params))
    query.append(k, String(v));
  const url = toLocalProxyUrl(KANKAN_API_BASE + path + '?' + query.toString(), env);

  const headers = {
    'Api-Version': 'v1',
    'Nonce': nonce,
    'M-Uuid': uuid,
    'Platform': 'pc',
    'Version': KANKAN_API_VERSION,
    'Timestamp': String(t),
    'Sign': sign,
    'Accept': 'application/json, text/plain, */*',
    'Origin': 'https://live.kankanews.com',
    'Referer': 'https://live.kankanews.com/',
    'User-Agent': KANKAN_UA,
  };
  if (clientIp) {
    headers['X-Forwarded-For'] = clientIp;
    headers['Client-Ip'] = clientIp;
  }

  try {
    const resp = await fetch(url, { headers });
    const data = await resp.json();
    return (typeof data === 'object' && data !== null) ? data : null;
  } catch {
    return null;
  }
}

function pickProgramAddress(programDetail) {
  const ci = programDetail?.result?.channel_info || {};
  const live = String(ci.live_address || '');
  const shift = String(ci.shift_address || '');
  if (live) return { addr: live, kind: 'live' };
  if (shift) return { addr: shift, kind: 'shift' };
  return null;
}

async function fetchPrograms(channelId, date, env, clientIp) {
  const res = await kankanApiGet('/content/pc/tv/programs',
    { channel_id: channelId, date }, env, clientIp);
  return res?.result?.programs || [];
}

async function fetchProgramDetail(programId, env, clientIp) {
  return kankanApiGet('/content/pc/tv/program/detail',
    { channel_program_id: programId }, env, clientIp);
}

async function fetchPlayAddress(channelId, env, clientIp) {
  // 1. 频道详情 → live_address
  const detail = await kankanApiGet('/content/pc/tv/channel/detail',
    { channel_id: channelId }, env, clientIp);
  const chanLive = String(detail?.result?.live_address || '');
  if (chanLive) return { addr: chanLive, kind: 'live', source: 'channel' };

  // 2. 当前节目
  const today = shanghaiDate(0);
  const list = await fetchPrograms(channelId, today, env, clientIp);
  const now = Math.floor(Date.now() / 1000);
  let current = null;
  for (const p of list) {
    const s = parseInt(p.start_time || 0, 10);
    const e = parseInt(p.end_time || 0, 10);
    if (s <= now && now < e) { current = p; break; }
  }
  if (current) {
    const pd = await fetchProgramDetail(current.id, env, clientIp);
    const pick = pickProgramAddress(pd);
    if (pick)
      return { addr: pick.addr, kind: pick.kind, source: 'current-program', program: current };
  }

  // 3. 供体扫描
  let fallbackShift = null;
  for (let off = 0; off < DONOR_SCAN_DAYS; off++) {
    const date = shanghaiDate(off);
    let dayList;
    if (off === 0 && list.length > 0) {
      dayList = list;
    } else {
      dayList = await fetchPrograms(channelId, date, env, clientIp);
    }
    if (!dayList || dayList.length === 0) continue;

    const candidates = dayList.filter((p) =>
      parseInt(p.can_review || 0, 10) === 1 ||
      parseInt(p.is_review || 0, 10) === 1
    );

    candidates.sort((a, b) => {
      const sa = String(a.name || '').includes('体育') ? 0 : 1;
      const sb = String(b.name || '').includes('体育') ? 0 : 1;
      return sa - sb;
    });

    for (const p of candidates) {
      const pd = await fetchProgramDetail(p.id, env, clientIp);
      const pick = pickProgramAddress(pd);
      if (pick && pick.kind === 'shift')
        return { addr: pick.addr, kind: 'shift', source: 'donor', program: p };
      if (pick && !fallbackShift)
        fallbackShift = { addr: pick.addr, kind: pick.kind, source: 'donor', program: p };
    }
  }

  return fallbackShift || null;
}

// ==================== URL 处理 ====================

function urlExpiry(urlStr) {
  try {
    const parts = new URL(urlStr);
    const q = Object.fromEntries(parts.searchParams.entries());
    const cands = [];
    for (const k of ['volcTime', 'txTime', 'wsTime']) {
      if (q[k]) {
        const v = String(q[k]);
        if (/^[0-9a-fA-F]+$/.test(v) && !/^\d+$/.test(v))
          cands.push(parseInt(v, 16));
        else
          cands.push(parseInt(v, 10));
      }
    }
    if (q.token) {
      const parts2 = String(q.token).split('.');
      if (parts2.length >= 2) {
        try {
          const payload = JSON.parse(atob(parts2[1].replace(/-/g, '+').replace(/_/g, '/')));
          if (payload?.exp) cands.push(parseInt(payload.exp, 10));
        } catch {}
      }
    }
    const valid = cands.filter((v) => v > 1600000000);
    return valid.length ? Math.min(...valid) : 0;
  } catch {
    return 0;
  }
}

function normalizeLiveUrl(urlStr) {
  try {
    const parts = new URL(urlStr);
    const params = new URLSearchParams(parts.search);
    for (const key of [...params.keys()]) {
      if (['start', 'end', 'starttime', 'endtime'].includes(key.toLowerCase()))
        params.delete(key);
    }
    let result = parts.protocol + '//' + parts.host + parts.pathname;
    const search = params.toString();
    if (search) result += '?' + search;
    return result;
  } catch {
    return urlStr;
  }
}

// ==================== M3U8 处理 ====================

async function fetchContent(url, env) {
  const headers = {
    'User-Agent': KANKAN_UA,
    'Accept': '*/*',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'Origin': 'https://live.kankanews.com',
    'Referer': 'https://live.kankanews.com/',
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const resp = await fetch(toLocalProxyUrl(url, env), {
        headers, redirect: 'follow',
      });
      if (resp.status === 200) {
        const text = await resp.text();
        if (text) return text;
      }
    } catch {}
  }
  return null;
}

function toAbsoluteUrl(base, relative) {
  relative = String(relative);
  if (!relative) return base;
  if (/^https?:\/\//i.test(relative)) return relative;
  const parts = new URL(base);
  const path = parts.pathname;
  const baseDir = path.substring(0, path.lastIndexOf('/') + 1);
  if (relative[0] === '/') relative = relative.replace(/^\/+/, '');
  return parts.protocol + '//' + parts.host + baseDir + relative;
}

function rewritePlaylistTagUris(line, base) {
  return line.replace(/URI="([^"]+)"/gi, (_match, uri) => {
    return 'URI="' + toAbsoluteUrl(base, uri) + '"';
  });
}

async function getFlatM3u8(url, depth, env) {
  if (depth > 5) return '';
  const content = await fetchContent(url, env);
  if (!content) return '';
  const lines = content.split(/\r\n|\n|\r/);
  const output = [];
  const count = lines.length;
  let i = 0;
  while (i < count) {
    const line = lines[i].trim();
    if (line.startsWith('#EXT-X-STREAM-INF')) {
      i++;
      if (i >= count) break;
      const subUrl = lines[i].trim();
      if (subUrl === '' || subUrl[0] === '#') { i++; continue; }
      const subContent = await getFlatM3u8(toAbsoluteUrl(url, subUrl), depth + 1, env);
      if (subContent) return subContent;
    } else if (line.startsWith('#EXTINF:')) {
      output.push(line);
      i++;
      if (i >= count) break;
      const tsUrl = lines[i].trim();
      if (tsUrl !== '' && tsUrl[0] !== '#')
        output.push(toAbsoluteUrl(url, tsUrl));
      else
        output.push(tsUrl);
    } else if (line !== '') {
      output.push(rewritePlaylistTagUris(line, url));
    }
    i++;
  }
  const joined = output.join('\n');
  return joined.includes('#EXTINF') ? joined : '';
}

// ==================== 缓存 (Cache API) ====================

async function readCachedLiveUrl(channelId) {
  const cache = caches.default;
  const cacheKey = new Request(`https://kankan-live-cache.internal/channel-${channelId}`);
  const cached = await cache.match(cacheKey);
  if (!cached) return null;
  try {
    const d = await cached.json();
    const now = Math.floor(Date.now() / 1000);
    if (d.created && now - d.created >= LIVE_URL_CACHE_TTL) return null;
    if (!d.url || !d.url.startsWith('https://')) return null;
    if (d.exp > 0 && d.exp - now < LIVE_URL_MIN_LEFT) return null;
    return d.url;
  } catch {
    return null;
  }
}

async function writeCachedLiveUrl(channelId, url) {
  const exp = urlExpiry(url) || (Math.floor(Date.now() / 1000) + 300);
  const cache = caches.default;
  const cacheKey = new Request(`https://kankan-live-cache.internal/channel-${channelId}`);
  await cache.put(cacheKey, new Response(
    JSON.stringify({ url, exp, created: Math.floor(Date.now() / 1000) }),
    { headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${LIVE_URL_CACHE_TTL}` } }
  ));
}

async function clearCachedLiveUrl(channelId) {
  const cache = caches.default;
  const cacheKey = new Request(`https://kankan-live-cache.internal/channel-${channelId}`);
  await cache.delete(cacheKey);
}

// ==================== 主逻辑 ====================

async function getLiveUrl(channelId, forceRefresh, env, clientIp) {
  let cacheHit = false;
  let meta = { source: 'cache' };

  if (!forceRefresh) {
    const cached = await readCachedLiveUrl(channelId);
    if (cached) {
      cacheHit = true;
      return { liveUrl: cached, cacheHit, meta };
    }
  }

  const found = await fetchPlayAddress(channelId, env, clientIp);
  if (!found) {
    console.log('[wxty] address-failed');
    return { liveUrl: null, cacheHit: false, meta };
  }

  const plain = rsaPublicDecrypt(found.addr);
  if (!plain) {
    console.log('[wxty] decrypt-failed (source=' + found.source + ')');
    return { liveUrl: null, cacheHit: false, meta };
  }

  const liveUrl = normalizeLiveUrl(plain);
  if (!liveUrl) {
    console.log('[wxty] bad-url');
    return { liveUrl: null, cacheHit: false, meta };
  }

  meta = {
    source: found.source,
    kind: found.kind,
    program: found.program?.name || null,
    program_id: found.program?.id || null,
    shift_url: plain,
  };

  await writeCachedLiveUrl(channelId, liveUrl);
  return { liveUrl, cacheHit: false, meta };
}

function redirectToFallback(reason) {
  const r = (reason || 'unknown').replace(/[^A-Za-z0-9_-]/g, '');
  console.log('[wxty] fallback -> ' + FALLBACK_LIVE_URL + ' (reason: ' + r + ')');
  return new Response(null, {
    status: 302,
    headers: {
      'Location': FALLBACK_LIVE_URL,
      'X-Fallback-Reason': r,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}

async function handleTsProxy(url, env) {
  const tsUrl = decodeURIComponent(url.searchParams.get('ts_url') || '');
  if (!/^https?:\/\//i.test(tsUrl)) return new Response('Invalid url', { status: 400 });

  let filename;
  try {
    filename = new URL(tsUrl).pathname.split('/').pop() || '';
  } catch {
    return new Response('Invalid url', { status: 400 });
  }

  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.(ts|m4s|mp4|aac|key|vtt)$/.test(filename) || filename.includes('..'))
    return new Response('Invalid filename', { status: 400 });

  const cache = caches.default;
  const cacheKey = new Request(`https://ts-cache.internal/${filename}`);
  const cached = await cache.match(cacheKey);
  if (cached) {
    return new Response(cached.body, {
      headers: { 'Content-Type': 'video/MP2T', 'Cache-Control': 'max-age=86400' },
    });
  }

  const headers = {
    'User-Agent': KANKAN_UA,
    'Accept': '*/*',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'Origin': 'https://live.kankanews.com',
    'Referer': 'https://live.kankanews.com/',
  };

  try {
    const resp = await fetch(toLocalProxyUrl(tsUrl, env), { headers, redirect: 'follow' });
    if (resp.status !== 200) return new Response('无法获取 TS 分片', { status: 502 });
    const data = await resp.arrayBuffer();
    const cacheResp = new Response(data, {
      headers: { 'Content-Type': 'video/MP2T', 'Cache-Control': 'max-age=86400' },
    });
    await cache.put(cacheKey, cacheResp.clone());
    return cacheResp;
  } catch {
    return new Response('无法获取 TS 分片', { status: 502 });
  }
}


// ==================== 频道列表页 ====================

function handleChannelList() {
  const channels = Object.entries(channelInfo);
  const cards = channels.map(([key, ch]) => `
    <a class="card" href="/?id=${key}">
      <div class="card-name">${ch.name}</div>
      <div class="card-desc">${ch.desc}</div>
    </a>`).join('');

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>看看新闻 · 直播频道</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #0f1117; color: #e4e6eb; min-height: 100vh;
  }
  .header {
    text-align: center; padding: 32px 16px 20px;
  }
  .header h1 {
    font-size: 1.5rem; font-weight: 600; color: #fff;
  }
  .header p {
    font-size: 0.85rem; color: #8b8f98; margin-top: 6px;
  }
  .grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 12px; padding: 16px; max-width: 720px; margin: 0 auto;
  }
  .card {
    display: flex; flex-direction: column; justify-content: center;
    background: #1a1d27; border: 1px solid #2a2d3a; border-radius: 12px;
    padding: 20px 16px; text-decoration: none; color: inherit;
    transition: all 0.15s ease; min-height: 90px;
  }
  .card:hover {
    background: #232734; border-color: #3a3d4a; transform: translateY(-2px);
  }
  .card:active { transform: translateY(0); }
  .card-name {
    font-size: 1.1rem; font-weight: 600; color: #fff; margin-bottom: 4px;
  }
  .card-desc {
    font-size: 0.75rem; color: #8b8f98;
  }
  .footer {
    text-align: center; padding: 20px; font-size: 0.75rem; color: #555;
  }
</style>
</head>
<body>
  <div class="header">
    <h1>📺 看看新闻 · 直播</h1>
    <p>点击频道开始播放</p>
  </div>
  <div class="grid">${cards}</div>
  <div class="footer">共 ${channels.length} 个频道</div>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}



// ==================== 入口 ====================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const source = url.searchParams.get('source');
    if (source === 'ysp') {
      return handleYspRequest(request, url, env);
    }
    const id = url.searchParams.get('id');

    // 没有 id 参数 → 显示频道列表
    if (!id) return handleChannelList();

    if (!channelInfo[id]) return new Response('无效频道ID', { status: 400 });
    const channelId = channelInfo[id].cid;


    // TS 分片代理
    if (url.searchParams.has('ts_url')) return handleTsProxy(url, env);

    const clientIp = request.headers.get('CF-Connecting-IP') || '';

    // 获取直播地址
    const forceRefresh = url.searchParams.has('refresh') && url.searchParams.get('refresh') !== '0';
    let { liveUrl, cacheHit, meta } = await getLiveUrl(channelId, forceRefresh, env, clientIp);

    if (!liveUrl) return redirectToFallback();

    // 获取并展平 m3u8
    let finalM3u8 = await getFlatM3u8(liveUrl, 0, env);

    // 缓存命中但 m3u8 获取失败 → 清缓存重试
    if (!finalM3u8 && cacheHit) {
      await clearCachedLiveUrl(channelId);
      const retry = await getLiveUrl(channelId, true, env, clientIp);
      if (retry.liveUrl) {
        liveUrl = retry.liveUrl;
        cacheHit = retry.cacheHit;
        meta = retry.meta;
        finalM3u8 = await getFlatM3u8(liveUrl, 0, env);
      }
    }

    if (!finalM3u8) return redirectToFallback('playlist-fetch-failed');

    // info 端点
    if (url.searchParams.has('info')) {
      return new Response(JSON.stringify({
        id,
        channel_id: channelId,
        source: meta.source || null,
        kind: meta.kind || null,
        program: meta.program || null,
        program_id: meta.program_id || null,
        live_url: liveUrl,
        cache: cacheHit ? 'HIT' : 'MISS',
        expires_in: Math.max(0, urlExpiry(liveUrl) - Math.floor(Date.now() / 1000)),
        segment_count: (finalM3u8.match(/#EXTINF/g) || []).length,
        fallback_url: FALLBACK_LIVE_URL,
      }, null, 2), {
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    }

    // 返回 m3u8
    return new Response(finalM3u8, {
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Live-Url-Cache': cacheHit ? 'HIT' : 'MISS',
        'X-Live-Url-Source': meta.source || '-',
      },
    });
  },
};
