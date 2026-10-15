# kankan-live
有幸经过几手传播，得到了【 https://t.me/iptvorganization 】提供的【wxty.php】文件。
然后由于手头没有付费版的APTV app，也没有部署了PHP环境的服务器。所以想要迁移到免费的CloudFlare的Workers。
遂有此。






## TL;DR

这个 `src/wxty.php` 本质上是一个：

> **“看东方某个频道 → 获取真实播放地址 → 解密 → 拉取 HLS 播放列表 → 转换成扁平化 M3U8 → 输出给播放器”的 PHP 中转代理。**

它主要完成六件事：

1. 根据 `id=wxty` 将频道映射为内部频道 ID `10`。
2. 调用 Kankan API，并使用 `时间戳 + nonce + 固定密钥` 计算 MD5 签名。
3. 从 API 获取经过 RSA 处理的播放地址。
4. 使用公钥“解密”出真实的 `.m3u8` 地址。
5. 递归拉取主播放列表和子播放列表，转换为单层媒体播放列表。
6. 对播放地址和 TS 分片进行缓存；失败时跳转到备用直播源。

其中最值得学习的是：

- **API 签名不等于加密**
- **RSA 公钥解密通常更像签名验证或厂商自定义混淆**
- **播放地址有时效性，所以需要过期检测和刷新机制**
- **直播系统通常是多层 M3U8**
- **缓存策略必须配合 URL 过期时间**
- **代理用户提供的 URL 时，必须警惕 SSRF 和任意请求风险**

---

# 一、这个文件的整体目的

从使用方式看，访问类似：

```text
/wxty.php?id=wxty
```

服务器不会直接返回固定的 M3U8，而是动态完成以下事情：

```text
客户端请求
    ↓
识别频道
    ↓
调用 Kankan API
    ↓
生成 API 签名
    ↓
取得加密播放地址
    ↓
RSA 处理得到真实 URL
    ↓
获取 M3U8
    ↓
递归解析主播放列表
    ↓
输出单层媒体 M3U8
```

所以它不是一个普通的 PHP 页面，而是一个**直播地址适配器和代理层**。

它把上游复杂的访问流程封装起来，让下游播放器只需要访问这个 PHP 地址。

---

# 二、先看整个文件的模块划分

这个文件可以分成八个模块。

## 1. 基础配置与失败处理

包括：

- 时区设置
- 本地 HTTPS 代理前缀
- 缓存 TTL
- 直播地址剩余有效时间
- 备用直播源
- 失败原因记录
- 失败时 302 跳转

相关配置：

```php
const LIVE_URL_CACHE_TTL = 600;
const LIVE_URL_MIN_LEFT  = 90;
const DONOR_SCAN_DAYS    = 7;
const FALLBACK_LIVE_URL  = '...';
```

含义是：

| 配置 | 作用 |
|---|---|
| `LIVE_URL_CACHE_TTL` | 本地播放地址缓存 600 秒 |
| `LIVE_URL_MIN_LEFT` | 地址至少还要剩 90 秒才继续使用 |
| `DONOR_SCAN_DAYS` | 最多向前扫描 7 天的节目 |
| `FALLBACK_LIVE_URL` | 获取失败时使用的备用源 |

这里体现了一个很重要的直播系统思路：

> **直播 URL 不是永久资源，缓存不能只看文件时间，还要看 URL 自己的过期时间。**

---

## 2. 频道 ID 映射

文件最后有：

```php
$channelMap = [
    'dfws'   => 1,
    'shxwzh' => 2,
    'shds'   => 4,
    'dycj'   => 5,
    'hhxd'   => 9,
    'wxty'   => 10,
    'mdy'    => 11,
    'jsrw'   => 12,
];
```

外部使用短名称，内部使用数字 ID。

例如：

```text
?id=wxty
```

最终转换为：

```text
channel_id = 10
```

这是一种很常见的设计：

- 外部参数可读
- 内部接口使用数字
- 避免用户直接控制任意频道 ID
- 方便维护频道别名

之后通过：

```php
$id = $_GET['id'] ?? 'wxty';
```

读取频道名称。

如果没有传入 `id`，默认频道就是 `wxty`。

如果频道不在白名单中：

```php
if (!isset($channelMap[$id])) {
    http_response_code(400);
    die('无效频道ID');
}
```

直接返回 400。

这是正确的白名单思路，比直接把用户输入传给上游 API 更安全。

---

# 三、API 签名部分：它到底做了什么？

这是整个文件最值得理解的部分。

核心函数是：

```php
function kankanApiGet($path, $params = [])
```

它负责调用 Kankan API。

---

## 3.1 API 请求参数

函数首先生成几个动态字段：

```php
$t = time();
$nonce = getnonce(8);
$uuid = stableUuid();
```

分别是：

| 字段 | 作用 |
|---|---|
| `timestamp` | 当前时间 |
| `nonce` | 一次性随机字符串 |
| `M-Uuid` | 稳定的客户端标识 |
| `version` | 客户端版本 |
| `platform` | 客户端平台 |

这些字段用于让服务端判断：

