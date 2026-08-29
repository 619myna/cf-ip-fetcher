let cache = {
    data: null,
    timestamp: 0,
    ttl: 60000
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
            'https://stock.hostmonit.com/CloudFlareYesV6',
            'https://www.wetest.vip/page/cloudflare/address_v4.html',
            'https://www.wetest.vip/page/cloudflare/address_v6.html',
            'https://api.urlce.com/cloudflare.html'
        ];

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

        let uniqueIPs = Array.from(new Set(allIPs)).sort((a, b) => {
            const aV4 = a.includes(".");
            const bV4 = b.includes(".");
            if (aV4 && !bV4) return -1;
            if (!aV4 && bV4) return 1;
            return a.localeCompare(b);
        });

        let cacheStatus = 'MISS';

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
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Access-Control-Allow-Origin', '*');
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
        if (parts.s            'https://www.wetest.vip/page/cloudflare/address_v6.html',
            'https://api.urlce.com/cloudflare.html'
        ];

        // 2. 并发安全请求（硬超时 3.0 秒）
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

        // 3. 去重与排序
        let uniqueIPs = Array.from(new Set(allIPs)).sort((a, b) => {
            const aV4 = a.includes(".");
            const bV4 = b.includes(".");
            if (aV4 && !bV4) return -1;
            if (!aV4 && bV4) return 1;
            return a.localeCompare(b);
        });

        let cacheStatus = 'MISS';

        // 4. 多级降级策略
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
        // 兜底保活机制
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.end(cache.data || EMERGENCY_IPS.join('\n'));
    }
}

// 纯 Native fetch 方法
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

// 零 Node 原生模块依赖的 IP 提取器
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

// 纯 JS 实现的 IP 校验（无需 net 模块）
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
        // 数据源列表
        const dataSources = [
            'https://ipdb.api.030101.xyz/?type=bestcf',
            'https://ip.164746.xyz/ipTop.html', 
            'https://stock.hostmonit.com/CloudFlareYes',
            'https://stock.hostmonit.com/CloudFlareYesV6',
            'https://www.wetest.vip/page/cloudflare/address_v4.html',
            'https://www.wetest.vip/page/cloudflare/address_v6.html',
            'https://api.urlce.com/cloudflare.html'
        ];

        // 2. 并发安全请求，每个数据源 3.0 秒硬超时限制
        const fetchPromises = dataSources.map(source => 
            safeHttpsFetch(source, 3000)
                .then(data => ({ source, data }))
                .catch(() => ({ source, data: '' }))
        );

        const results = await Promise.all(fetchPromises);
        let allIPs = [];

        results.forEach(result => {
            if (result.data) {
                const ips = extractIPs(result.data, result.source);
                // 使用 safe push 方式防栈溢出
                for (let i = 0; i < ips.length; i++) {
                    allIPs.push(ips[i]);
                }
            }
        });

        // 3. 去重与排序（IPv4 排前，IPv6 排后，内部字典序）
        let uniqueIPs = Array.from(new Set(allIPs)).sort((a, b) => {
            const aV4 = a.includes(".");
            const bV4 = b.includes(".");
            if (aV4 && !bV4) return -1;
            if (!aV4 && bV4) return 1;
            return a.localeCompare(b);
        });

        let cacheStatus = 'MISS';

        // 4. 数据容灾多级降级策略
        if (uniqueIPs.length === 0) {
            if (cache.data) {
                // 第一级降级：使用旧缓存
                res.statusCode = 200;
                res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('X-Cache', 'HIT-FALLBACK');
                return res.end(cache.data);
            } else {
                // 第二级降级：使用应急保活 IP 列表，防止 500 崩溃
                uniqueIPs = EMERGENCY_FALLBACK_IPS;
                cacheStatus = 'EMERGENCY-FALLBACK';
            }
        }

        const resultText = uniqueIPs.join('\n');
        
        // 更新缓存（非应急数据才写入缓存）
        if (cacheStatus !== 'EMERGENCY-FALLBACK') {
            cache.data = resultText;
            cache.timestamp = now;
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('X-Cache', cacheStatus);
        res.setHeader('X-Cache-Expire', new Date(now + cache.ttl).toISOString());
        return res.end(resultText);

    } catch (globalError) {
        console.error('Fatal Handler Error:', globalError);
        
        // 最终兜底拦截，绝不向 Vercel 抛出错误
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('X-Cache', 'FATAL-RECOVERY');
        return res.end(cache.data || EMERGENCY_FALLBACK_IPS.join('\n'));
    }
};

