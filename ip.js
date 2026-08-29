const https = require('https');
const net = require('net');

// 全局内存缓存变量[span_1](start_span)[span_1](end_span)
let cache = {
    data: null,
    timestamp: 0,
    ttl: 60000 // 1分钟缓存，单位毫秒[span_2](start_span)[span_2](end_span)
};

module.exports = async (req, res) => {
    try {
        const now = Date.now();

        // 1. 检查缓存是否有效（命中缓存直接返回）[span_3](start_span)[span_3](end_span)
        if (cache.data && (now - cache.timestamp) < cache.ttl) {
            console.log('返回缓存数据');[span_4](start_span)[span_4](end_span)
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('X-Cache', 'HIT');
            res.setHeader('X-Cache-Expire', new Date(cache.timestamp + cache.ttl).toISOString());
            return res.end(cache.data);
        }

        // 2. 完整数据源列表（包含 IPv4 和 IPv6 链接）[span_5](start_span)[span_5](end_span)
        const dataSources = [
            'https://ipdb.api.030101.xyz/?type=bestcf',
            'https://ip.164746.xyz/ipTop.html', 
            'https://stock.hostmonit.com/CloudFlareYes',
            'https://stock.hostmonit.com/CloudFlareYesV6',
            'https://www.wetest.vip/page/cloudflare/address_v4.html',
            'https://www.wetest.vip/page/cloudflare/address_v6.html',
            'https://api.urlce.com/cloudflare.html'
        ];

        // 3. 并发请求所有数据源，设置 3.5 秒硬超时阻断，防 Vercel 10 秒超时崩溃[span_6](start_span)[span_6](end_span)
        const fetchPromises = dataSources.map(source => 
            safeFetch(source, 3500)
                .then(data => ({ source, data }))
                .catch(() => ({ source, data: null })) // 失败静默拦截，不影响全局[span_7](start_span)[span_7](end_span)
        );

        const results = await Promise.all(fetchPromises);
        let allIPs = [];

        results.forEach(result => {
            if (result.data) {
                const ips = extractIPs(result.data, result.source);
                allIPs = allIPs.concat(ips);
                console.log(`从 ${result.source} 提取到 ${ips.length} 个有效 IP`);
            } else {
                console.log(`获取 ${result.source} 失败或超时`);[span_8](start_span)[span_8](end_span)
            }
        });

        // 4. 去重与排序逻辑（IPv4 排前，IPv6 排后，内部按字母字典序）[span_9](start_span)[span_9](end_span)
        const uniqueIPs = [...new Set(allIPs)].sort((a, b) => {
            const aV4 = a.includes(".");
            const bV4 = b.includes(".");
            if (aV4 && !bV4) return -1;
            if (!aV4 && bV4) return 1;
            return a.localeCompare(b);
        });
        
        if (uniqueIPs.length === 0) {
            throw new Error('未获取到任何 IP');[span_10](start_span)[span_10](end_span)
        }

        const resultText = uniqueIPs.join('\n');
        
        // 更新缓存[span_11](start_span)[span_11](end_span)
        cache.data = resultText;
        cache.timestamp = now;
        
        console.log(`获取完成，共 ${uniqueIPs.length} 个唯一IP，缓存已更新`);[span_12](start_span)[span_12](end_span)

        // 设置响应头并返回数据[span_13](start_span)[span_13](end_span)
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('X-Cache', 'MISS');
        res.setHeader('X-Cache-Expire', new Date(now + cache.ttl).toISOString());
        return res.end(resultText);
        
    } catch (error) {
        console.error('全局错误:', error.message || error);[span_14](start_span)[span_14](end_span)
        
        // 5. 降级方案：若发生错误且存有旧缓存，返回过期的缓存[span_15](start_span)[span_15](end_span)
        if (cache.data) {
            console.log('发生错误，返回缓存数据作为降级方案');[span_16](start_span)[span_16](end_span)
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('X-Cache', 'HIT-FALLBACK');
            res.setHeader('X-Cache-Expire', new Date(cache.timestamp + cache.ttl).toISOString());
            return res.end(cache.data);
        }
        
        res.status(500).end('Error: ' + error.message);[span_17](start_span)[span_17](end_span)
    }
};

/**
 * 高效安全 Fetch 请求，支持强制超时中止[span_18](start_span)[span_18](end_span)
 */
async function safeFetch(url, timeoutMs = 3500) {
    try {
        const response = await fetch(url, {
            signal: AbortSignal.timeout(timeoutMs),
            headers: { 'User-Agent': 'Mozilla/5.0 (Vercel Serverless Agent)' }
        });
        if (!response.ok) return null;
        return await response.text();
    } catch (e) {
        return null; // 超时或失败静默返回 null，不阻塞主流程[span_19](start_span)[span_19](end_span)
    }
}

