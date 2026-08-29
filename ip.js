const https = require('https');
const net = require('net');

// 内存缓存
let cache = {
  data: null,
  timestamp: 0,
  ttl: 60000, // 1 分钟
};

// 数据源（可自行增删）
const dataSources = [
  'https://ipdb.api.030101.xyz/?type=bestcf',
  'https://ip.164746.xyz/ipTop.html',
  'https://stock.hostmonit.com/CloudFlareYes',
  // 'https://stock.hostmonit.com/CloudFlareYesV6', // 若有 IPv6 可放开
  'https://www.wetest.vip/page/cloudflare/address_v4.html',
  // 'https://www.wetest.vip/page/cloudflare/address_v6.html',
  'https://api.urlce.com/cloudflare.html',
];

module.exports = async (req, res) => {
  const now = Date.now();

  // 1. 检查缓存（有效期内）
  if (cache.data && now - cache.timestamp < cache.ttl) {
    console.log('[Cache] HIT');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Cache', 'HIT');
    res.setHeader('X-Cache-Expire', new Date(cache.timestamp + cache.ttl).toISOString());
    return res.end(cache.data);
  }

  console.log('[Cache] MISS, fetching from sources...');

  try {
    // 2. 并发请求所有数据源（每个设置 4 秒超时）
    const fetchPromises = dataSources.map((url) =>
      fetchData(url, 4000) // 超时 4 秒
    );

    const results = await Promise.allSettled(fetchPromises);
    const allIPs = [];

    // 3. 解析每个结果
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const sourceUrl = dataSources[index];
        const data = result.value;
        const ips = extractIPs(data, sourceUrl);
        console.log(`[Source] ${sourceUrl} -> ${ips.length} IPs`);
        allIPs.push(...ips);
      } else {
        console.log(`[Source] ${dataSources[index]} failed: ${result.reason.message}`);
      }
    });

    // 4. 去重、排序
    const uniqueIPs = [...new Set(allIPs)].sort((a, b) => a.localeCompare(b));

    if (uniqueIPs.length === 0) {
      throw new Error('No valid IPs retrieved from any source');
    }

    const resultText = uniqueIPs.join('\n');

    // 5. 更新缓存
    cache.data = resultText;
    cache.timestamp = now;

    // 6. 响应
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Cache', 'MISS');
    res.setHeader('X-Cache-Expire', new Date(now + cache.ttl).toISOString());
    res.end(resultText);
  } catch (error) {
    console.error('[Error]', error.message);

    // 降级：返回过期缓存（若有）
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

// ---------- 工具函数 ----------

/** 通过 https.get 获取数据，支持超时和重定向（最多3次） */
function fetchData(url, timeoutMs = 4000, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 3) {
      return reject(new Error('Too many redirects'));
    }

    const req = https.get(url, (response) => {
      // 处理重定向
      if (response.statusCode === 301 || response.statusCode === 302) {
        const location = response.headers.location;
        if (!location) return reject(new Error('Redirect without Location header'));
        const nextUrl = new URL(location, url).toString();
        return fetchData(nextUrl, timeoutMs, redirectCount + 1)
          .then(resolve)
          .catch(reject);
      }

      if (response.statusCode !== 200) {
        return reject(new Error(`HTTP ${response.statusCode}`));
      }

      let rawData = '';
      response.on('data', (chunk) => (rawData += chunk));
      response.on('end', () => resolve(rawData));
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error(`Request timeout (${timeoutMs}ms)`));
    });

    req.on('error', reject);
  });
}

/** 从文本中提取 IPv4 和 IPv6，并过滤私有地址 */
function extractIPs(data, source) {
  if (!data) return [];

  const ips = [];

  // ---------- IPv4 ----------
  // 严格匹配点分十进制（避免匹配到非IP数字串）
  const ipv4Regex = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;
  let match;
  while ((match = ipv4Regex.exec(data)) !== null) {
    const ip = match[0];
    if (net.isIP(ip) === 4 && !isPrivateIPv4(ip)) {
      ips.push(ip);
    }
  }

  // ---------- IPv6 ----------
  // 简单但有效的IPv6正则（匹配常见格式，包括压缩）
  const ipv6Regex = /\b(?:[0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{1,4}\b|\b[0-9a-fA-F]{1,4}::[0-9a-fA-F]{1,4}\b|\b::[0-9a-fA-F]{1,4}\b|\b[0-9a-fA-F]{1,4}::\b|\b::\b/g;
  while ((match = ipv6Regex.exec(data)) !== null) {
    const ip = match[0];
    if (net.isIP(ip) === 6 && !isPrivateIPv6(ip)) {
      ips.push(ip);
    }
  }

  return ips;
}

/** 检查 IPv4 是否为私有/保留地址 */
function isPrivateIPv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts[0] === 0) return true; // 0.0.0.0/8
  if (parts[0] === 10) return true; // 10.0.0.0/8
  if (parts[0] === 127) return true; // 127.0.0.0/8
  if (parts[0] === 169 && parts[1] === 254) return true; // 169.254.0.0/16
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true; // 172.16.0.0/12
  if (parts[0] === 192 && parts[1] === 168) return true; // 192.168.0.0/16
  return false;
}