- 请求是不是太旧
- 请求是不是重复发送
- 请求是不是来自合法客户端
- 请求是不是符合指定客户端版本

---

## 3.2 nonce 是什么？

```php
function getnonce($len = 8) {
    $alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
    $nonce = '';
    for ($i = 0; $i < $len; $i++) {
        $nonce .= $alphabet[random_int(0, strlen($alphabet) - 1)];
    }
    return $nonce;
}
```

`nonce` 是一个随机数或随机字符串。

这里生成 8 位小写字母和数字，例如：

```text
a8k2z91x
```

它的作用主要是防止请求被简单重放。

假设请求参数完全相同，如果没有 nonce，攻击者可能直接复制原请求再次发送。

加入 nonce 后，每次请求的签名都不同。

但是要注意：

> nonce 本身不提供安全性，它必须参与签名，服务端还应该记录短期内已经使用过的 nonce。

否则攻击者仍然可以把完整请求原样重放。

---

## 3.3 stableUuid 是什么？

```php
function stableUuid() {
    static $uuid = null;
    if ($uuid !== null) return $uuid;

    $file = getCacheDir() . '/uuid';
    $cur = is_file($file) ? trim((string) file_get_contents($file)) : '';

    if ($cur === '' || !preg_match('/^[A-Za-z0-9_-]{16,32}$/', $cur)) {
        $cur = getuuid();
        @file_put_contents($file, $cur, LOCK_EX);
        @chmod($file, 0600);
    }

    return $uuid = $cur;
}
```

它会生成一个随机客户端标识，并保存到临时目录。

和每次请求都变化的 nonce 不同，UUID 在多个请求之间保持稳定。

可以理解为：

```text
nonce = 本次请求编号
uuid  = 这个客户端实例的身份证
```

这通常用于模拟官方客户端。

---

# 四、签名算法：为什么不是直接 MD5？

代码中：

```php
$all = $params;
$all['Api-Version'] = 'v1';
$all['nonce'] = $nonce;
$all['platform'] = 'pc';
$all['timestamp'] = $t;
$all['version'] = KANKAN_API_VERSION;
ksort($all);
```

它先把请求参数和公共参数合并，然后排序。

例如原始参数：

```php
[
    'channel_id' => 10,
    'date' => '2026-10-15'
]
```

加入公共参数后类似：

```php
[
    'Api-Version' => 'v1',
    'channel_id' => 10,
    'date' => '2026-10-15',
    'nonce' => 'abc123xy',
    'platform' => 'pc',
    'timestamp' => 179...,
    'version' => '2.42.23'
]
```

然后：

```php
ksort($all);
```

按照键名排序。

这是签名协议中非常重要的一步。

如果客户端和服务端排序不一致，就会得到不同的签名。

---

## 4.1 拼接签名字符串

```php
$signStr = '';

foreach ($all as $k => $v) {
    if ($v === null) continue;

    if (is_array($v)) {
        $v = json_encode($v, JSON_UNESCAPED_SLASHES);
        $v = str_replace('/', '\\/', $v);
    }

    $signStr .= $k . '=' . $v . '&';
}
```

最终会拼成类似：

```text
Api-Version=v1&channel_id=10&date=2026-10-15&nonce=abc123xy&platform=pc&timestamp=179...&version=2.42.23&
```

注意这里的细节：

1. 末尾保留 `&`
2. 参数不进行 URL 编码
3. 数组会先 JSON 化
4. JSON 中的 `/` 会被替换成 `\/`
5. 参数排序后再拼接

这些细节都属于**协议的一部分**。

在实现第三方签名时，最容易出错的不是 MD5 本身，而是：

- 参数排序
- 空值处理
- 数组序列化
- 是否 URL 编码
- 是否保留末尾分隔符
- 大小写
- 时间单位
- 字符编码

---

## 4.2 双重 MD5

```php
$sign = md5(md5($signStr . KANKAN_API_SECRET));
```

公式是：

```text
sign = MD5(MD5(参数字符串 + 密钥))
```

这不是加密，而是**完整性校验和认证标签**。

它想表达的是：

> 只有知道 `KANKAN_API_SECRET` 的客户端，才能计算正确的签名。

服务端接收到请求后，大概率会执行相同的流程：

```text
服务端重新拼接参数
    ↓
服务端追加相同密钥
    ↓
服务端计算双重 MD5
    ↓
和请求中的 Sign 比较
```

如果一致，则接受请求。

---

# 五、签名和加密有什么区别？

这是非常关键的基础概念。

## 签名

签名的目标是证明：

1. 请求内容没有被修改
2. 请求来自知道密钥的一方

示意：

```text
参数 + 密钥 → 签名
```

服务端能够验证签名，但一般不会从签名中恢复原始数据。

这个文件的：

```php
$sign = md5(md5($signStr . KANKAN_API_SECRET));
```

属于签名或认证校验。

---

## 加密

加密的目标是隐藏内容。

示意：

```text
明文 + 密钥 → 密文
密文 + 密钥 → 明文
```

这个文件对播放地址执行：

