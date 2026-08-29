const https = require('https');

// 备用 IP 列表（当外部请求失败时使用）
const FALLBACK_IPS = [
  '1.1.1.1',
  '8.8.8.8',
  '9.9.9.9',
  '208.67.222.222',
  '114.114.114.114',
];

module.exports = async (req, res) => {
  try {
    // 尝试请求 Cloudflare trace（最稳定的源之一）
    const data = await fetchData('https://1.0.0.1/cdn-cgi/trace', 5000);
    const ips = extractIPv4(data);
    
    // 如果提取到的 IP 为空，使用备用列表
    const result = ips.length > 0 ? ips.join('\n') : FALLBACK_IPS.join('\n');
    
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(result);
  } catch (error) {
    // 任何错误都返回备用列表，确保不抛出 500
    console.error('Request failed, using fallback:', error.message);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(FALLBACK_IPS.join('\n'));
  }
};

function fetchData(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    let finished = false;
    const req = https.get(url, (response) => {
      // 处理重定向（如果有）
      if (response.statusCode === 301 || response.statusCode === 302) {
        const location = response.headers.location;
        if (!location) {
          if (!finished) { finished = true; reject(new Error('Redirect without location')); }
          return;
        }
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
      response.on('end', () => {
        if (!finished) { finished = true; resolve(raw); }
      });
      response.on('error', err => {
        if (!finished) { finished = true; reject(err); }
      });
    });

    req.on('error', err => {
      if (!finished) { finished = true; reject(err); }
    });

    req.setTimeout(timeoutMs, () => {
      if (!finished) {
        finished = true;
        req.destroy();
        reject(new Error('Timeout'));
      }
    });
  });
}

function extractIPv4(text) {
  if (!text) return [];
  const regex = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;
  const matches = text.match(regex) || [];
  // 过滤私有地址
  return matches.filter(ip => {
    const parts = ip.split('.').map(Number);
    if (parts.some(p => isNaN(p) || p < 0 || p > 255)) return false;
    if (parts[0] === 10 || parts[0] === 127) return false;
    if (parts[0] === 169 && parts[1] === 254) return false;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;
    if (parts[0] === 192 && parts[1] === 168) return false;
    return true;
  });
}    if (parts[0] === 192 && parts[1] === 168) return false;
    return true;
  });
}  const regex = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;
  const matches = text.match(regex) || [];
  // 简单过滤私有地址（仅基本过滤）
  return matches.filter(ip => {
    const parts = ip.split('.').map(Number);
    if (parts[0] === 10 || parts[0] === 127) return false;
    if (parts[0] === 169 && parts[1] === 254) return false;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;
    if (parts[0] === 192 && parts[1] === 168) return false;
    return true;
  });
}
