let cache = {
    data: null,
    timestamp: 0,
    ttl: 60000 // 1分钟缓存
};

const EMERGENCY_IPS = [
    '1.1.1.1',
    '1.0.0.1',
    '104.16.132.229',
    '104.16.133.229',
    '2606:4700:4700::1111',
    '2606:4700:4700::1001'
];

module.exports = async (req, res) => {
    try {
        const now = Date.now();

        // 1. 命中有效缓存
        if (cache.data && (now - cache.timestamp) < cache.ttl) {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('X-Cache', 'HIT');
            return res.end(cache.data);
        }

        const dataSources = [
            'https://ipdb.api.030101.xyz/?type=bestcf',
            'https://ip.164746.xyz/ipTop.html', 
            'https://stock.hostmonit.com/CloudFlareYes',
            //'https://stock.hostmonit.com/CloudFlareYesV6',
            'https://www.wetest.vip/page/cloudflare/address_v4.html',
            //'https://www.wetest.vip/page/cloudflare/address_v6.html',
            'https://api.urlce.com/cloudflare.html'
        ];

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
