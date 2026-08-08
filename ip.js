const https = require('https');
// 缓存变量
let cache = {
    data: null,
    timestamp: 0,
    ttl: 60000 // 1分钟缓存，单位毫秒
};

// 预编译正则（全局只创建一次，高效）
// IPv4正则
const ipv4Regex = /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g;
// 高效IPv6正则，匹配标准+压缩::格式，严格符合RFC4291
const ipv6Regex = /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,7}:|(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}|(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}|(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}|(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:(?::[0-9a-fA-F]{1,4}){1,6}|:(?::[0-9a-fA-F]{1,4}){1,7}|::(?:[0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4}\b/g;

module.exports = async (req, res) => {
    try {
        // 检查缓存是否有效
        const now = Date.now();
        if (cache.data && (now - cache.timestamp) < cache.ttl) {
            console.log('返回缓存数据');
            // 设置响应头
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('X-Cache', 'HIT');
            res.setHeader('X-Cache-Expire', new Date(cache.timestamp + cache.ttl).toISOString());
            
            // 返回缓存数据
            return res.end(cache.data);
        }
        // 修复原代码缺失逗号语法错误
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
        // 依次获取每个数据源
        for (const source of dataSources) {
            try {
                console.log(`正在获取: ${source}`);
                const data = await fetchData(source);
                const ips = extractIPs(data, source);
                allIPs = allIPs.concat(ips);
                console.log(`从 ${source} 获取到 ${ips.length} 个IP(v4+v6)`);
            } catch (error) {
                console.log(`获取 ${source} 失败: ${error.message}`);
                // 继续尝试下一个数据源
                continue;
            }
        }
        // 去重并排序
        const uniqueIPs = [...new Set(allIPs)].sort((a, b) => {
            // IPv4排前面，IPv6排后面；同类型字典序排序
            const isAIPv4 = a.includes('.');
            const isBIPv4 = b.includes('.');
            if (isAIPv4 && !isBIPv4) return -1;
            if (!isAIPv4 && isBIPv4) return 1;
            return a.localeCompare(b);
        });
        
        // 格式化为文本
        const resultText = uniqueIPs.join('\n');
        
        // 更新缓存
        cache.data = resultText;
        cache.timestamp = now;
        
        console.log(`获取完成，共 ${uniqueIPs.length} 个唯一IP，缓存已更新`);
        // 设置响应头
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('X-Cache', 'MISS');
        res.setHeader('X-Cache-Expire', new Date(now + cache.ttl).toISOString());
        
        // 返回IP列表
        res.end(resultText);
        
    } catch (error) {
        console.error('全局错误:', error);
        
        // 如果缓存有数据，即使出错也返回缓存数据作为降级方案
        if (cache.data) {
            console.log('发生错误，返回缓存数据作为降级方案');
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('X-Cache', 'HIT-FALLBACK');
            res.setHeader('X-Cache-Expire', new Date(cache.timestamp + cache.ttl).toISOString());
            return res.end(cache.data);
        }
        
        res.status(500).end('Error: ' + error.message);
    }
};

// 获取数据函数
function fetchData(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, (response) => {
            // 处理重定向
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
        
        // 设置超时（10秒）
        req.setTimeout(10000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
    });
}

// 从不同数据源提取IPv4 + IPv6地址
function extractIPs(data, source) {
    const ips = [];

    // 根据数据源进行不同的处理
    if (source.includes('ipdb.api.030101.xyz')) {
        // JSON格式处理
        try {
            const jsonData = JSON.parse(data);
            if (jsonData && Array.isArray(jsonData.data)) {
                jsonData.data.forEach(item => {
                    if (item.ip && typeof item.ip === 'string') {
                        // 同时匹配v4 v6
                        const v4Match = item.ip.match(ipv4Regex);
                        const v6Match = item.ip.match(ipv6Regex);
                        v4Match && ips.push(...v4Match);
                        v6Match && ips.push(...v6Match);
                    }
                });
            }
        } catch (e) {
            // JSON解析失败，全局文本提取
            const v4 = data.match(ipv4Regex);
            const v6 = data.match(ipv6Regex);
            v4 && ips.push(...v4);
            v6 && ips.push(...v6);
        }
    }
    else if (source.includes('stock.hostmonit.com')) {
        // JSON格式处理
        try {
            const jsonData = JSON.parse(data);
            if (jsonData && Array.isArray(jsonData.info)) {
                jsonData.info.forEach(item => {
                    if (item.ip && typeof item.ip === 'string') {
                        const v4Match = item.ip.match(ipv4Regex);
                        const v6Match = item.ip.match(ipv6Regex);
                        v4Match && ips.push(...v4Match);
                        v6Match && ips.push(...v6Match);
                    }
                });
            }
        } catch (e) {
            const v4 = data.match(ipv4Regex);
            const v6 = data.match(ipv6Regex);
            v4 && ips.push(...v4);
            v6 && ips.push(...v6);
        }
    }
    else if (source.includes('wetest.vip')) {
        // HTML表格处理，匹配<td>内v4/v6
        const tableV4 = data.match(/<td[^>]*>(\d+\.\d+\.\d+\.\d+)<\/td>/g);
        const tableV6 = data.match(/<td[^>]*>([0-9a-fA-F:]+)<\/td>/g);
        if (tableV4) {
            tableV4.forEach(td => {
                const match = td.match(ipv4Regex);
                match && ips.push(...match);
            });
        }
        if (tableV6) {
            tableV6.forEach(td => {
                const match = td.match(ipv6Regex);
                match && ips.push(...match);
            });
        }
        // 兜底全局提取
        const v4All = data.match(ipv4Regex);
        const v6All = data.match(ipv6Regex);
        v4All && ips.push(...v4All);
        v6All && ips.push(...v6All);
    }
    else {
        // 通用处理：全文同时提取IPv4、IPv6
        const v4Matches = data.match(ipv4Regex);
        const v6Matches = data.match(ipv6Regex);
        v4Matches && ips.push(...v4Matches);
        v6Matches && ips.push(...v6Matches);
    }
    
    // 过滤有效的公网IP（剔除内网、本地、链路地址）
    return ips.filter(ip => {
        // IPv4过滤逻辑不变
        if (ip.includes('.')) {
            const parts = ip.split('.');
            if (parts[0] === '0') return false;
            if (parts[0] === '10') return false;
            if (parts[0] === '127') return false;
            if (parts[0] === '169' && parts[1] === '254') return false;
            if (parts[0] === '172' && parseInt(parts[1]) >= 16 && parseInt(parts[1]) <= 31) return false;
            if (parts[0] === '192' && parts[1] === '168') return false;
            return true;
        } 
        // IPv6过滤规则
        else {
            // 转小写统一判断
            const lowerIp = ip.toLowerCase();
            // ::1 回环地址
            if (lowerIp.startsWith('::1')) return false;
            // fe80::/10 链路本地地址
            if (lowerIp.startsWith('fe80:')) return false;
            // fc00::/7 唯一本地ULA私有地址
            if (lowerIp.startsWith('fc') || lowerIp.startsWith('fd')) return false;
            // ff00::/8 组播地址
            if (lowerIp.startsWith('ff')) return false;
            // ::/96 IPv4映射v6，无实际公网意义
            if (lowerIp.startsWith('::ffff:')) return false;
            return true;
        }
    });
}
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
