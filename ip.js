const https = require('https');

let cache = {
    data: null,
    timestamp: 0,
    ttl: 60000 // 1分钟
};

module.exports = async (req, res) => {
    try {
        const now = Date.now();
        if (cache.data && (now - cache.timestamp) < cache.ttl) {
            console.log('返回缓存数据');
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('X-Cache', 'HIT');
            res.setHeader('X-Cache-Expire', new Date(cache.timestamp + cache.ttl).toISOString());
            return res.end(cache.data);
        }

        const dataSources = [
            'https://ipdb.api.030101.xyz/?type=bestcf',
            'https://ip.164746.xyz/ipTop.html',
            'https://stock.hostmonit.com/CloudFlareYes',
            'https://stock.hostmonit.com/CloudFlareYesV6',
            'https://www.wetest.vip/page/cloudflare/address_v4.html',
            'https://www.wetest.vip/page/cloudflare/address_v6.html',
            'https://api.urlce.com/cloudflare.html'
        ];

        let allIPs = [];

        for (const source of dataSources) {
            try {
                console.log(`获取: ${source}`);
                const data = await fetchData(source);
                const ips = extractIPs(data);
                allIPs = allIPs.concat(ips);
                console.log(`从 ${source} 获得 ${ips.length} 个IP`);
            } catch (err) {
                console.log(`跳过 ${source}: ${err.message}`);
            }
        }

        const uniqueIPs = [...new Set(allIPs)].sort();
        const resultText = uniqueIPs.join('\n');

        cache.data = resultText;
        cache.timestamp = now;
        console.log(`总计 ${uniqueIPs.length} 个唯一IP，缓存更新`);

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('X-Cache', 'MISS');
        res.setHeader('X-Cache-Expire', new Date(now + cache.ttl).toISOString());
        res.end(resultText);
    } catch (error) {
        console.error('全局错误:', error);
        if (cache.data) {
            console.log('返回陈旧缓存作为降级');
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('X-Cache', 'HIT-FALLBACK');
            return res.end(cache.data);
        }
        res.status(500).end('Error: ' + error.message);
    }
};

function fetchData(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                return fetchData(response.headers.location).then(resolve).catch(reject);
            }
            if (response.statusCode !== 200) {
                reject(new Error(`HTTP ${response.statusCode}`));
                return;
            }
            let raw = '';
            response.on('data', chunk => raw += chunk);
            response.on('end', () => resolve(raw));
        });
        req.setTimeout(10000, () => {
            req.destroy();
            reject(new Error('请求超时'));
        });
        req.on('error', reject);
    });
}

function extractIPs(data) {
    // 使用简单、安全的正则（避免回溯爆炸）
    const ipv4Regex = /\b(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;
    const ipv6Regex = /\b(?:[0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{1,4}\b|\b[0-9a-fA-F]{1,4}::[0-9a-fA-F]{1,4}\b|\b::[0-9a-fA-F]{1,4}\b|\b[0-9a-fA-F]{1,4}::\b|\b::\b/g;

    const matches4 = data.match(ipv4Regex) || [];
    const matches6 = data.match(ipv6Regex) || [];
    const all = [...matches4, ...matches6];

    // 过滤私有/保留地址
    return all.filter(ip => {
        if (ip.includes('.')) {
            const p = ip.split('.');
            if (p[0] === '0' || p[0] === '10' || p[0] === '127') return false;
            if (p[0] === '169' && p[1] === '254') return false;
            if (p[0] === '172' && parseInt(p[1]) >= 16 && parseInt(p[1]) <= 31) return false;
            if (p[0] === '192' && p[1] === '168') return false;
            return true;
        } else {
            const lower = ip.toLowerCase();
            if (lower === '::1' || lower === '::') return false;
            if (lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('ff')) return false;
            return true;
        }
    });
}    "https://stock.hostmonit.com/CloudFlareYes",
    "https://stock.hostmonit.com/CloudFlareYesV6",
    "https://www.wetest.vip/page/cloudflare/address_v4.html",
    "https://www.wetest.vip/page/cloudflare/address_v6.html",
    "https://api.urlce.com/cloudflare.html",
  ];

  let allIPs = [];

  // 串行遍历数据源，单个请求8秒超时
  for (const url of dataSources) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) continue;
      const text = await res.text();
      const ips = extractIPs(text, url);
      allIPs.push(...ips);
    } catch (e) {
      continue;
    }
  }

  // 去重 + 排序
  const uniqueIPs = [...new Set(allIPs)].sort((a, b) => {
    const aV4 = a.includes(".");
    const bV4 = b.includes(".");
    if (aV4 && !bV4) return -1;
    if (!aV4 && bV4) return 1;
    return a.localeCompare(b);
  });

  const result = uniqueIPs.join("\n");
  cache.data = result;
  cache.timestamp = now;

  return new Response(result, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "X-Cache": "MISS",
    },
  });
}

// IP提取+过滤函数
function extractIPs(text, source) {
  let list = [];
  const v4 = text.match(ipv4Regex) || [];
  const v6 = text.match(ipv6Regex) || [];
  list.push(...v4, ...v6);

  return list.filter((ip) => {
    // IPv4私有地址过滤
    if (ip.includes(".")) {
      const seg = ip.split(".").map(Number);
      if (seg[0] === 10) return false;
      if (seg[0] === 127) return false;
      if (seg[0] === 169 && seg[1] === 254) return false;
      if (seg[0] === 172 && seg[1] >= 16 && seg[1] <= 31) return false;
      if (seg[0] === 192 && seg[1] === 168) return false;
      return true;
    }
    // IPv6私有地址过滤
    const low = ip.toLowerCase();
    for (const prefix of privateV6Prefix) {
      if (low.startsWith(prefix)) return false;
    }
    return true;
  });
}
