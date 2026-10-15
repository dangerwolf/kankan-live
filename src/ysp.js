const YSP_API_BASE = 'https://bkliveinfo.ysp.cctv.cn';
const YSP_TIMEOUT_MS = 10000;
const YSP_MAX_REDIRECTS = 3;
const YSP_MAX_M3U8_DEPTH = 5;
const YSP_MAX_M3U8_SIZE = 2 * 1024 * 1024;
const YSP_LIVE_CACHE_TTL = 50;
const YSP_LIVE_MIN_LEFT = 20;

const TEA_CKEY_HEX = '59b2f7cf725ef43c34fdd7c123411ed3';
const GUARD_TEA_KEY_HEX = '110DBEC10C23E7D2E56A1CAD6914EF1B';
const SALT_LEN = 2;
const ZERO_LEN = 7;

const XOR_KEY = Uint8Array.from([0x84, 0x2E, 0xED, 0x08, 0xF0, 0x66, 0xE6, 0xEA, 0x48, 0xB4, 0xCA, 0xA9, 0x91, 0xED, 0x6F, 0xF3]);
const GUARD_XOR_KEY = Uint8Array.from([0xB3, 0xC9, 0x53, 0xA0, 0x69, 0x13, 0xAD, 0x4D]);

const STANDARD_B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
const CUSTOM_B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-=';

const MEDIA_HOST_SUFFIXES = [
  '.ysp.cctv.cn',
  '.cctv.cn',
  '.cctv.com',
  '.cntv.myhwcdn.cn',
  '.myqcloud.com',
];