```php
$plain = rsaDecrypt($found['addr']);
```

这是另一件事。

可以简单记忆：

| 机制 | 目标 |
|---|---|
| 签名 | 防篡改、证明身份 |
| 加密 | 隐藏内容 |
| 编码 | 改变表示形式 |
| 混淆 | 增加分析难度 |

MD5 签名不会把播放地址“解密”出来。

---

# 六、HTTP 请求头中的授权信息

函数构造了这些请求头：

```php
$headers = [
    'Api-Version: v1',
    "Nonce: {$nonce}",
    "M-Uuid: {$uuid}",
    'Platform: pc',
    'Version: ' . KANKAN_API_VERSION,
    "Timestamp: {$t}",
    "Sign: {$sign}",
    'Accept: application/json, text/plain, */*',
    'Origin: https://live.kankanews.com',
    'Referer: https://live.kankanews.com/',
    'User-Agent: ' . KANKAN_UA,
];
```

可以分为三类。

## 1. 协议字段

```text
Api-Version
Platform
Version
Timestamp
Nonce
Sign
```

这些通常由接口协议直接要求。

## 2. 浏览器环境模拟

```text
Origin
Referer
User-Agent
```

这些用于模拟官方网页访问。

服务器可能会检查：

- 来源页面
- 浏览器类型
- 请求平台
- 是否带有正确的 Origin

## 3. 客户端 IP 传递

```php
$clientIp = $_SERVER['REMOTE_ADDR'] ?? '';

if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
    $clientIp = trim(explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'])[0]);
}
```

然后加入：

```php
X-Forwarded-For
Client-Ip
```

这表示它试图将访问者的 IP 转发给上游。

但这里有一个安全问题：

> `X-Forwarded-For` 是客户端可以伪造的，除非你的服务器位于可信反向代理之后，并且只信任代理添加的值。

如果直接相信用户传入的：

```text
X-Forwarded-For
```

攻击者可以伪造任意 IP。

---

# 七、RSA 部分：代码到底在做什么？

这是文件中最容易误解的部分。

核心流程是：

```php
$plain = rsaDecrypt($found['addr']);
```

但这里使用的是**公钥**。

通常 RSA 加密流程是：

```text
公钥加密 → 私钥解密
```

而这个文件使用：

```text
公钥运算 → 得到内容
```

因此它更像下面两种情况之一：

1. 上游实际上使用私钥做了 RSA PKCS#1 v1.5 运算；
2. 上游把 RSA 当作一种“签名式加密”或地址混淆机制。

严格来说，这未必是标准意义上的安全加密。

---

## 7.1 公钥内容

```php
function kankanPublicKeyPem() {
    return "-----BEGIN PUBLIC KEY-----\n"
        . "...公钥..."
        . "-----END PUBLIC KEY-----";
}
```

这是一个 RSA 公钥。

根据长度可以看出，它大概率是 1024 位 RSA：

```text
1024 bits = 128 bytes
```

这也对应后面每个分组固定处理 128 字节。

---

## 7.2 Base64 解码

```php
$encData = base64_decode($str, true);
```

API 返回的地址不是直接的二进制，而是 Base64 文本。

所以第一步是：

```text
Base64 文本 → 二进制密文
```

注意：

> Base64 不是加密，只是一种编码。

---

## 7.3 RSA 分块

```php
for ($i = 0; $i + 128 <= strlen($encData); $i += 128) {
    ...
}
```

因为 RSA 1024 位密钥对应 128 字节密文块，所以必须每 128 字节处理一次。

不能直接把任意长度字符串一次丢给 RSA。

---

## 7.4 手动大整数模幂运算

RSA 的核心数学形式是：

```text
m = c^e mod n
```

其中：

- `c`：密文
- `e`：公钥指数
- `n`：RSA 模数
- `m`：结果

代码优先尝试 GMP：

```php
gmp_powm(...)
```

否则使用 BC Math：

```php
bcpowmod(...)
```

原因是 PHP 普通整数无法安全承载 1024 位 RSA 大整数。

所以需要：

- GMP 扩展
- 或 BC Math 扩展
- 或 OpenSSL

这是一种很典型的兼容性设计：

```text
优先 GMP
没有 GMP 就使用 BC Math
最后尝试 OpenSSL
```

---

# 八、RSA ASN.1 解析

公钥是 PEM 格式，但真正的 RSA 数值藏在 DER 结构里。

代码：

```php
$der = base64_decode(
    preg_replace('/-----[^-]+-----|\s+/', '', kankanPublicKeyPem())
);
```

过程是：

```text
PEM
  ↓ 去掉 BEGIN/END 标记
Base64 解码
  ↓
DER 二进制
```

之后：

```php
$ints = rsaAsn1Integers($der);
```

从 ASN.1 DER 中提取 INTEGER。

RSA 公钥通常至少包含：

```text
n = modulus，模数
e = exponent，指数
```

代码假设前两个整数就是：

```php
list($nHex, $eHex) = $ints;
```

然后使用：

```text
n 和 e
```

执行 RSA 运算。

