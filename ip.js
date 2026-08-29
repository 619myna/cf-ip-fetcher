const https = require('https');
const net = require('net');

// 缓存
let cache = {
  data: null,
  timestamp: 0,
  ttl: 60000, // 1 分钟
};

// 数据源（可根据需要增删）
const dataSources = [
  'https://ipdb.api.030101.xyz/?type=bestcf',
  'https://ip.164746.xyz/ipTop.html',
  'https://stock.hostmonit.com/CloudFlareYes',
  // 'https://stock.hostmonit.com/CloudFlareYesV6',
  'https://www.wetest.vip/page/cloudflare/address_v4.html',
  // 'https://www.wetest.vip/page/cloudflare/address_v6.html',
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
    // 2. 并发请求所有数据源（每个 4 秒超时）
    const fetchPromises = dataSources.map((url) => fetchData(url, 4000));
    const results = await Promise.allSettled(fetchPromises);

    const allIPs = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const data = result.value;
        const ips = extractIPs(data, dataSources[index]);
        console.log(`[Source] ${dataSources[index]} -> ${ips.length} IPs`);
        allIPs.push(...ips);
      } else {
        console.log(`[Source] ${dataSources[index]} failed: ${result.reason.message}`);
      }
    });

    // 3. 去重排序
    const uniqueIPs = [...new Set(allIPs)].sort((a, b) => a.localeCompare(b));

    if (uniqueIPs.length === 0) {
      throw new Error('No valid IPs retrieved');
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

// ---------- 安全请求函数（修复异常捕获） ----------
function fetchData(url, timeoutMs = 4000, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 3) {
      return reject(new Error('Too many redirects'));
    }

    let finished = false; // 防止重复 resolve/reject

    const req = https.get(url, (response) => {
      // 捕获响应流错误（关键修复）
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
        // 递归处理重定向
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

    // 请求级错误（网络、DNS 等）
    req.on('error', (err) => {
      if (!finished) {
        finished = true;
        reject(err);
      }
    });

    // 超时处理
    req.setTimeout(timeoutMs, () => {
      if (!finished) {
        finished = true;
        req.destroy();
        reject(new Error(`Request timeout (${timeoutMs}ms)`));
      }
    });
  });
}

// ---------- IP 提取（使用 net.isIP 精确校验） ----------
function extractIPs(data, source) {
  if (!data) return [];
  const ips = [];

  // IPv4 严格匹配
  const ipv4Regex = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;
  let match;
  while ((match = ipv4Regex.exec(data)) !== null) {
    const ip = match[0];
    if (net.isIP(ip) === 4 && !isPrivateIPv4(ip)) {
      ips.push(ip);
    }
  }

  // IPv6 常用格式正则（含压缩）
  const ipv6Regex = /\b(?:[0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{1,4}\b|\b[0-9a-fA-F]{1,4}::[0-9a-fA-F]{1,4}\b|\b::[0-9a-fA-F]{1,4}\b|\b[0-9a-fA-F]{1,4}::\b|\b::\b/g;
  while ((match = ipv6Regex.exec(data)) !== null) {
    const ip = match[0];
    if (net.isIP(ip) === 6 && !isPrivateIPv6(ip)) {
      ips.push(ip);
    }
  }

  return ips;
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

// 私有 IPv6 检查（常见前缀）
function isPrivateIPv6(ip) {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fe80:') || lower.startsWith('fe90:') ||
      lower.startsWith('fea0:') || lower.startsWith('feb0:')) return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  if (lower.startsWith('ff')) return true;
  return false;
}
