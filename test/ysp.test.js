import test from 'node:test';
import assert from 'node:assert/strict';
import {
  __test__,
  buildPacket,
  decryptCKeyToData,
  encryptDataToCKey,
  generateCkGuardTime,
  parsePlayseek,
  rewriteM3u8Content,
  yspChannels,
} from '../src/ysp.js';

test('TEA block encrypt/decrypt symmetry', () => {
  const key = __test__.hexToBytes('00112233445566778899aabbccddeeff');
  const block = __test__.hexToBytes('0102030405060708');
  const encrypted = __test__.teaEncryptBlock(block, key);
  const plain = __test__.teaDecryptBlock(encrypted, key);
  assert.equal(__test__.bytesToHex(plain), __test__.bytesToHex(block));
});

test('custom base64 and xor roundtrip', () => {
  const payload = __test__.hexToBytes('112233445566778899aabbccddeeff00');
  const xored = __test__.xorCycle(payload, __test__.hexToBytes('0102030405060708090a0b0c0d0e0f10'));
  const encoded = __test__.customBase64Encode(xored);
  const decoded = __test__.customBase64Decode(encoded);
  assert.equal(__test__.bytesToHex(decoded), __test__.bytesToHex(xored));
});

test('packet signature backfill and cKey decrypt', () => {
  const packet = buildPacket({
    platform: 4330403,
    timestamp: 1735689600,
    sdtfrom: 'dcgh',
    randFlag: 'abcdefghijklmnopqrstuv==',
    appVer: 'V8.22.1035.3031',
    vid: '2024078201',
    guid: '0123456789abcdef0123456789abcdef',
    uuid4: '12345678-1234-4234-8234-1234567890ab',
    ck_guard_time: generateCkGuardTime(1735689600, '0123456789abcdef0123456789abcdef'),
  });

  const packetLen = (packet[0] << 8) | packet[1];
  assert.equal(packetLen + 2, packet.length);

  const sign = ((packet[18] << 24) >>> 0) | (packet[19] << 16) | (packet[20] << 8) | packet[21];
  const zeroed = packet.slice();
  zeroed[18] = 0;
  zeroed[19] = 0;
  zeroed[20] = 0;
  zeroed[21] = 0;
  assert.equal(sign, __test__.checksum31(zeroed));

  const ckey = encryptDataToCKey(packet);
  assert.ok(ckey.startsWith('--01'));
  const decoded = decryptCKeyToData(ckey);
  assert.ok(decoded);
  assert.equal(decoded.checksum, __test__.checksum31(decoded.data));
  assert.equal(__test__.bytesToHex(decoded.data), __test__.bytesToHex(packet));
});

test('parsePlayseek validates format and range', () => {
  const parsed = parsePlayseek('20261015010000-20261015013000');
  assert.equal(parsed.duration, 1800);

  assert.throws(() => parsePlayseek('20261015010000_20261015013000'));
  assert.throws(() => parsePlayseek('20260230010000-20260230013000'));
  assert.throws(() => parsePlayseek('20261015020000-20261015010000'));
});

test('channel whitelist contains CCTV and rejects unknown via lookup', () => {
  assert.ok(yspChannels.cctv1);
  assert.ok(yspChannels.cctv8k);
  assert.equal(yspChannels.unknown, undefined);
});

test('rewriteM3u8Content resolves relative URIs and tag URI fields', () => {
  const content = `#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.key"\n#EXT-X-MAP:URI="init.m4s"\n#EXTINF:3,\nseg-1.ts\n#EXT-X-MEDIA:TYPE=SUBTITLES,URI="sub/zh.vtt"`;
  const out = rewriteM3u8Content(content, 'https://example.com/live/main.m3u8');
  assert.match(out, /https:\/\/example\.com\/live\/key\.key/);
  assert.match(out, /https:\/\/example\.com\/live\/init\.m4s/);
  assert.match(out, /https:\/\/example\.com\/live\/seg-1\.ts/);
  assert.match(out, /https:\/\/example\.com\/live\/sub\/zh\.vtt/);
});