---

# 九、PKCS#1 v1.5 填充检查

在 `rsaPublicDecryptChunk()` 中：

```php
if ($block[0] !== "\x00" || $block[1] !== "\x01") return '';
```

它期望结果符合：

```text
00 01 FF FF FF ... 00 DATA
```

这正是 RSA PKCS#1 v1.5 签名块的典型结构。

接下来：

```php
while ($j < 128 && $block[$j] === "\xFF") $j++;
if ($j >= 128 || $block[$j] !== "\x00") return '';
return substr($block, $j + 1);
```

它跳过：

1. `00`
2. `01`
3. 一连串 `FF`
4. 分隔符 `00`

最后返回真正的数据。

这说明一个非常重要的事实：

> 这段代码的 RSA 处理更接近“使用公钥恢复私钥侧生成的 PKCS#1 v1.5 内容”，本质上类似验证签名块，而不是典型的公钥加密、私钥解密。

如果是标准 RSA 加密，通常应该看到：

```text
00 02 随机填充 00 明文
```

而这里检查的是：

```text
00 01 FF...00 数据
```

因此它很可能是：

- 厂商自定义的地址保护方案；
- RSA 签名式封装；
- 或把签名机制当成加密机制使用。

---

# 十、OpenSSL 作为备用实现

如果 GMP 和 BC Math 都不可用，就使用：

```php
openssl_public_decrypt(
    substr($encData, $i, 128),
    $out,
    $pkey,
    OPENSSL_PKCS1_PADDING
)
```

这相当于让 OpenSSL 执行公钥解码操作。

整个 RSA 解密函数的兼容路径是：

```text
GMP + BC Math
    ↓ 不可用
OpenSSL
    ↓ 也不可用
失败
```

如果最终无法得到明文：

```php
return false;
```

上层会记录：

```text
decrypt-failed
```

然后跳转备用地址。

---

# 十一、播放地址是如何获得的？

主函数是：

```php
function fetchPlayAddress($channelId)
```

它有多级查找策略。

---

## 第一优先级：频道实时地址

```php
$detail = kankanApiGet(
    '/content/pc/tv/channel/detail',
    ['channel_id' => $channelId]
);
```

读取：

```php
$chanLive = (string) ($detail['result']['live_address'] ?? '');
```

如果频道本身有实时地址，直接使用：

```php
return [
    'addr' => $chanLive,
    'kind' => 'live',
    'source' => 'channel'
];
```

这是最快、最可靠的路径。

---

## 第二优先级：当前节目地址

如果频道没有实时地址，就获取今天的节目列表：

```php
$list = fetchPrograms($channelId, $today);
```

然后查找当前正在播放的节目：

```php
if ($s <= $now && $now < $e)
```

也就是：

```text
节目开始时间 <= 当前时间 < 节目结束时间
```

找到当前节目后，调用：

```php
fetchProgramDetail($current['id'])
```

读取：

- `live_address`
- `shift_address`

其中：

- `live_address` 表示直播地址
- `shift_address` 表示回看或时移地址

---

## 第三优先级：历史节目供体地址

如果当前没有可用地址，就向前扫描最多 7 天：

```php
for ($off = 0; $off < DONOR_SCAN_DAYS; $off++)
```

然后只保留可回看的节目：

```php
$reviewable =
    ((int) ($p['can_review'] ?? 0) === 1)
    || ((int) ($p['is_review'] ?? 0) === 1);
```

它会优先选择节目名中包含“体育”的节目：

```php
$sa = strpos($a['name'], '体育') !== false ? 0 : 1;
```

这是一种业务层面的“供体节目”策略：

> 如果当前频道被屏蔽，就找以前能产生有效时移地址的节目，借用它的地址作为播放入口。

这不是标准的直播授权流程，而是针对上游业务接口行为设计的兼容方案。

---

# 十二、`is_shield`、供体地址和时移地址的思路

从错误信息看：

```php
address-failed: 未取到可用播放地址(is_shield 屏蔽且无供体)
```

上游可能存在某种频道屏蔽机制。

例如：

- 当前频道没有直接直播地址
- 当前节目不能回看
- 当前节目被 `is_shield` 标记
- 但历史节目可能仍然有可用时移地址

因此代码采取：

```text
当前频道实时地址
    ↓
当前节目地址
    ↓
历史节目时移地址
    ↓
备用直播源
```

这是一个很典型的**降级策略**。

开发类似系统时，不应该只设计：

```text
成功路径
```

还应该明确设计：

```text
实时地址不可用时怎么办？
接口失败怎么办？
解密失败怎么办？
播放列表失败怎么办？
缓存过期怎么办？
```

---

# 十三、直播 URL 缓存机制

## 13.1 缓存文件位置

```php
function getCacheDir() {
    $dir = sys_get_temp_dir()
        . '/kankan-live-url-'
        . substr(sha1(__FILE__), 0, 12);
    ...
}
```

缓存目录位于系统临时目录，例如：

```text
/tmp/kankan-live-url-a1b2c3d4e5f6/
```

不同文件通过 `sha1(__FILE__)` 区分。

