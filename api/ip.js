const https = require('https');

// 缓存
let cache = {
  data: null,
  timestamp: 0,
  ttl: 60000, // 1分钟
};

// 数据源（仅保留稳定的IPv4源）
const dataSources = [
  'https://ipdb.api.030101.xyz/?type=bestcf',
  'https://ip.164746.xyz/ipTop.html',
  'https://stock.hostmonit.com/CloudFlareYes',
  'https://www.wetest.vip/page/cloudflare/address_v4.html',
  'https://api.urlce.com/cloudflare.html',
];

module.exports = async (req, res) => {
  const now = Date.now();

  // 1. 检查缓存
  if (cache.data && now - cache.timestamp < cache.ttl) {
    console.log('[Cache] HIT');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Cache', 'HIT');
    return res.end(cache.data);
  }

  try {
    // 2. 并发获取所有源（每个超时5秒）
    const fetchPromises = dataSources.map(url => fetchData(url, 5000));
    const results = await Promise.allSettled(fetchPromises);

    const allIPs = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const data = result.value;
        const ips = extractIPv4(data);
        console.log(`[${dataSources[index]}] 获取 ${ips.length} 个IP`);
        allIPs.push(...ips);
      } else {
        console.log(`[${dataSources[index]}] 失败: ${result.reason.message}`);
      }
    });

    // 3. 去重排序
    const uniqueIPs = [...new Set(allIPs)].sort((a, b) => a.localeCompare(b));

    if (uniqueIPs.length === 0) {
      throw new Error('未获取到任何有效IP');
    }

    const resultText = uniqueIPs.join('\n');

    // 4. 更新缓存
    cache.data = resultText;
    cache.timestamp = now;

    // 5. 响应
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Cache', 'MISS');
    res.end(resultText);
  } catch (error) {
    console.error('[Error]', error.message);
    // 降级：返回旧缓存
    if (cache.data) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('X-Cache', 'HIT-FALLBACK');
      return res.end(cache.data);
    }
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Error: ' + error.message);
  }
};

// ---------- 安全的请求函数 ----------
function fetchData(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    let finished = false;
    const req = https.get(url, (response) => {
      // 处理重定向
      if (response.statusCode === 301 || response.statusCode === 302) {
        const location = response.headers.location;
        if (!location) return reject(new Error('重定向无Location'));
        const nextUrl = new URL(location, url).toString();
        fetchData(nextUrl, timeoutMs)
          .then(data => { if (!finished) { finished = true; resolve(data); } })
          .catch(err => { if (!finished) { finished = true; reject(err); } });
        return;
      }
      if (response.statusCode !== 200) {
        if (!finished) { finished = true; reject(new Error(`HTTP ${response.statusCode}`)); }
        return;
      }
      let raw = '';
      response.on('data', chunk => raw += chunk);
      response.on('end', () => { if (!finished) { finished = true; resolve(raw); } });
      response.on('error', err => { if (!finished) { finished = true; reject(err); } });
    });
    req.on('error', err => { if (!finished) { finished = true; reject(err); } });
    req.setTimeout(timeoutMs, () => {
      if (!finished) {
        finished = true;
        req.destroy();
        reject(new Error(`请求超时 (${timeoutMs}ms)`));
      }
    });
  });
}

// ---------- IPv4 提取与过滤 ----------
function extractIPv4(text) {
  if (!text) return [];
  const regex = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;
  const matches = text.match(regex) || [];
  const unique = new Set();
  for (const ip of matches) {
    const parts = ip.split('.').map(Number);
    if (parts.some(p => isNaN(p) || p < 0 || p > 255)) continue;
    // 过滤私有/保留地址
    if (parts[0] === 10 || parts[0] === 127) continue;
    if (parts[0] === 169 && parts[1] === 254) continue;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) continue;
    if (parts[0] === 192 && parts[1] === 168) continue;
    unique.add(ip);
  }
  return Array.from(unique);
}