/**
 * 零崩溃 HTTP/HTTPS 请求器（带超时重定向与 5MB 体积保护）
 */
function safeHttpsFetch(urlStr, timeoutMs = 3000, maxRedirects = 2) {
    return new Promise((resolve) => {
        if (maxRedirects < 0) return resolve('');
        
        try {
            const parsedUrl = new URL(urlStr);
            const client = parsedUrl.protocol === 'https:' ? https : http;
            
            const req = client.get(urlStr, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Serverless/1.0',
                    'Accept': 'text/html,application/json,text/plain'
                }
            }, (res) => {
                // 处理重定向
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    try {
                        const redirectUrl = new URL(res.headers.location, urlStr).toString();
                        return safeHttpsFetch(redirectUrl, timeoutMs, maxRedirects - 1).then(resolve);
                    } catch (e) {
                        return resolve('');
                    }
                }

                if (res.statusCode !== 200) {
                    res.resume();
                    return resolve('');
                }

                let data = '';
                res.setEncoding('utf8');
                res.on('data', chunk => {
                    data += chunk;
                    // 超过 5MB 强制截断防内存溢出
                    if (data.length > 5 * 1024 * 1024) {
                        req.destroy();
                        resolve(data);
                    }
                });
                res.on('end', () => resolve(data));
            });

            req.on('error', () => resolve(''));
            req.setTimeout(timeoutMs, () => {
                req.destroy();
                resolve('');
            });
        } catch (e) {
            resolve('');
        }
    });
}

/**
 * 100% 线性时间 ReDoS 提取函数
 */
function extractIPs(data, source) {
    if (!data || typeof data !== 'string') return [];
    
    const candidates = [];

    // 1. 结构化 JSON 解析适配
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

    // 2. 无回溯 O(N) 正则扫描：提取所有长度 3-45 的 hex/dot/colon 连续字符串
    const matches = data.match(/[0-9a-fA-F.:]{3,45}/g);
    if (matches) {
        for (let i = 0; i < matches.length; i++) {
            const str = matches[i];
            // 排除无 '.' 和 ':' 的普通十六进制字符串
            if (str.includes('.') || str.includes(':')) {
                const cleaned = str.replace(/^[.:]+|[.:]+$/g, '');
                if (cleaned.length >= 3) {
                    candidates.push(cleaned);
                }
            }
        }
    }

    // 3. Node.js 底层 isIP 严格校验与私有地址过滤
    return candidates.filter(ip => isPublicIP(ip));
}

/**
 * 公网 IP 校验 (Node.js 原生 net.isIP)
 */
function isPublicIP(ip) {
    const ipType = net.isIP(ip);

    if (ipType === 4) {
        const parts = ip.split('.').map(Number);
        if (parts[0] === 0 || parts[0] === 10 || parts[0] === 127) return false;
        if (parts[0] === 169 && parts[1] === 254) return false;
        if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;
        if (parts[0] === 192 && parts[1] === 168) return false;
        return true;
    }

    if (ipType === 6) {
        const lower = ip.toLowerCase();
        if (lower === '::' || lower === '::1') return false;
        if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return false;
        if (lower.startsWith('fc') || lower.startsWith('fd')) return false;
        return true;
    }

    return false;
}

/**
 * 完整保留源码备用 fetchData 函数
 */