---

## 13.2 每个频道单独缓存

```php
function getLiveUrlCacheFile($channelId) {
    return getCacheDir() . '/channel-' . intval($channelId) . '.url';
}
```

例如：

```text
channel-10.url
```

这样不同频道互不影响。

---

## 13.3 缓存中保存 URL 和过期时间

```php
$payload = json_encode([
    'url' => $url,
    'exp' => $exp
]);
```

而不是只保存 URL。

这样可以同时知道：

```text
URL 内容是什么
URL 什么时候失效
```

---

## 13.4 为什么同时检查文件时间和 URL 时间？

`readCachedLiveUrl()` 首先判断：

```php
if (time() - filemtime($file) >= LIVE_URL_CACHE_TTL) return false;
```

即缓存文件超过 600 秒就失效。

然后又判断：

```php
if ($exp > 0 && $exp - time() < LIVE_URL_MIN_LEFT) return false;
```

即使文件还没超过 600 秒，只要 URL 剩余时间少于 90 秒，也不要继续用。

这是非常合理的双重保护：

```text
缓存文件寿命
+
上游 URL 实际剩余寿命
```

---

# 十四、如何判断 URL 什么时候过期？

```php
function urlExpiry($url)
```

它检查几种常见参数：

```php
volcTime
txTime
wsTime
token.exp
```

例如某些 CDN URL 可能是：

```text
...?txTime=1790000000
```

也可能是：

```text
...?token=header.payload.signature
```

然后从 token 的 payload 中读取：

```php
$payload['exp']
```

这说明代码兼容多个 CDN 签名格式。

---

## 时间参数可能是十六进制

```php
$cands[] = ctype_xdigit($v) && !ctype_digit($v)
    ? hexdec($v)
    : (int) $v;
```

例如：

```text
txTime=68f1abcd
```

如果包含 `a-f`，就按十六进制解释。

否则按十进制解释。

最后：

```php
return $cands ? min($cands) : 0;
```

多个时间字段同时存在时，取最早的一个。

这是保守策略：

> 只要任意一个关键签名字段先过期，就认为 URL 失效。

---

# 十五、为什么要删除 URL 中的 start/end 参数？

```php
function normalizeLiveUrl($url)
```

它会删除：

```text
start
end
starttime
endtime
```

这通常是为了把一个带有节目时间范围的时移地址，转换成持续播放入口。

例如原始地址：

```text
https://cdn.example.com/live.m3u8?start=...&end=...&token=...
```

被规范化成：

```text
https://cdn.example.com/live.m3u8?token=...
```

也就是说：

- 保留授权 token
- 去掉固定节目时间范围
- 让播放列表尽可能继续滚动

不过要注意：

> 删除时间参数是否正确，完全取决于上游 CDN 协议。

有些平台的 `start`、`end` 不只是节目范围，也可能是签名计算的一部分。删除后可能导致授权失效。

---

# 十六、M3U8 处理流程

核心函数：

```php
function getFlatM3u8($url, $depth = 0)
```

它的目的不是简单转发 M3U8，而是把多层播放列表“压平”。

---

## 16.1 什么是主播放列表？

典型 HLS 结构：

```text
master.m3u8
  ├── 1080p.m3u8
  ├── 720p.m3u8
  └── 480p.m3u8
```

主播放列表中通常出现：

```text
#EXT-X-STREAM-INF
```

它指向不同码率的子播放列表。

代码发现：

```php
if (strpos($line, '#EXT-X-STREAM-INF') === 0)
```

就读取下一行的子 URL：

```php
$subUrl = trim($lines[$i]);
```

然后递归调用：

```php
$subContent = getFlatM3u8(
    toAbsoluteUrl($url, $subUrl),
    $depth + 1
);
```

找到可用子播放列表后直接返回。

---

## 16.2 什么是媒体播放列表？

媒体播放列表包含：

```text
#EXTINF:6.0,
segment001.ts
```

代码看到：

```php
elseif (strpos($line, '#EXTINF:') === 0)
```

就把分片地址转换成绝对 URL：

```php
$output[] = toAbsoluteUrl($url, $tsUrl);
```

最终输出类似：

```text
#EXTM3U
#EXT-X-TARGETDURATION:6
#EXTINF:6,
https://cdn.example.com/segment001.ts
#EXTINF:6,
https://cdn.example.com/segment002.ts
```

播放器就不需要自己解析相对路径。

---

## 16.3 URI 标签也会被转换

有些 M3U8 标签不是单独一行 URL，而是这样：

```text
#EXT-X-KEY:METHOD=AES-128,URI="key.key"
```

代码使用：

```php
preg_replace_callback('/URI="([^"]+)"/i', ...)
```

把其中的相对 URI 转成绝对地址。

这对：

- AES 密钥
- 字幕
- 初始化片段
- 其他媒体资源

都很重要。

---

## 16.4 最大递归深度

```php
if ($depth > 5) return '';
```

这可以防止：

- 播放列表循环引用
- 异常递归
- 恶意构造的无限嵌套
- 过度请求上游