export const yspChannels = {
  cctv1: { cnlid: '2024078201', livepid: '600001859', defn: 'fhd', name: 'CCTV-1综合' },
  cctv2: { cnlid: '2024075401', livepid: '600001800', defn: 'fhd', name: 'CCTV-2财经' },
  cctv3: { cnlid: '2024068501', livepid: '600001801', defn: 'fhd', name: 'CCTV-3综艺' },
  cctv4: { cnlid: '2029797101', livepid: '600001814', defn: 'fhd', name: 'CCTV-4中文国际' },
  cctv5: { cnlid: '2024078401', livepid: '600001818', defn: 'fhd', name: 'CCTV-5体育' },
  cctv5p: { cnlid: '2024078001', livepid: '600001817', defn: 'fhd', name: 'CCTV-5+体育赛事' },
  cctv6: { cnlid: '2013693901', livepid: '600108442', defn: 'fhd', name: 'CCTV-6电影' },
  cctv7: { cnlid: '2024072001', livepid: '600004092', defn: 'fhd', name: 'CCTV-7国防军事' },
  cctv8: { cnlid: '2029793001', livepid: '600001803', defn: 'fhd', name: 'CCTV-8电视剧' },
  cctv9: { cnlid: '2024078601', livepid: '600004078', defn: 'fhd', name: 'CCTV-9纪录' },
  cctv10: { cnlid: '2024078701', livepid: '600001805', defn: 'fhd', name: 'CCTV-10科教' },
  cctv11: { cnlid: '2027248701', livepid: '600001806', defn: 'fhd', name: 'CCTV-11戏曲' },
  cctv12: { cnlid: '2027248801', livepid: '600001807', defn: 'fhd', name: 'CCTV-12社会与法' },
  cctv13: { cnlid: '2029797201', livepid: '600001811', defn: 'fhd', name: 'CCTV-13新闻' },
  cctv14: { cnlid: '2027248901', livepid: '600001809', defn: 'fhd', name: 'CCTV-14少儿' },
  cctv15: { cnlid: '2027249001', livepid: '600001815', defn: 'fhd', name: 'CCTV-15音乐' },
  cctv16: { cnlid: '2027249101', livepid: '600098637', defn: 'fhd', name: 'CCTV-16奥林匹克' },
  cctv164k: { cnlid: '2027249301', livepid: '600099502', defn: 'fhd', name: 'CCTV-16 4K' },
  cctv17: { cnlid: '2027249401', livepid: '600001810', defn: 'fhd', name: 'CCTV-17农业农村' },
  cctv4k: { cnlid: '2029810301', livepid: '600002264', defn: 'fhd', name: 'CCTV-4K' },
  cctv8k: { cnlid: '2026774101', livepid: '600156816', defn: 'fhd', name: 'CCTV-8K' },
  cgtn: { cnlid: '2024181701', livepid: '600014550', defn: 'fhd', name: 'CGTN' },
  cgtnfy: { cnlid: '2024181801', livepid: '600084704', defn: 'fhd', name: 'CGTN法语' },
  cgtney: { cnlid: '2024181901', livepid: '600084758', defn: 'fhd', name: 'CGTN俄语' },
  cgtnalby: { cnlid: '2024182001', livepid: '600084782', defn: 'fhd', name: 'CGTN阿拉伯语' },
  cgtnxby: { cnlid: '2024182101', livepid: '600084744', defn: 'fhd', name: 'CGTN西班牙语' },
  cgtnwyjl: { cnlid: '2024182301', livepid: '600084781', defn: 'fhd', name: 'CGTN外语纪录' },
  cctvfyjc: { cnlid: '2025637103', livepid: '600099658', defn: 'shd', name: 'CCTV风云剧场' },
  cctvdyjc: { cnlid: '2026874203', livepid: '600099655', defn: 'shd', name: 'CCTV第一剧场' },
  cctvhjjc: { cnlid: '2026874303', livepid: '600099620', defn: 'shd', name: 'CCTV怀旧剧场' },
  cctvsjdl: { cnlid: '2026874403', livepid: '600099637', defn: 'shd', name: 'CCTV世界地理' },
  cctvfyyy: { cnlid: '2026874503', livepid: '600099660', defn: 'shd', name: 'CCTV风云音乐' },
  cctvbqkj: { cnlid: '2026874603', livepid: '600099649', defn: 'shd', name: 'CCTV兵器科技' },
  cctvfyzq: { cnlid: '2026966203', livepid: '600099636', defn: 'shd', name: 'CCTV风云足球' },
  cctvgeqwq: { cnlid: '2026874703', livepid: '600099659', defn: 'shd', name: 'CCTV高尔夫网球' },
  cctvnxss: { cnlid: '2026874803', livepid: '600099650', defn: 'shd', name: 'CCTV女性时尚' },
  cctvyswhjp: { cnlid: '2026874903', livepid: '600099653', defn: 'shd', name: 'CCTV央视文化精品' },
  cctvystq: { cnlid: '2026875003', livepid: '600099652', defn: 'shd', name: 'CCTV央视台球' },
  cctvdszn: { cnlid: '2026875103', livepid: '600099656', defn: 'shd', name: 'CCTV电视指南' },
  cctvwsjk: { cnlid: '2025637003', livepid: '600099651', defn: 'shd', name: 'CCTV卫生健康' },
  bjws: { cnlid: '2024052703', livepid: '600002309', defn: 'fhd', name: '北京卫视' },
  jsws: { cnlid: '2024171103', livepid: '600002521', defn: 'fhd', name: '江苏卫视' },
  dfws: { cnlid: '2024054503', livepid: '600002483', defn: 'fhd', name: '东方卫视' },
  zjws: { cnlid: '2024054703', livepid: '600002520', defn: 'fhd', name: '浙江卫视' },
  hnws: { cnlid: '2024054803', livepid: '600002475', defn: 'fhd', name: '湖南卫视' },
  hbws: { cnlid: '2024171203', livepid: '600002508', defn: 'fhd', name: '湖北卫视' },
  gdws: { cnlid: '2024060903', livepid: '600002485', defn: 'fhd', name: '广东卫视' },
  gxws: { cnlid: '2024060703', livepid: '600002509', defn: 'fhd', name: '广西卫视' },
  hljws: { cnlid: '2029797003', livepid: '600002498', defn: 'fhd', name: '黑龙江卫视' },
  hnws2: { cnlid: '2024055603', livepid: '600002506', defn: 'fhd', name: '海南卫视' },
  cqws: { cnlid: '2024061103', livepid: '600002531', defn: 'fhd', name: '重庆卫视' },
  szws: { cnlid: '2024061303', livepid: '600002481', defn: 'fhd', name: '深圳卫视' },
  scws: { cnlid: '2024061403', livepid: '600002516', defn: 'fhd', name: '四川卫视' },
  henanws: { cnlid: '2029797303', livepid: '600002525', defn: 'fhd', name: '河南卫视' },
  fjdnhz: { cnlid: '2024061503', livepid: '600002484', defn: 'fhd', name: '福建东南卫视' },
  gzhws: { cnlid: '2024061603', livepid: '600002490', defn: 'fhd', name: '贵州卫视' },
  jxws: { cnlid: '2024061703', livepid: '600002503', defn: 'fhd', name: '江西卫视' },
  lnws: { cnlid: '2024171303', livepid: '600002505', defn: 'fhd', name: '辽宁卫视' },
  ahws: { cnlid: '2024171403', livepid: '600002532', defn: 'fhd', name: '安徽卫视' },
  hbws2: { cnlid: '2024171503', livepid: '600002493', defn: 'fhd', name: '河北卫视' },
  sdws: { cnlid: '2029787903', livepid: '600002513', defn: 'fhd', name: '山东卫视' },
  tjws: { cnlid: '2019927003', livepid: '600152137', defn: 'fhd', name: '天津卫视' },
  jlws: { cnlid: '2025561503', livepid: '600190405', defn: 'fhd', name: '吉林卫视' },
  shanxiws: { cnlid: '2029795103', livepid: '600190400', defn: 'fhd', name: '陕西卫视' },
  nxws: { cnlid: '2025608503', livepid: '600190737', defn: 'fhd', name: '宁夏卫视' },
  nmgws: { cnlid: '2025561203', livepid: '600190401', defn: 'fhd', name: '内蒙古卫视' },
  ynws: { cnlid: '2025561303', livepid: '600190402', defn: 'fhd', name: '云南卫视' },
  shanxiws2: { cnlid: '2025560803', livepid: '600190407', defn: 'fhd', name: '山西卫视' },
  qhws: { cnlid: '2025559103', livepid: '600190406', defn: 'fhd', name: '青海卫视' },
  xzws: { cnlid: '2025558003', livepid: '600190403', defn: 'fhd', name: '西藏卫视' },
  cetv1: { cnlid: '2022823801', livepid: '600171827', defn: 'fhd', name: '中国教育电视台1' },
  gxpd: { cnlid: '2029360403', livepid: '600213139', defn: 'fhd', name: '国学频道' },
  xjws: { cnlid: '2019927403', livepid: '600152138', defn: 'fhd', name: '新疆卫视' },
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function utf8Bytes(input) {
  return textEncoder.encode(String(input));
}

function bytesToString(bytes) {
  return textDecoder.decode(bytes);
}

function bytesToBinaryString(bytes) {
  let out = '';
  for (const b of bytes) out += String.fromCharCode(b);
  return out;
}

function binaryStringToBytes(str) {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i) & 0xff;
  return bytes;
}