/** 检查 IPv6 是否为私有/保留地址（常见前缀） */
function isPrivateIPv6(ip) {
  const lower = ip.toLowerCase();
  // 环回 ::1, 未指定 ::, 链路本地 fe80::/10, 唯一本地 fc00::/7, 多播 ff00::/8
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fe80:') || lower.startsWith('fe90:') || lower.startsWith('fea0:') || lower.startsWith('feb0:')) return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  if (lower.startsWith('ff')) return true;
  return false;
}        ];

        // 2. 并发请求，设置 3 秒硬超时
        const fetchPromises = dataSources.map(source => 
            safeFetch(source, 3000)
                .then(data => ({ source, data }))
                .catch(() => ({ source, data: '' }))
        );

        const results = await Promise.all(fetchPromises);
        let allIPs = [];

        for (let i = 0; i < results.length; i++) {
            if (results[i].data) {
                const ips = extractIPs(results[i].data, results[i].source);
                for (let j = 0; j < ips.length; j++) {
                    allIPs.push(ips[j]);
                }
            }
        }

        // 3. 去重与排序（IPv4 在前，IPv6 在后）
        let uniqueIPs = Array.from(new Set(allIPs)).sort((a, b) => {
            const aV4 = a.includes(".");
            const bV4 = b.includes(".");
            if (aV4 && !bV4) return -1;
            if (!aV4 && bV4) return 1;
            return a.localeCompare(b);
        });

        let cacheStatus = 'MISS';

        // 4. 多级降级保障
        if (uniqueIPs.length === 0) {
            if (cache.data) {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('X-Cache', 'HIT-FALLBACK');
                return res.end(cache.data);
            } else {
                uniqueIPs = EMERGENCY_IPS;
                cacheStatus = 'EMERGENCY-FALLBACK';
            }
        }

        const resultText = uniqueIPs.join('\n');

        if (cacheStatus !== 'EMERGENCY-FALLBACK') {
            cache.data = resultText;
            cache.timestamp = now;
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('X-Cache', cacheStatus);
        return res.end(resultText);

    } catch (e) {
        // 绝对保活拦截，确保任何未知异常均不导致 Vercel 崩溃
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('X-Cache', 'FATAL-RECOVERY');
        return res.end(cache.data || EMERGENCY_IPS.join('\n'));
    }
};

async function safeFetch(url, timeoutMs = 3000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        clearTimeout(timer);
        if (!response.ok) return '';
        return await response.text();
    } catch (e) {
        clearTimeout(timer);
        return '';
    }
}

function extractIPs(data, source) {
    if (!data || typeof data !== 'string') return [];
    const candidates = [];

    if (source && (source.includes('ipdb.api.030101.xyz') || source.includes('stock.hostmonit.com'))) {
        try {
            const jsonData = JSON.parse(data);
            const list = jsonData.data || jsonData.info || [];
            if (Array.isArray(list)) {
                list.forEach(item => {
                    if (item && typeof item.ip === 'string') {
                        candidates.push(item.ip.trim());
                    }
                });
            }
        } catch (e) {}
    }

    const matches = data.match(/[0-9a-fA-F.:]{3,45}/g);
    if (matches) {
        for (let i = 0; i < matches.length; i++) {
            const str = matches[i];
            if (str.includes('.') || str.includes(':')) {
                const cleaned = str.replace(/^[.:]+|[.:]+$/g, '');
                if (cleaned.length >= 3) {
                    candidates.push(cleaned);
                }
            }
        }
    }

    return candidates.filter(isPublicIP);
}

function isPublicIP(ip) {
    if (ip.includes('.')) {
        if (!/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(ip)) return false;
        const parts = ip.split('.').map(Number);
        if (parts.some(p => p > 255)) return false;
        if (parts[0] === 0 || parts[0] === 10 || parts[0] === 127) return false;
        if (parts[0] === 169 && parts[1] === 254) return false;
        if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;
        if (parts[0] === 192 && parts[1] === 168) return false;
        return true;
    }

    if (ip.includes(':')) {
        if (!/^[0-9a-fA-F:]+$/.test(ip)) return false;
        const lower = ip.toLowerCase();
        if (lower === '::' || lower === '::1') return false;
        if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return false;
        if (lower.startsWith('fc') || lower.startsWith('fd')) return false;
        return true;
    }

    return false;
}