这是一个必要的保护。

---

# 十七、TS 分片代理和缓存

如果请求包含：

```text
?ts_url=...
```

就不会走主流程，而是进入分片代理逻辑。

---

## 17.1 参数校验

首先判断 URL 必须是 HTTP 或 HTTPS：

```php
if (!preg_match('/^https?:\/\//i', $ts_url))
```

然后提取文件名：

```php
$path = parse_url($ts_url, PHP_URL_PATH);
$filename = basename((string) $path);
```

文件名必须符合：

```text
字母数字开头
允许字母数字、点、下划线、短横线
扩展名是 ts/m4s/mp4/aac/key/vtt
```

这可以防止直接把任意路径写入缓存目录。

---

## 17.2 本地 TS 缓存

缓存路径：

```php
$cache_dir = __DIR__ . '/ts_cache';
$cache_file = $cache_dir . '/' . $filename;
```

缓存时间：

```php
$cache_ttl = 86400;
```

即 24 小时。

如果本地存在未过期分片，就直接返回。

这会减少：

- 上游请求数量
- 带宽消耗
- 播放器重复请求
- CDN 压力

---

## 17.3 文件锁

读取时：

```php
flock($fp, LOCK_SH)
```

写入时：

```php
flock($fp, LOCK_EX)
```

含义是：

| 锁 | 作用 |
|---|---|
| `LOCK_SH` | 多个请求可以同时读 |
| `LOCK_EX` | 写入时独占 |

直播并发场景下，文件锁可以减少缓存文件被同时读写导致的损坏。

---

# 十八、主流程完整拆解

文件底部是整个程序的入口。

---

## 第一步：获取频道

```php
$id = $_GET['id'] ?? 'wxty';
```

默认频道为 `wxty`。

---

## 第二步：判断是否请求分片

```php
if (isset($_GET['ts_url'])) {
    ...
    exit;
}
```

如果是分片请求，就直接代理分片，不再获取频道地址。

---

## 第三步：判断是否强制刷新

```php
$forceRefresh =
    isset($_GET['refresh'])
    && $_GET['refresh'] !== '0';
```

例如：

```text
?wxty&refresh=1
```

会跳过缓存，重新请求上游。

---

## 第四步：获取直播 URL

```php
$liveUrl = getLiveUrl(
    $channelId,
    $forceRefresh,
    $cacheHit,
    $meta
);
```

可能走：

```text
本地缓存
频道实时地址
当前节目地址
历史节目供体地址
```

---

## 第五步：获取并扁平化 M3U8

```php
$finalM3u8 = getFlatM3u8($liveUrl);
```

如果获取失败，且之前使用的是缓存：

```php
if (!$finalM3u8 && $cacheHit) {
    clearCachedLiveUrl($channelId);
    $liveUrl = getLiveUrl($channelId, true, $cacheHit, $meta);
    if ($liveUrl) {
        $finalM3u8 = getFlatM3u8($liveUrl);
    }
}
```

这是一种非常实用的自动恢复流程：

```text
缓存 URL 播放失败
    ↓
删除缓存
    ↓
重新获取最新地址
    ↓
再次尝试播放
```

---

## 第六步：最终失败则跳转备用源

```php
redirectToFallback('playlist-fetch-failed: 拉取播放列表失败');
```

并返回：

```http
302 Location: https://...
```

---

## 第七步：如果请求 info，返回调试信息

```php
if (isset($_GET['info'])) {
```

返回：

- 当前频道
- 来源
- 类型
- 节目名称
- 当前播放地址
- 是否缓存命中
- 剩余有效时间
- 分片数量
- 备用地址

这个功能非常适合排查：

- API 是否成功
- RSA 是否成功
- 是否命中缓存
- 当前使用的是直播地址还是时移地址
- URL 还有多久过期

---

# 十九、这个文件的核心设计思想

可以总结为四个词：

## 1. 适配

上游 API 复杂，播放器不应该了解：

- API 签名
- RSA 处理
- 节目列表
- 供体节目
- CDN 过期参数

PHP 文件负责把这些细节隐藏起来。

---

## 2. 降级

它不是只有一条路径，而是多级备用：

```text
频道实时地址
    ↓
当前节目
    ↓
历史节目
    ↓
缓存刷新
    ↓
备用直播源
```

---

## 3. 缓存

缓存分两类：

```text
直播 URL 缓存
TS 分片缓存
```

这两个缓存的生命周期不同：

| 缓存 | 特点 |
|---|---|
| 播放 URL | 短时间、强依赖过期时间 |
| TS 分片 | 文件内容固定，可以缓存较久 |

---

## 4. 转换

它将：

```text
多层 M3U8
相对 URL
加密播放地址
```

转换为：

```text
单层 M3U8
绝对 URL
播放器可直接使用的资源
```

---

# 二十、这段代码中的重要安全问题

这部分非常重要。代码能工作，不代表设计是安全的。

## 1. API Secret 被硬编码

```php
const KANKAN_API_SECRET = '...';
```

如果代码仓库是公开的，这个密钥已经暴露。