function concatBytes(parts) {
  const size = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(size);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function u16be(n) {
  return Uint8Array.from([(n >>> 8) & 0xff, n & 0xff]);
}

function u32be(n) {
  return Uint8Array.from([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
}

function readU32be(bytes, offset) {
  return ((bytes[offset] << 24) >>> 0) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
}

function hexToBytes(hex) {
  const clean = String(hex).trim();
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function checksum31(bytes) {
  let sig = 0;
  for (const b of bytes) sig = (((sig * 0x83) + b) & 0x7fffffff) >>> 0;
  return sig >>> 0;
}

function xorCycle(bytes, keyBytes) {
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ keyBytes[i % keyBytes.length];
  return out;
}

function customBase64Encode(bytes) {
  const b64 = btoa(bytesToBinaryString(bytes));
  const map = new Map();
  for (let i = 0; i < STANDARD_B64.length; i++) map.set(STANDARD_B64[i], CUSTOM_B64[i]);
  let out = '';
  for (const ch of b64) out += map.get(ch) || ch;
  return out.replace(/=+$/g, '');
}

function customBase64Decode(input) {
  let text = String(input || '').replace(/\s+/g, '');
  if (!text) return new Uint8Array(0);
  const pad = text.length % 4;
  if (pad) text += '='.repeat(4 - pad);
  const map = new Map();
  for (let i = 0; i < STANDARD_B64.length; i++) map.set(CUSTOM_B64[i], STANDARD_B64[i]);
  let out = '';
  for (const ch of text) out += map.get(ch) || ch;
  return binaryStringToBytes(atob(out));
}

function teaEncryptBlock(block8, key16) {
  let y = readU32be(block8, 0) >>> 0;
  let z = readU32be(block8, 4) >>> 0;
  const k0 = readU32be(key16, 0) >>> 0;
  const k1 = readU32be(key16, 4) >>> 0;
  const k2 = readU32be(key16, 8) >>> 0;
  const k3 = readU32be(key16, 12) >>> 0;
  let sum = 0;
  for (let i = 0; i < 16; i++) {
    sum = (sum + 0x9e3779b9) >>> 0;
    y = (y + ((((z << 4) >>> 0) + k0) ^ ((z + sum) >>> 0) ^ (((z >>> 5) + k1) >>> 0))) >>> 0;
    z = (z + ((((y << 4) >>> 0) + k2) ^ ((y + sum) >>> 0) ^ (((y >>> 5) + k3) >>> 0))) >>> 0;
  }
  return concatBytes([u32be(y), u32be(z)]);
}

function teaDecryptBlock(block8, key16) {
  let y = readU32be(block8, 0) >>> 0;
  let z = readU32be(block8, 4) >>> 0;
  const k0 = readU32be(key16, 0) >>> 0;
  const k1 = readU32be(key16, 4) >>> 0;
  const k2 = readU32be(key16, 8) >>> 0;
  const k3 = readU32be(key16, 12) >>> 0;
  let sum = 0xe3779b90;
  for (let i = 0; i < 16; i++) {
    z = (z - ((((y << 4) >>> 0) + k2) ^ ((y + sum) >>> 0) ^ (((y >>> 5) + k3) >>> 0))) >>> 0;
    y = (y - ((((z << 4) >>> 0) + k0) ^ ((z + sum) >>> 0) ^ (((z >>> 5) + k1) >>> 0))) >>> 0;
    sum = (sum - 0x9e3779b9) >>> 0;
  }
  return concatBytes([u32be(y), u32be(z)]);
}

function randomByte() {
  return crypto.getRandomValues(new Uint8Array(1))[0];
}

function oiSymmetryEncrypt2(plainBytes, key16) {
  const nPadSaltBodyZeroLen = plainBytes.length + 1 + SALT_LEN + ZERO_LEN;
  let nPadLen = nPadSaltBodyZeroLen % 8;
  if (nPadLen) nPadLen = 8 - nPadLen;

  const out = [];
  const src = new Uint8Array(8);
  src[0] = (randomByte() & 0xf8) | nPadLen;
  let srcI = 1;

  while (nPadLen > 0) {
    src[srcI++] = randomByte();
    nPadLen--;
  }

  let ivPlain = new Uint8Array(8);
  let ivCrypt = new Uint8Array(8);

  const emitBlock = () => {
    for (let j = 0; j < 8; j++) src[j] ^= ivCrypt[j];
    const enc = teaEncryptBlock(src, key16);
    const outBlock = new Uint8Array(8);
    for (let j = 0; j < 8; j++) outBlock[j] = enc[j] ^ ivPlain[j];
    ivPlain = src.slice();
    ivCrypt = outBlock.slice();
    out.push(outBlock);
    srcI = 0;
  };

  let saltI = 0;
  while (saltI < SALT_LEN) {
    if (srcI < 8) {
      src[srcI++] = randomByte();
      saltI++;
    }
    if (srcI === 8) emitBlock();
  }

  let inputPos = 0;
  let remain = plainBytes.length;
  while (remain > 0) {
    if (srcI < 8) {
      src[srcI++] = plainBytes[inputPos++];
      remain--;
    }
    if (srcI === 8) emitBlock();
  }

  let zeroI = 0;
  while (zeroI < ZERO_LEN) {
    if (srcI < 8) {
      src[srcI++] = 0;
      zeroI++;
    }
    if (srcI === 8) emitBlock();
  }

  if (srcI > 0) {
    for (let j = srcI; j < 8; j++) src[j] = 0;
    emitBlock();
  }

  return concatBytes(out);
}

function oiSymmetryDecrypt2(cipherBytes, key16) {
  if (cipherBytes.length % 8 !== 0 || cipherBytes.length < 16) return null;

  let destBuf = teaDecryptBlock(cipherBytes.slice(0, 8), key16);
  const nPadLen = destBuf[0] & 0x07;

  let outLen = cipherBytes.length - 1 - nPadLen - SALT_LEN - ZERO_LEN;
  if (outLen < 0) return null;

  let ivPre = new Uint8Array(8);
  let ivCur = cipherBytes.slice(0, 8);
  let inputOff = 8;
  let destI = 1 + nPadLen;

  let saltCount = 1;
  while (saltCount <= SALT_LEN) {
    if (destI < 8) {
      destI++;
      saltCount++;
    } else if (destI === 8) {
      ivPre = ivCur;
      ivCur = cipherBytes.slice(inputOff, inputOff + 8);
      for (let j = 0; j < 8; j++) destBuf[j] ^= ivCur[j];
      destBuf = teaDecryptBlock(destBuf, key16);
      inputOff += 8;
      destI = 0;
    }
  }

  const plain = new Uint8Array(outLen);
  let plainOff = 0;
  while (outLen > 0) {
    if (destI < 8) {
      plain[plainOff++] = destBuf[destI] ^ ivPre[destI];
      destI++;
      outLen--;
    } else if (destI === 8) {
      ivPre = ivCur;
      ivCur = cipherBytes.slice(inputOff, inputOff + 8);
      for (let j = 0; j < 8; j++) destBuf[j] ^= ivCur[j];
      destBuf = teaDecryptBlock(destBuf, key16);
      inputOff += 8;
      destI = 0;
    }
  }

  return plain;
}

function guardLastFive(value) {
  const s = String(value);
  return s.length >= 5 ? s.slice(-5) : '';
}

export function generateCkGuardTime(timestamp, guid, guardData = '-1', packageName = 'null', processName = 'null') {
  const bodyParts = [u32be(timestamp >>> 0)];
  for (const part of [guardLastFive(guid), guardLastFive(packageName), guardLastFive(processName), String(guardData)]) {
    const bytes = utf8Bytes(part);
    bodyParts.push(u16be(bytes.length), bytes);
  }
  const body = concatBytes(bodyParts);
  const plain = concatBytes([u16be(body.length), body]);
  const sign = checksum31(plain);
  const encrypted = oiSymmetryEncrypt2(plain, hexToBytes(GUARD_TEA_KEY_HEX));
  const merged = concatBytes([encrypted, u32be(sign)]);
  return bytesToHex(xorCycle(merged, GUARD_XOR_KEY));
}

function generateGuidHex() {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(16))).toLowerCase();
}

function generateUuid4() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function generateRandFlag() {
  return btoa(bytesToBinaryString(crypto.getRandomValues(new Uint8Array(18))));
}

function generateFlowId(platform = 4330403) {
  return `${generateUuid4().toUpperCase()}_${platform}`;
}

function writeLenString(parts, value) {
  const bytes = utf8Bytes(value);
  parts.push(u16be(bytes.length), bytes);
}

export function buildPacket(params) {
  const parts = [
    hexToBytes('0000004200000004000004d2'),
    u32be(params.platform),
    u32be(0),
    u32be(params.timestamp),
  ];

  writeLenString(parts, params.sdtfrom);
  writeLenString(parts, params.randFlag);
  writeLenString(parts, params.appVer);
  writeLenString(parts, params.vid);
  writeLenString(parts, params.guid);
  parts.push(u32be(1), u32be(1));

  writeLenString(parts, '2622783A');
  writeLenString(parts, 'nil');
  writeLenString(parts, params.uuid4);
  writeLenString(parts, 'nil');
  writeLenString(parts, 'v0.1.000');
  writeLenString(parts, 'com.cctv.yangshipin.app.iphone');
  writeLenString(parts, '4330403');
  writeLenString(parts, 'ex_json_bus');
  writeLenString(parts, 'ex_json_vs');
  writeLenString(parts, params.ck_guard_time);

  const body = concatBytes(parts);
  const packet = concatBytes([u16be(body.length), body]);
  const sign = checksum31(packet);
  packet.set(u32be(sign), 18);
  return packet;
}

export function encryptDataToCKey(dataBytes) {
  const checksum = checksum31(dataBytes);
  const encrypted = oiSymmetryEncrypt2(dataBytes, hexToBytes(TEA_CKEY_HEX));
  const merged = concatBytes([encrypted, u32be(checksum)]);
  return `--01${customBase64Encode(xorCycle(merged, XOR_KEY))}`;
}

export function decryptCKeyToData(ckey) {
  const text = String(ckey || '');
  if (!text.startsWith('--01')) return null;
  const decoded = customBase64Decode(text.slice(4));
  const xorDecoded = xorCycle(decoded, XOR_KEY);
  if (xorDecoded.length < 12) return null;
  const payload = xorDecoded.slice(0, -4);
  const checksum = readU32be(xorDecoded, xorDecoded.length - 4);
  const plain = oiSymmetryDecrypt2(payload, hexToBytes(TEA_CKEY_HEX));
  if (!plain) return null;
  return { data: plain, checksum };
}

function spvcode(defn) {
  const height = /(4k|8k|hdr)/i.test(defn) ? 2160 : 1080;
  const fps = [30, 60, 90, 120];
  const h264 = fps.map((v) => `${v}:${height}`).join(',');
  const h265 = fps.map((v) => `${v}:${height}`).join(',');
  return btoa(`H(${h264}|${h264});2(${h265}|${h265})`);
}

function parseShanghaiDateTime(text) {
  const m = String(text).match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const h = Number(m[4]);
  const mi = Number(m[5]);
  const s = Number(m[6]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  const utcMs = Date.UTC(y, mo - 1, d, h - 8, mi, s);
  const sh = new Date(utcMs + 8 * 3600 * 1000);
  if (
    sh.getUTCFullYear() !== y
    || sh.getUTCMonth() + 1 !== mo
    || sh.getUTCDate() !== d
    || sh.getUTCHours() !== h
    || sh.getUTCMinutes() !== mi
    || sh.getUTCSeconds() !== s
  ) return null;
  return Math.floor(utcMs / 1000);
}

export function parsePlayseek(playseek, maxDurationSec = 7 * 24 * 3600) {
  const text = String(playseek || '');
  const m = text.match(/^(\d{14})-(\d{14})$/);
  if (!m) throw new Error('playseek 格式必须为 YYYYMMDDHHMMSS-YYYYMMDDHHMMSS');
  const start = parseShanghaiDateTime(m[1]);
  const end = parseShanghaiDateTime(m[2]);
  if (!start || !end) throw new Error('playseek 时间无效（Asia/Shanghai）');
  if (end <= start) throw new Error('playseek 结束时间必须晚于开始时间');
  const duration = end - start;
  if (duration > maxDurationSec) throw new Error('playseek 时间跨度过长');
  return { start, end, duration, startText: m[1], endText: m[2] };
}

function isPrivateIp(host) {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const [a, b] = host.split('.').map((n) => Number(n));
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
  }
  if (host === 'localhost' || host.endsWith('.local')) return true;
  if (host.includes(':')) {
    const low = host.toLowerCase();
    if (low === '::1' || low.startsWith('fc') || low.startsWith('fd') || low.startsWith('fe80')) return true;
  }
  return false;
}

function isMediaHostAllowed(hostname) {
  if (hostname === 'bkliveinfo.ysp.cctv.cn') return true;
  return MEDIA_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
}

function assertAllowedUrl(url) {
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('仅允许 HTTP/HTTPS URL');
  const host = url.hostname.toLowerCase();
  if (isPrivateIp(host)) throw new Error('禁止访问内网地址');
  if (!isMediaHostAllowed(host)) throw new Error('目标域名不在白名单中');
}

async function fetchWithPolicy(urlText, options = {}) {
  let url = new URL(urlText);
  assertAllowedUrl(url);
  const timeoutMs = options.timeoutMs || YSP_TIMEOUT_MS;

  for (let step = 0; step <= YSP_MAX_REDIRECTS; step++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let resp;
    try {
      resp = await fetch(url.toString(), {
        method: options.method || 'GET',
        headers: options.headers,
        body: options.body,
        signal: controller.signal,
        redirect: 'manual',
      });
    } finally {
      clearTimeout(timer);
    }

    if (resp.status >= 300 && resp.status < 400 && resp.headers.get('Location')) {
      if (step >= YSP_MAX_REDIRECTS) throw new Error('重定向次数过多');
      const next = new URL(resp.headers.get('Location'), url);
      assertAllowedUrl(next);
      url = next;
      continue;
    }

    return { response: resp, finalUrl: url.toString() };
  }

  throw new Error('重定向处理失败');
}

async function readTextLimited(resp, maxBytes = YSP_MAX_M3U8_SIZE) {
  const reader = resp.body?.getReader();
  if (!reader) return await resp.text();
  let total = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) throw new Error('响应体过大');
    chunks.push(value);
  }
  return bytesToString(concatBytes(chunks));
}