function fetchData(url) {
    return safeHttpsFetch(url, 10000);
}
        const fetchPromises = dataSources.map(source => 
            safeFetch(source, 3500)
                .then(data => ({ source, data }))
                .catch(() => ({ source, data: null }))
        );

        const results = await Promise.all(fetchPromises);
        let allIPs = [];

        results.forEach(result => {
            if (result.data) {
                const ips = extractIPs(result.data, result.source);
                allIPs.push(...ips);
                console.log(`从 ${result.source} 提取到 ${ips.length} 个有效 IP`);
            } else {
                console.log(`获取 ${result.source} 失败或超时`);
            }
        });

        // 3. 去重与双栈排序（IPv4 排前，IPv6 排后，字典序）
        const uniqueIPs = Array.from(new Set(allIPs)).sort((a, b) => {
            const aV4 = a.includes(".");
            const bV4 = b.includes(".");
            if (aV4 && !bV4) return -1;
            if (!aV4 && bV4) return 1;
            return a.localeCompare(b);
        });
        
        if (uniqueIPs.length === 0) {
            throw new Error('未获取到任何有效 IP');
        }

        const resultText = uniqueIPs.join('\n');
        
        // 更新缓存
        cache.data = resultText;
        cache.timestamp = now;
        
        console.log(`获取完成，共 ${uniqueIPs.length} 个唯一IP，缓存已更新`);

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('X-Cache', 'MISS');
        res.setHeader('X-Cache-Expire', new Date(now + cache.ttl).toISOString());
        return res.end(resultText);
        
    } catch (error) {
        console.error('全局错误:', error.message || error);
        
        // 4. 降级方案：有旧缓存则返回旧缓存
        if (cache.data) {
            console.log('发生错误，返回缓存数据作为降级方案');
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('X-Cache', 'HIT-FALLBACK');
            res.setHeader('X-Cache-Expire', new Date(cache.timestamp + cache.ttl).toISOString());
            return res.end(cache.data);
        }
        
        // 关键修复：使用原生 Node.js HTTP 状态码赋值，彻底解决 res.status 不存在引发的云函数崩溃
        res.statusCode = 500;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.end('Error: ' + (error.message || 'Internal Server Error'));
    }
};

/**
 * 高兼容性 Fetch 请求函数（带超时中止控制）
 */
async function safeFetch(url, timeoutMs = 3500) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0 (Vercel Serverless Agent)' }
        });
        clearTimeout(timer);
        if (!response.ok) return null;
        return await response.text();
    } catch (e) {
        clearTimeout(timer);
        return null;
    }
}

/**
 * 高性能零 ReDoS 提取函数（支持特征筛查，防 CPU / 内存超限）
 */
function extractIPs(data, source) {
    if (!data || typeof data !== 'string') return [];
    
    let rawCandidates = [];
    
    // 1. JSON 数据源快速结构化提取
    if (source && (source.includes('ipdb.api.030101.xyz') || source.includes('stock.hostmonit.com'))) {
        try {
            const jsonData = JSON.parse(data);
            const list = jsonData.data || jsonData.info || [];
            if (Array.isArray(list)) {
                list.forEach(item => {
                    if (item && typeof item.ip === 'string') {
                        rawCandidates.push(item.ip.trim());
                    }
                });
            }
        } catch (e) {}
    }

    // 2. HTML 表格特征抽取 (wetest.vip)
    if (source && source.includes('wetest.vip')) {
        const tdMatches = data.match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
        if (tdMatches) {
            tdMatches.forEach(td => {
                const text = td.replace(/<[^>]+>/g, '').trim();
                if (text.includes('.') || text.includes(':')) {
                    rawCandidates.push(text);
                }
            });
        }
    }

    // 3. 安全高效分词：过滤无效词组（仅处理包含 '.' 或 ':' 且长度在 2-39 的字符串，避开数十万无效 HTML 标签）
    const tokens = data.split(/[^0-9a-fA-F.:]+/);
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (token.length >= 2 && token.length <= 39 && (token.includes('.') || token.includes(':'))) {
            const cleaned = token.replace(/^[.:]+|[.:]+$/g, '');
            if (cleaned.length >= 2) {
                rawCandidates.push(cleaned);
            }
        }
    }

    // 4. Node 原生 C++ 底层 isIP 校验与私有地址过滤
    return rawCandidates.filter(ip => isPublicIP(ip));
}

/**
 * 检查是否为有效公网 IP (Node.js net.isIP)
 */
function isPublicIP(ip) {
    const ipType = net.isIP(ip);

    if (ipType === 4) {
        const parts = ip.split('.').map(Number);
        if (parts[0] === 0 || parts[0] === 10 || parts[0] === 127) return false;
        if (parts[0] === 169 && parts[1] === 254) return false;
        if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;
        if (parts[0] === 192 && parts[1] === 168) return false;
        return true;
    }

    if (ipType === 6) {
        const lower = ip.toLowerCase();
        if (lower === '::' || lower === '::1') return false;
        if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return false;
        if (lower.startsWith('fc') || lower.startsWith('fd')) return false;
        return true;
    }

    return false;
}

/**
 * 完整保留源码备用 fetchData 函数
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
