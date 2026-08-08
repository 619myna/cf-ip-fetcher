const https = require('https');

const cache = {
    data: null,
    timestamp: 0,
    ttl: 60000
};

// 简单、安全的IP提取（无回溯风险）
function extractIPs(text) {
    // IPv4：匹配任何点分数字（不验证范围，速度最快）
    const ipv4Regex = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g;
    // IPv6：匹配常见冒号格式（不含端口或括号）
    const ipv6Regex = /\b(?:[0-9a-fA-F]{1,4}:){1,7}[0-9a-fA-F]{1,4}\b|\b[0-9a-fA-F]{1,4}::[0-9a-fA-F]{1,4}\b|\b::[0-9a-fA-F]{1,4}\b|\b[0-9a-fA-F]{1,4}::\b|\b::\b/gi;

    const v4 = text.match(ipv4Regex) || [];
    const v6 = text.match(ipv6Regex) || [];
    return [...v4, ...v6];
}

function fetchData(url, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                // 简单重定向（只跟一次）
                return fetchData(res.headers.location, timeout).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
            }

            let data = '';
            let length = 0;
            const MAX_SIZE = 1024 * 1024; // 1MB 限制

            res.on('data', chunk => {
                length += chunk.length;
                if (length > MAX_SIZE) {
                    req.destroy();
                    reject(new Error('响应体过大'));
                    return;
                }
                data += chunk;
            });

            res.on('end', () => resolve(data));
            res.on('error', reject);
        });

        req.setTimeout(timeout, () => {
            req.destroy();
            reject(new Error('请求超时'));
        });
        req.on('error', reject);
    });
}

module.exports = async (req, res) => {
    try {
        const now = Date.now();
        // 缓存命中
        if (cache.data && (now - cache.timestamp) < cache.ttl) {
            console.log('缓存命中');
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('X-Cache', 'HIT');
            return res.end(cache.data);
        }

        const sources = [
            'https://ipdb.api.030101.xyz/?type=bestcf',
            'https://ip.164746.xyz/ipTop.html',
            'https://stock.hostmonit.com/CloudFlareYes',
            'https://stock.hostmonit.com/CloudFlareYesV6',
            'https://www.wetest.vip/page/cloudflare/address_v4.html',
            'https://www.wetest.vip/page/cloudflare/address_v6.html',
            'https://api.urlce.com/cloudflare.html'
        ];

        // 并行请求所有源（每个超时5秒）
        const results = await Promise.allSettled(sources.map(url => fetchData(url, 5000)));

        const allIPs = [];
        results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                const ips = extractIPs(result.value);
                allIPs.push(...ips);
                console.log(`源 ${index} 成功，提取 ${ips.length} 个IP`);
            } else {
                console.log(`源 ${index} 失败：${result.reason.message}`);
            }
        });

        // 去重、排序（不过滤任何IP）
        const unique = [...new Set(allIPs)].sort();
        const output = unique.join('\n');

        // 更新缓存
        cache.data = output;
        cache.timestamp = now;
        console.log(`总IP数：${unique.length}`);

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('X-Cache', 'MISS');
        res.end(output);
    } catch (error) {
        console.error('全局异常：', error);
        // 降级返回陈旧缓存
        if (cache.data) {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('X-Cache', 'HIT-FALLBACK');
            return res.end(cache.data);
        }
        res.status(500).end('Error: ' + error.message);
    }
};