function rewriteTagUris(line, baseUrl) {
  return line.replace(/URI="([^"]+)"/gi, (_m, uri) => `URI="${new URL(uri, baseUrl).toString()}"`);
}

export function rewriteM3u8Content(content, baseUrl) {
  const lines = String(content).split(/\r\n|\n|\r/);
  const out = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      out.push('');
      continue;
    }
    if (line.startsWith('#')) {
      out.push(rewriteTagUris(line, baseUrl));
    } else {
      out.push(new URL(line, baseUrl).toString());
    }
  }
  return out.join('\n');
}

async function flattenM3u8(url, depth = 0) {
  if (depth > YSP_MAX_M3U8_DEPTH) throw new Error('M3U8 递归层级过深');
  const { response, finalUrl } = await fetchWithPolicy(url, {
    headers: {
      'Accept': '*/*',
      'User-Agent': 'qqlive',
      'Referer': 'https://www.yangshipin.cn/',
      'Origin': 'https://www.yangshipin.cn',
    },
  });
  if (response.status !== 200) throw new Error(`拉取 M3U8 失败: ${response.status}`);
  const content = await readTextLimited(response);
  const lines = content.split(/\r\n|\n|\r/);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('#EXT-X-STREAM-INF')) {
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      if (j < lines.length && !lines[j].trim().startsWith('#')) {
        return flattenM3u8(new URL(lines[j].trim(), finalUrl).toString(), depth + 1);
      }
    }
  }
  return rewriteM3u8Content(content, finalUrl);
}