/**
 * IP 提取逻辑：融合 JSON 结构解析、表格抽取与 O(N) 分词提取，彻底根除 ReDoS 正则灾难性回溯漏洞[span_20](start_span)[span_20](end_span)
 */
function extractIPs(data, source) {
    if (!data || typeof data !== 'string') return [];
    
    let rawCandidates = [];
    
    // 1. 特殊适配 wetest HTML 表格处理[span_21](start_span)[span_21](end_span)
    if (source && source.includes('wetest.vip')) {
        const tableMatches = data.match(/<td[^>]*>([0-9\.\:]+)<\/td>/g);
        if (tableMatches) {
            tableMatches.forEach(td => {
                rawCandidates.push(td.replace(/<[^>]+>/g, '').trim());
            });
        }
    }
    
    // 2. 特殊适配 JSON 接口提取[span_22](start_span)[span_22](end_span)
    if (source && (source.includes('ipdb.api.030101.xyz') || source.includes('stock.hostmonit.com'))) {
        try {
            const jsonData = JSON.parse(data);
            const list = jsonData.data || jsonData.info || [];
            if (Array.isArray(list)) {
                list.forEach(item => {
                    if (item.ip && typeof item.ip === 'string') {
                        rawCandidates.push(item.ip.trim());
                    }
                });
            }
        } catch (e) {
            // JSON 解析失败则静默回退到通用分词提取[span_23](start_span)[span_23](end_span)
        }
    }

    // 3. 核心零 ReDoS 优化：按非 IP 字符切分为词组，严格线性 O(N) 扫描，绝无长文本耗尽 CPU 风险[span_24](start_span)[span_24](end_span)
    const tokens = data.split(/[^0-9a-fA-F.:]+/);
    for (let token of tokens) {
        const cleaned = token.replace(/^[.:]+|[.:]+$/g, '');
        if (cleaned) {
            rawCandidates.push(cleaned);
        }
    }

    // 4. 过滤并保留公网 IPv4 / IPv6 地址（底层使用 net.isIP 校验）[span_25](start_span)[span_25](end_span)
    return rawCandidates.filter(ip => isPublicIP(ip));
}

/**
 * 校验公网 IP (兼容 IPv4 与 IPv6，使用 Node.js 底层 net.isIP)[span_26](start_span)[span_26](end_span)
 */
function isPublicIP(ip) {
    const ipType = net.isIP(ip); // 返回 4、6 或 0[span_27](start_span)[span_27](end_span)

    // IPv4 公网判断[span_28](start_span)[span_28](end_span)
    if (ipType === 4) {
        const parts = ip.split('.').map(Number);
        if (parts[0] === 0 || parts[0] === 10 || parts[0] === 127) return false;[span_29](start_span)[span_29](end_span)
        if (parts[0] === 169 && parts[1] === 254) return false;[span_30](start_span)[span_30](end_span)
        if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;[span_31](start_span)[span_31](end_span)
        if (parts[0] === 192 && parts[1] === 168) return false;[span_32](start_span)[span_32](end_span)
        return true;
    }

    // IPv6 公网判断[span_33](start_span)[span_33](end_span)
    if (ipType === 6) {
        const lower = ip.toLowerCase();
        // 排除环回与未指定地址 (::, ::1)[span_34](start_span)[span_34](end_span)
        if (lower === '::' || lower === '::1') return false;[span_35](start_span)[span_35](end_span)
        // 排除链路本地地址 (fe80::/10)[span_36](start_span)[span_36](end_span)
        if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return false;[span_37](start_span)[span_37](end_span)
        // 排除唯一本地私网地址 (fc00::/7)[span_38](start_span)[span_38](end_span)
        if (lower.startsWith('fc') || lower.startsWith('fd')) return false;[span_39](start_span)[span_39](end_span)
        return true;
    }

    return false;
}

/**
 * 保留源码备用 fetchData 函数（兼容旧版原生 https 请求）[span_40](start_span)[span_40](end_span)
 */
function fetchData(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                const redirectUrl = response.headers.location;
                return fetchData(redirectUrl).then(resolve).catch(reject);
            }

            if (response.statusCode !== 200) {
                reject(new Error(`HTTP ${response.statusCode}`));
                return;
            }

            let rawData = '';
            response.on('data', (chunk) => rawData += chunk);
            response.on('end', () => resolve(rawData));
        }).on('error', reject);
        
        req.setTimeout(10000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
    });
}
