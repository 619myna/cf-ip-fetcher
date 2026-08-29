// 使用 Node.js 18+ 内置 fetch
module.exports = async (req, res) => {
  try {
    const url = 'https://ipdb.api.030101.xyz/?type=bestcf';
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000) // 5秒超时
    });
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    
    const ips = extractIPv4(text);
    const result = ips.join('\n') || 'No IPs found';

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(result);
  } catch (error) {
    console.error(error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Error: ' + error.message);
  }
};

function extractIPv4(text) {
  // 简单匹配所有 IPv4
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