function urlExpiry(urlText) {
  try {
    const u = new URL(urlText);
    const q = u.searchParams;
    const values = [];
    for (const key of ['volcTime', 'txTime', 'wsTime', 'expire', 'expires']) {
      const raw = q.get(key);
      if (!raw) continue;
      if (/^[0-9a-fA-F]+$/.test(raw) && !/^\d+$/.test(raw)) values.push(parseInt(raw, 16));
      else values.push(parseInt(raw, 10));
    }
    const token = q.get('token');
    if (token) {
      const pieces = token.split('.');
      if (pieces.length >= 2) {
        try {
          const payload = JSON.parse(atob(pieces[1].replace(/-/g, '+').replace(/_/g, '/')));
          if (payload?.exp) values.push(parseInt(payload.exp, 10));
        } catch {}
      }
    }
    const nowValid = values.filter((v) => Number.isFinite(v) && v > 1600000000);
    return nowValid.length ? Math.min(...nowValid) : 0;
  } catch {
    return 0;
  }
}

async function readLiveCache(channelId) {
  const cache = caches.default;
  const key = new Request(`https://ysp-cache.internal/live-${channelId}`);
  const resp = await cache.match(key);
  if (!resp) return null;
  try {
    const data = await resp.json();
    if (!data?.url || typeof data.url !== 'string') return null;
    const now = Math.floor(Date.now() / 1000);
    if (now - Number(data.created || 0) > YSP_LIVE_CACHE_TTL) return null;
    if (data.exp && Number(data.exp) - now < YSP_LIVE_MIN_LEFT) return null;
    return data.url;
  } catch {
    return null;
  }
}

