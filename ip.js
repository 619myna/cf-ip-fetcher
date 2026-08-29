const https = require('https');
const net = require('net');

// 缓存
let cache = {
  data: null,
  timestamp: 0,
  ttl: 60000, // 1 分钟
};

// 数据源（仅保留可能返回 IPv4 的源）
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
    res.setHeader('X-Cache-Expire', new Date(cache.timestamp + cache.ttl).toISOString());
    return res.end(cache.data);
  }

  console.log('[Cache] MISS, fetching...');

  try {
    // 2. 并发请求所有数据源（每个 5 秒超时）
    const fetchPromises = dataSources.map((url) => fetchData(url, 5000));
    const results = await Promise.allSettled(fetchPromises);

    const allIPs = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const data = result.value;
        const ips = extractIPv4(data);
        console.log(`[Source] ${dataSources[index]} -> ${ips.length} IPv4`);
        allIPs.push(...ips);
      } else {
        console.log(`[Source] ${dataSources[index]} failed: ${result.reason.message}`);
      }
    });

    // 3. 去重排序
    const uniqueIPs = [...new Set(allIPs)].sort((a, b) => a.localeCompare(b));

    if (uniqueIPs.length === 0) {
      throw new Error('No valid IPv4 addresses retrieved');
    }

    const resultText = uniqueIPs.join('\n');

    // 4. 更新缓存
    cache.data = resultText;
    cache.timestamp = now;

    // 5. 响应
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Cache', 'MISS');
    res.setHeader('X-Cache-Expire', new Date(now + cache.ttl).toISOString());
    res.end(resultText);
  } catch (error) {
    console.error('[Error]', error.message);

    // 降级：返回过期缓存
    if (cache.data) {
      console.log('[Fallback] Returning stale cache');
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('X-Cache', 'HIT-FALLBACK');
      res.setHeader('X-Cache-Expire', new Date(cache.timestamp + cache.ttl).toISOString());
      return res.end(cache.data);
    }

    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Error: ' + error.message);
  }
};

// ---------- 安全的请求函数（捕获所有可能的错误） ----------
function fetchData(url, timeoutMs = 5000, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 3) {
      return reject(new Error('Too many redirects'));
    }

    let finished = false;

    const req = https.get(url, (response) => {
      // 捕获响应流错误（例如中断）
      response.on('error', (err) => {
        if (!finished) {
          finished = true;
          reject(err);
        }
      });

      // 处理重定向
      if (response.statusCode === 301 || response.statusCode === 302) {
        const location = response.headers.location;
        if (!location) {
          if (!finished) {
            finished = true;
            reject(new Error('Redirect without Location header'));
          }
          return;
        }
        const nextUrl = new URL(location, url).toString();
        fetchData(nextUrl, timeoutMs, redirectCount + 1)
          .then((data) => {
            if (!finished) {
              finished = true;
              resolve(data);
            }
          })
          .catch((err) => {
            if (!finished) {
              finished = true;
              reject(err);
            }
          });
        return;
      }

      // 非 200
      if (response.statusCode !== 200) {
        if (!finished) {
          finished = true;
          reject(new Error(`HTTP ${response.statusCode}`));
        }
        return;
      }

      let rawData = '';
      response.on('data', (chunk) => (rawData += chunk));
      response.on('end', () => {
        if (!finished) {
          finished = true;
          resolve(rawData);
        }
      });
    });

    // 请求级错误（DNS、网络等）
    req.on('error', (err) => {
      if (!finished) {
        finished = true;
        reject(err);
      }
    });

    // 超时
    req.setTimeout(timeoutMs, () => {
      if (!finished) {
        finished = true;
        req.destroy();
        reject(new Error(`Request timeout (${timeoutMs}ms)`));
      }
    });
  });
}

// ---------- 仅提取 IPv4，并过滤私有地址 ----------
function extractIPv4(data) {
  if (!data) return [];

  const ipv4Regex = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;
  const matches = data.match(ipv4Regex);
  if (!matches) return [];

  // 去重并过滤私有地址
  const unique = new Set();
  for (const ip of matches) {
    // 用 net.isIP 验证，确保是合法 IPv4
    if (net.isIP(ip) === 4 && !isPrivateIPv4(ip)) {
      unique.add(ip);
    }
  }
  return Array.from(unique);
}

// 私有 IPv4 检查
function isPrivateIPv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts[0] === 0) return true;
  if (parts[0] === 10) return true;
  if (parts[0] === 127) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  return false;
}