而且这个密钥本身位于客户端适配代码中，不应被当作真正秘密。

更好的方式是：

```php
getenv('KANKAN_API_SECRET')
```

并在服务器环境变量中配置。

但是要注意：

> 如果签名算法必须在公开客户端中运行，那么密钥最终仍然可能被提取。真正可靠的方案应由服务端签名，或者使用非对称签名机制。

---

## 2. 禁用了 TLS 证书验证

代码中多次出现：

```php
CURLOPT_SSL_VERIFYPEER => false,
CURLOPT_SSL_VERIFYHOST => false,
```

这意味着 PHP 不验证上游 HTTPS 证书。

风险包括：

- 中间人攻击
- API 响应被篡改
- 播放地址被替换
- 恶意内容注入
- 密钥或签名请求被窃取

生产环境应该改成：

```php
CURLOPT_SSL_VERIFYPEER => true,
CURLOPT_SSL_VERIFYHOST => 2,
```

并确保服务器有正确的 CA 证书。

---

## 3. `ts_url` 存在 SSRF 风险

用户可以传入：

```text
?ts_url=https://任意域名/file.ts
```

当前代码只校验：

- URL 是 HTTP/HTTPS
- 文件名扩展名正确

但没有限制主机名。

因此服务器可能被用来访问：

- 内网服务
- 云平台元数据地址
- 管理后台
- 其他任意 HTTP 服务

尤其是：

```text
http://127.0.0.1/...
http://localhost/...
http://169.254.169.254/...
```

都应该拒绝。

正确思路是：

1. 只允许白名单域名；
2. 禁止内网 IP；
3. 禁止重定向到其他域名；
4. 解析 DNS 后再次校验 IP；
5. 限制响应大小；
6. 限制请求速率。

---

## 4. 跟随重定向可能绕过校验

代码使用：

```php
CURLOPT_FOLLOWLOCATION => true
```

即便初始 URL 是合法 CDN，CDN 也可能重定向到其他主机。

因此仅校验初始 URL 不够。

需要：

- 禁止自动重定向；
- 或逐跳检查目标；
- 或限制重定向次数和域名。

---

## 5. 缓存文件名可能冲突

缓存只使用：

```php
$filename = basename($path);
```

例如不同 URL：

```text
https://a.example.com/live/segment001.ts
https://b.example.com/live/segment001.ts
```

最后都写成：

```text
ts_cache/segment001.ts
```

后访问者可能拿到其他源的内容。

更安全的缓存键应该包含：

```text
host + path + 查询参数
```

例如：

```php
$cacheKey = hash('sha256', $ts_url);
```

然后用：

```text
ts_cache/<sha256>.cache
```

---

## 6. 文件扩展名和 Content-Type 不完全匹配

无论实际请求的是：

- `.m4s`
- `.mp4`
- `.aac`
- `.key`
- `.vtt`

代码最终都返回：

```php
Content-Type: video/MP2T
```

这可能影响播放器解析。

应该根据扩展名返回对应的 MIME 类型。

---

## 7. 未限制响应大小

```php
CURLOPT_RETURNTRANSFER => true
```

会把整个响应加载到内存。

如果上游恶意返回很大的内容，可能造成：

- PHP 内存耗尽
- Worker 被拖死
- 服务拒绝

应该限制：

```php
CURLOPT_MAXFILESIZE
```

或者使用流式写入文件。

---

# 二十一、如果以后遇到类似场景，应该如何思考？

你可以使用下面这套通用分析框架。

---

## 第一步：先画数据流，不要先看细节

先问：

```text
用户输入什么？
服务器调用谁？
中间产生什么凭据？
最后输出什么？
```

对这个文件来说：

```text
id
  ↓
channel_id
  ↓
API 请求
  ↓
签名
  ↓
加密播放地址
  ↓
RSA 处理
  ↓
真实 M3U8
  ↓
播放器
```

先建立这个图，比一上来研究某一行 MD5 更有效。

---

## 第二步：区分“身份验证”和“数据加密”

看到以下东西时，要明确它们属于哪类：

| 现象 | 可能含义 |
|---|---|
| `sign`、`signature`、`hash` | 签名或完整性校验 |
| `nonce` | 防重放随机数 |
| `timestamp` | 防旧请求、防重放 |
| `token` | 授权凭证 |
| `exp` | 过期时间 |
| `RSA/AES` | 加密、解密或签名 |
| `Base64` | 编码，不是加密 |
| `MD5/SHA` | 哈希或签名组成部分 |
| `public key` | 公钥验证或加密 |
| `private key` | 私钥解密或签名 |

不要因为看到 `md5()` 就认为它是加密。

---

## 第三步：还原签名协议

对于任何 API 签名，都按这个顺序检查：

### 1. 哪些字段参与签名？

例如：

```text
channel_id
date
timestamp
nonce
version
platform
```

### 2. 字段如何排序？

```text
字典序
参数出现顺序
固定顺序
```

### 3. 参数如何序列化？

```text
key=value
key:value
JSON
URL 编码
```

### 4. 空值怎么处理？