async function writeLiveCache(channelId, url) {
  const exp = urlExpiry(url) || (Math.floor(Date.now() / 1000) + YSP_LIVE_CACHE_TTL);
  const cache = caches.default;
  const key = new Request(`https://ysp-cache.internal/live-${channelId}`);
  const payload = JSON.stringify({ url, exp, created: Math.floor(Date.now() / 1000) });
  await cache.put(key, new Response(payload, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `max-age=${YSP_LIVE_CACHE_TTL}`,
    },
  }));
}

function processPlaybackUrl(playurl, startTimestamp) {
  const u = new URL(playurl);
  u.hostname = 'tlivecloud-playback-cdn.ysp.cctv.cn';
  if (!u.pathname.startsWith('/tcloud.cctv.com/')) u.pathname = `/tcloud.cctv.com${u.pathname}`;
  u.searchParams.set('starttime', String(startTimestamp));
  return u.toString();
}

function buildCKey(cnlid, timestamp, guid) {
  const ckGuard = generateCkGuardTime(timestamp, guid);
  const packet = buildPacket({
    platform: 4330403,
    timestamp,
    sdtfrom: 'dcgh',
    vid: cnlid,
    guid,
    appVer: 'V8.22.1035.3031',
    randFlag: generateRandFlag(),
    uuid4: generateUuid4(),
    ck_guard_time: ckGuard,
  });
  return { ckey: encryptDataToCKey(packet), ck_guard_time: ckGuard };
}

