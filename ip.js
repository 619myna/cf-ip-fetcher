const https = require('https');

module.exports = async (req, res) => {
  try {
    const url = 'https://ipdb.api.030101.xyz/?type=bestcf';
    const data = await fetchData(url);
    const ips = extractIPs(data);
    const result = ips.join('\n');

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(result);
  } catch (error) {
    console.error(error);
    res.statusCode = 500;
    res.end('Error: ' + error.message);
  }
};

function fetchData(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => resolve(raw));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

function extractIPs(text) {
  const regex = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;
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