```text
跳过
保留 key=
转换为空字符串
```

### 5. 是否有固定后缀或前缀？

```text
secret + string
string + secret
```

### 6. 哈希做几次？

```text
MD5
MD5(MD5(x))
HMAC-SHA256
```

### 7. 签名放在哪里？

```text
URL 参数
HTTP Header
Cookie
请求体
```

只要这七点还原正确，通常就能复现签名协议。

---

## 第四步：判断 URL 是否有时效性

重点检查：

```text
exp
expires
txTime
wsTime
volcTime
start
end
token
```

然后回答：

1. URL 什么时候过期？
2. 过期时间是十进制还是十六进制？
3. URL 是否需要提前刷新？
4. 缓存时应该缓存多久？
5. 播放失败时是否应该清缓存重试？

这个文件做得比较完整：

```text
文件缓存时间 <= 600 秒
URL 剩余有效时间 >= 90 秒
```

---

## 第五步：识别 HLS 的播放列表层级

看到 M3U8 时，先区分：

```text
Master Playlist
Media Playlist
```

判断依据：

| 标志 | 含义 |
|---|---|
| `#EXT-X-STREAM-INF` | 主播放列表，指向不同清晰度 |
| `#EXTINF` | 媒体播放列表，指向具体分片 |
| `#EXT-X-KEY` | AES 密钥信息 |
| `#EXT-X-MAP` | 初始化片段 |
| `#EXT-X-MEDIA` | 音频、字幕或其他媒体轨道 |

如果播放器不支持多层结构，就需要递归解析并输出绝对地址。

---

## 第六步：分析所有失败路径

不要只问“成功时怎么走”，还要列出：

```text
API 请求失败
JSON 解析失败
频道无地址
节目无地址
RSA 解密失败
URL 格式错误
URL 已过期
M3U8 下载失败
子 M3U8 递归失败
分片下载失败
```

然后为每种情况设计：

- 重试
- 刷新缓存
- 降级
- 返回错误
- 备用源

这个文件的整体可靠性，主要来自这些失败路径，而不是单纯的 API 调用。

---

# 二十二、可以把类似系统抽象成一个通用模板

以后你遇到类似代码，可以按下面的伪流程理解：

```text
1. 校验外部输入
2. 将业务名称映射成内部 ID
3. 读取或生成客户端标识
4. 生成时间戳和 nonce
5. 整理并排序参数
6. 按协议生成签名
7. 发起带授权头的 API 请求
8. 提取受保护的数据
9. 根据协议解码、解密或验签
10. 检查资源 URL 是否有效
11. 根据过期时间决定是否缓存
12. 获取最终内容
13. 递归处理嵌套资源
14. 转换成下游需要的格式
15. 失败时重试或降级
16. 最后输出内容或备用地址
```

这套思维不仅适用于直播，也适用于：

- 视频网站接口
- 音频播放地址
- CDN 防盗链
- 临时下载链接
- 短视频接口
- API 网关签名
- 第三方 SDK 协议逆向
- WebSocket 鉴权
- 云存储临时 URL

---

# 二十三、最后用一句话概括每个关键机制

| 机制 | 一句话解释 |
|---|---|
| `channelMap` | 将公开频道名映射为内部频道 ID |
| `nonce` | 每次请求生成的随机值，用于降低重放风险 |
| `timestamp` | 表示请求新鲜度，防止旧请求长期有效 |
| `stableUuid` | 模拟一个稳定的客户端身份 |
| `KANKAN_API_SECRET` | 参与 API 签名的共享密钥 |
| 双重 MD5 | 根据固定协议生成请求认证值 |
| RSA 公钥处理 | 恢复或验证上游用 RSA 封装的播放地址 |
| `urlExpiry` | 解析 CDN URL 的过期时间 |
| `normalizeLiveUrl` | 删除固定时间范围，保留授权参数 |
| `getFlatM3u8` | 将多层 HLS 播放列表转换为单层列表 |
| `ts_cache` | 缓存直播分片，减少重复请求 |
| `fallback` | 主链路失败时使用备用直播源 |

最重要的理解是：

> **这个文件不是简单“请求一个视频地址”，而是在模拟一个官方客户端：先完成身份和请求授权，再获取受保护的播放地址，最后把复杂的直播资源转换成播放器容易消费的格式。**


---
# Star history

[![Star History Chart](https://api.star-history.com/svg?repos=dangerwolf/kankan-live&type=Date)](https://www.star-history.com/#dangerwolf/kankan-live&Date)


# 友情赞助商


1. [Cloudcone VPS](https://app.cloudcone.com/?ref=12850)

2. [![This Website is Powered by DigitalPlat FreeDomain Get a free domain from DigitalPlat.](https://img.shields.io/badge/DigitalPlat-Get%20a%20free%20domain%20from%20DigitalPlat.-2563eb?style=flat-square&logo=databricks&logoColor=ffffff)](https://dash.domain.digitalplat.org/signup?ref=3lT6CU6HGe)

3. [DMIT](https://www.dmit.io/aff.php?aff=23825)