async function sendYspRequest(params) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) qs.set(k, String(v));
  const { response } = await fetchWithPolicy(`${YSP_API_BASE}?${qs.toString()}`, {
    headers: {
      'User-Agent': 'qqlive',
      'Connection': 'Keep-Alive',
      'Accept': 'application/json',
    },
  });
  if (response.status !== 200) {
    return { success: false, error: `上游 HTTP ${response.status}`, status: response.status };
  }
  let json;
  try {
    json = await response.json();
  } catch {
    return { success: false, error: '上游返回非 JSON' };
  }
  if (!json || typeof json !== 'object') return { success: false, error: '上游 JSON 无效' };
  if (Number(json.iretcode) !== 0) {
    return { success: false, error: String(json.errinfo || '上游返回错误'), iretcode: json.iretcode, payload: json };
  }
  if (!json.playurl || typeof json.playurl !== 'string') return { success: false, error: '上游未返回 playurl', payload: json };
  return { success: true, playurl: json.playurl, payload: json };
}

async function requestPlayUrl(channel, playback) {
  const guid = generateGuidHex();
  const timestamp = Math.floor(Date.now() / 1000);
  const { ckey } = buildCKey(channel.cnlid, timestamp, guid);
  const base = {
    atime: '120',
    livepid: channel.livepid,
    cnlid: channel.cnlid,
    appVer: 'V8.22.1035.3031',
    app_version: '300090',
    caplv: '1',
    cmd: '2',
    defn: channel.defn,
    device: 'iPhone',
    encryptVer: '4.2',
    getpreviewinfo: '0',
    hevclv: '33',
    lang: 'zh-Hans_JP',
    livequeue: '0',
    logintype: '1',
    nettype: '1',
    newnettype: '1',
    newplatform: '4330403',
    platform: '4330403',
    sdtfrom: 'v3021',
    spacode: '23',
    spaudio: '1',
    spdemuxer: '6',
    spdrm: '2',
    spdynamicrange: '7',
    spflv: '1',
    spflvaudio: '1',
    sphdrfps: '60',
    sphttps: '1',
    spvcode: spvcode(channel.defn),
    spvideo: '4',
    stream: '1',
    system: '1',
    sysver: 'ios18.2.1',
    uhd_flag: '4',
    cKey: ckey,
    guid,
    fntick: timestamp,
    flowid: generateFlowId(),
  };

  if (!playback) {
    return sendYspRequest({ ...base, playbacktime: '0' });
  }

  const first = await sendYspRequest({ ...base, playbacktime: playback.start });
  if (first.success) return first;

  const fallback = await sendYspRequest(base);
  if (!fallback.success) {
    return {
      success: false,
      error: '回看地址获取失败',
      firstError: first.error,
      secondError: fallback.error,
    };
  }

  return {
    success: true,
    playurl: processPlaybackUrl(fallback.playurl, playback.start),
    payload: fallback.payload,
    fallback: true,
  };
}

export async function handleYspRequest(request, url) {
  const id = url.searchParams.get('id') || '';
  const info = url.searchParams.has('info');
  const forceRefresh = url.searchParams.get('refresh') && url.searchParams.get('refresh') !== '0';
  const playseekRaw = url.searchParams.get('playseek');

  if (!id) {
    const channels = Object.entries(yspChannels).map(([key, item]) => ({ id: key, ...item }));
    return Response.json({ source: 'ysp', channels }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const channel = yspChannels[id];
  if (!channel) return new Response('无效央视频道ID', { status: 400 });

  let playback = null;
  if (playseekRaw) {
    try {
      playback = parsePlayseek(playseekRaw);
    } catch (err) {
      return new Response(`playseek 参数错误: ${err.message}`, { status: 400 });
    }
  }

  if (!playback && !forceRefresh) {
    const cached = await readLiveCache(id);
    if (cached) {
      if (info) {
        return Response.json({ source: 'ysp', mode: 'live', id, cache: 'HIT', live_url: cached }, {
          headers: { 'Cache-Control': 'no-store' },
        });
      }
      try {
        const text = await flattenM3u8(cached);
        return new Response(text, {
          headers: {
            'Content-Type': 'application/vnd.apple.mpegurl',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'X-Live-Url-Cache': 'HIT',
            'X-Live-Source': 'ysp',
          },
        });
      } catch {
        // ignore and refresh
      }
    }
  }

  let result;
  try {
    result = await requestPlayUrl(channel, playback);
  } catch (err) {
    return new Response(`央视源请求失败: ${err.message}`, { status: 502 });
  }

  if (!result.success || !result.playurl) {
    return new Response(`央视源请求失败: ${result.error || '未知错误'}`, { status: 502 });
  }

  if (playback) {
    return new Response(null, {
      status: 302,
      headers: {
        'Location': result.playurl,
        'Cache-Control': 'no-store',
      },
    });
  }

  await writeLiveCache(id, result.playurl);

  if (info) {
    return Response.json({
      source: 'ysp',
      mode: 'live',
      id,
      cache: 'MISS',
      live_url: result.playurl,
      expires_in: Math.max(0, urlExpiry(result.playurl) - Math.floor(Date.now() / 1000)),
    }, { headers: { 'Cache-Control': 'no-store' } });
  }

  let playlist;
  try {
    playlist = await flattenM3u8(result.playurl);
  } catch (err) {
    return new Response(`央视源 M3U8 处理失败: ${err.message}`, { status: 502 });
  }

  return new Response(playlist, {
    headers: {
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'X-Live-Url-Cache': 'MISS',
      'X-Live-Source': 'ysp',
    },
  });
}

export const __test__ = {
  hexToBytes,
  bytesToHex,
  checksum31,
  teaEncryptBlock,
  teaDecryptBlock,
  customBase64Encode,
  customBase64Decode,
  xorCycle,
};
