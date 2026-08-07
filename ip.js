const https = require('https');
const net = require('net');

// 缓存变量
let cache = {
    data: null,
    timestamp: 0,
    ttl: 60000 // 1分钟缓存，单位毫秒
};

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

        let allIPs = [];

        // 依次获取每个数据源
        for (const source of dataSources) {
            try {
                console.log(`正在获取: ${source}`);
                const data = await fetchData(source);
                const ips = extractIPs(data, source);
                allIPs = allIPs.concat(ips);
                console.log(`从 ${source} 获取到 ${ips.length} 个IP`);
            } catch (error) {
                console.log(`获取 ${source} 失败: ${error.message}`);
                // 继续尝试下一个数据源
                continue;
            }
        }

        // 去重并排序
        const uniqueIPs = [...new Set(allIPs)].sort();
        
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
        
        // 如果缓存有数据，即使出错也返回缓存数据
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

// 从不同数据源提取 IPv4 与 IPv6 地址
function extractIPs(data, source) {
    let rawCandidates = [];
    
    // 1. 尝试 JSON 格式提取
    if (source.includes('ipdb.api.030101.xyz') || source.includes('stock.hostmonit.com')) {
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
            // JSON 解析失败则回退到全局正则匹配
        }
    }

    // 2. 如果未从 JSON 结构化提取出数据，则通过正则提取全文本中的候选 IP
    if (rawCandidates.length === 0) {
        rawCandidates = matchAllIPs(data);
    }

    // 3. 过滤并保留公网 IPv4 / IPv6 地址
    return rawCandidates.filter(ip => isPublicIP(ip));
}

// 纯文本正则提取：采用无回溯风险的线性结构，避免 ReDoS 导致的 500 崩溃
function matchAllIPs(text) {
    const ips = [];
    
    // 1. IPv4 提取
    const ipv4Regex = /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g;
    const v4Matches = text.match(ipv4Regex);
    if (v4Matches) ips.push(...v4Matches);

    // 2. IPv6 安全提取正则（优先级：两头均有数据的压缩格式 > 8段全写 > 尾部压缩 > 头部压缩）
    const ipv6Regex = /(?:\b(?:[0-9a-fA-F]{1,4}:)+:(?:[0-9a-fA-F]{1,4}:)*[0-9a-fA-F]{1,4}\b|\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b|\b(?:[0-9a-fA-F]{1,4}:)+:\b|\b:(?::[0-9a-fA-F]{1,4})+\b)/g;
    const v6Matches = text.match(ipv6Regex);
    
    if (v6Matches) {
        for (const candidate of v6Matches) {
            // 通过 Node 原生 net 模块做 100% 精确校验
            if (net.isIP(candidate) === 6) {
                ips.push(candidate);
            }
        }
    }

    return ips;
}

// 检查是否为有效公网 IP (包含 IPv4 与 IPv6)
function isPublicIP(ip) {
    const ipType = net.isIP(ip);

    // IPv4 公网判断
    if (ipType === 4) {
        const parts = ip.split('.').map(Number);
        if (parts[0] === 0) return false;
        if (parts[0] === 10) return false;
        if (parts[0] === 127) return false;
        if (parts[0] === 169 && parts[1] === 254) return false;
        if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;
        if (parts[0] === 192 && parts[1] === 168) return false;
        return true;
    }

    // IPv6 公网判断
    if (ipType === 6) {
        const lower = ip.toLowerCase();
        // 排除环回与未指定地址 (::, ::1)
        if (lower === '::' || lower === '::1') return false;
        // 排除链路本地地址 (fe80::/10)
        if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return false;
        // 排除唯一本地私网地址 (fc00::/7)
        if (lower.startsWith('fc') || lower.startsWith('fd')) return false;
        return true;
    }

    return false;
}

        let allIPs = [];

        // 依次获取每个数据源
        for (const source of dataSources) {
            try {
                console.log(`正在获取: ${source}`);
                const data = await fetchData(source);
                const ips = extractIPs(data, source);
                allIPs = allIPs.concat(ips);
                console.log(`从 ${source} 获取到 ${ips.length} 个IP`);
            } catch (error) {
                console.log(`获取 ${source} 失败: ${error.message}`);
                // 继续尝试下一个数据源
                continue;
            }
        }

        // 去重并排序
        const uniqueIPs = [...new Set(allIPs)].sort();
        
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
        
        // 如果缓存有数据，即使出错也返回缓存数据
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

// 从不同数据源提取 IPv4 与 IPv6 地址
function extractIPs(data, source) {
    let rawCandidates = [];
    
    // 1. 尝试 JSON 格式提取
    if (source.includes('ipdb.api.030101.xyz') || source.includes('stock.hostmonit.com')) {
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
            // JSON 解析失败则回退到全局正则匹配
        }
    }

    // 2. 如果未从 JSON 结构化提取出数据，则通过正则提取全文本中的候选 IP
    if (rawCandidates.length === 0) {
        rawCandidates = matchAllIPs(data);
    }

    // 3. 过滤并保留公网 IPv4 / IPv6 地址
    return rawCandidates.filter(ip => isPublicIP(ip));
}

// 纯文本正则提取文本中的所有 IPv4 / IPv6 字符串
function matchAllIPs(text) {
    const ips = [];
    
    // 1. IPv4 正则
    const ipv4Regex = /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g;
    const v4Matches = text.match(ipv4Regex);
    if (v4Matches) ips.push(...v4Matches);

    // 2. 修正后的 IPv6 纯文本正则（优先匹配带后半段的压缩格式，避免截断）
    const ipv6Regex = /(?:[0-9a-fA-F]{1,4}:){1,7}(?::[0-9a-fA-F]{1,4}){1,7}|(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,7}:|:(?::[0-9a-fA-F]{1,4}){1,7}|::/g;
    const v6Matches = text.match(ipv6Regex);
    
    if (v6Matches) {
        for (const candidate of v6Matches) {
            // 二次校验，防止正则误匹配并剔除无效 IP
            if (net.isIP(candidate) === 6) {
                ips.push(candidate);
            }
        }
    }

    return ips;
}

// 检查是否为有效公网 IP (包含 IPv4 与 IPv6)
function isPublicIP(ip) {
    const ipType = net.isIP(ip);

    // IPv4 公网判断
    if (ipType === 4) {
        const parts = ip.split('.').map(Number);
        if (parts[0] === 0) return false;
        if (parts[0] === 10) return false;
        if (parts[0] === 127) return false;
        if (parts[0] === 169 && parts[1] === 254) return false;
        if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;
        if (parts[0] === 192 && parts[1] === 168) return false;
        return true;
    }

    // IPv6 公网判断
    if (ipType === 6) {
        const lower = ip.toLowerCase();
        // 排除环回与未指定地址 (::, ::1)
        if (lower === '::' || lower === '::1') return false;
        // 排除链路本地地址 (fe80::/10)
        if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return false;
        // 排除唯一本地私网地址 (fc00::/7)
        if (lower.startsWith('fc') || lower.startsWith('fd')) return false;
        return true;
    }

    return false;
}

        let allIPs = [];

        // 依次获取每个数据源
        for (const source of dataSources) {
            try {
                console.log(`正在获取: ${source}`);
                const data = await fetchData(source);
                const ips = extractIPs(data, source);
                allIPs = allIPs.concat(ips);
                console.log(`从 ${source} 获取到 ${ips.length} 个IP`);
            } catch (error) {
                console.log(`获取 ${source} 失败: ${error.message}`);
                // 继续尝试下一个数据源
                continue;
            }
        }

        // 去重并排序
        const uniqueIPs = [...new Set(allIPs)].sort();
        
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
        
        // 如果缓存有数据，即使出错也返回缓存数据
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

// 从不同数据源提取 IP 地址
function extractIPs(data, source) {
    let rawCandidates = [];
    
    // 1. JSON 格式提取
    if (source.includes('ipdb.api.030101.xyz') || source.includes('stock.hostmonit.com')) {
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
            // 解析失败时降级回全文本提取
        }
    }

    // 2. 通用提取候选 IP
    if (rawCandidates.length === 0) {
        rawCandidates = matchAllIPs(data);
    }

    // 3. 校验并过滤公网 IP
    return rawCandidates.filter(ip => isPublicIP(ip));
}

// 提取文本中所有 IPv4 与 IPv6（无兼容性漏洞、无缩写截断问题）
function matchAllIPs(text) {
    const ips = [];
    
    // 1. IPv4 提取
    const ipv4Regex = /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g;
    const v4Matches = text.match(ipv4Regex);
    if (v4Matches) ips.push(...v4Matches);

    // 2. IPv6 提取：粗粒度匹配连续的十六进制与冒号块，不被 :: 截断
    const rawTokens = text.match(/[0-9a-fA-F:]+/g);
    if (rawTokens) {
        for (let token of rawTokens) {
            // 快速过滤：必须包含冒号且长度符合标准 IPv6 范围 (3~39 字符)
            if (!token.includes(':') || token.length < 3 || token.length > 39) continue;

            // 清理开头/结尾因文本粘连留下的单冒号（保留合法的双冒号 ::）
            if (token.startsWith(':') && !token.startsWith('::')) {
                token = token.slice(1);
            }
            if (token.endsWith(':') && !token.endsWith('::')) {
                token = token.slice(0, -1);
            }

            // 使用 Node.js 原生 net 模块做准确判断
            if (net.isIP(token) === 6) {
                ips.push(token);
            }
        }
    }

    return ips;
}

// 检查是否为有效公网 IP
function isPublicIP(ip) {
    const ipType = net.isIP(ip);

    // IPv4 公网判断
    if (ipType === 4) {
        const parts = ip.split('.').map(Number);
        if (parts[0] === 0 || parts[0] === 10 || parts[0] === 127) return false;
        if (parts[0] === 169 && parts[1] === 254) return false;
        if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;
        if (parts[0] === 192 && parts[1] === 168) return false;
        return true;
    }

    // IPv6 公网判断
    if (ipType === 6) {
        const lower = ip.toLowerCase();
        if (lower === '::' || lower === '::1') return false;
        if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return false;
        if (lower.startsWith('fc') || lower.startsWith('fd')) return false;
        return true;
    }

    return false;
}

        let allIPs = [];

        // 依次获取每个数据源
        for (const source of dataSources) {
            try {
                console.log(`正在获取: ${source}`);
                const data = await fetchData(source);
                const ips = extractIPs(data, source);
                allIPs = allIPs.concat(ips);
                console.log(`从 ${source} 获取到 ${ips.length} 个IP`);
            } catch (error) {
                console.log(`获取 ${source} 失败: ${error.message}`);
                // 继续尝试下一个数据源
                continue;
            }
        }

        // 去重并排序
        const uniqueIPs = [...new Set(allIPs)].sort();
        
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
        
        // 如果缓存有数据，即使出错也返回缓存数据
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

// 从不同数据源提取 IPv4 与 IPv6 地址
function extractIPs(data, source) {
    let rawCandidates = [];
    
    // 1. 优先尝试 JSON 格式提取
    if (source.includes('ipdb.api.030101.xyz') || source.includes('stock.hostmonit.com')) {
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
            // 解析失败则自动回退到全文本提取
        }
    }

    // 2. 如果未从 JSON 结构化提取出数据，则对全文本进行提取
    if (rawCandidates.length === 0) {
        rawCandidates = matchAllIPs(data);
    }

    // 3. 过滤并仅保留公网 IPv4 / IPv6 地址
    return rawCandidates.filter(ip => isPublicIP(ip));
}

// 提取文本中的所有 IPv4 / IPv6 字符串
function matchAllIPs(text) {
    const ips = [];
    
    // 1. 提取 IPv4 地址
    const ipv4Regex = /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g;
    const v4Matches = text.match(ipv4Regex);
    if (v4Matches) ips.push(...v4Matches);

    // 2. 提取 IPv6 地址：按照非 IP 字符切分为 Token，再由 Node 原生 net.isIP 校验
    const tokens = text.split(/[^0-9a-fA-F:]+/);
    for (let token of tokens) {
        if (!token) continue;
        
        // 清理因 JSON 或 HTML 语法在边缘可能带有的单冒号 (但保留合法的双冒号 :: 语法)
        if (token.startsWith(':') && !token.startsWith('::')) {
            token = token.slice(1);
        }
        if (token.endsWith(':') && !token.endsWith('::')) {
            token = token.slice(0, -1);
        }

        // 使用 Node 原生 net 模块做 100% 精确判断
        if (net.isIP(token) === 6) {
            ips.push(token);
        }
    }

    return ips;
}

// 检查是否为有效公网 IP (包含 IPv4 与 IPv6)
function isPublicIP(ip) {
    const ipType = net.isIP(ip);

    // IPv4 公网判断
    if (ipType === 4) {
        const parts = ip.split('.').map(Number);
        if (parts[0] === 0) return false;
        if (parts[0] === 10) return false;
        if (parts[0] === 127) return false;
        if (parts[0] === 169 && parts[1] === 254) return false;
        if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;
        if (parts[0] === 192 && parts[1] === 168) return false;
        return true;
    }

    // IPv6 公网判断
    if (ipType === 6) {
        const lower = ip.toLowerCase();
        // 排除环回与未指定地址 (::, ::1)
        if (lower === '::' || lower === '::1') return false;
        // 排除链路本地地址 (fe80::/10)
        if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return false;
        // 排除唯一本地私网地址 (fc00::/7)
        if (lower.startsWith('fc') || lower.startsWith('fd')) return false;
        return true;
    }

    return false;
}

        let allIPs = [];

        // 依次获取每个数据源
        for (const source of dataSources) {
            try {
                console.log(`正在获取: ${source}`);
                const data = await fetchData(source);
                const ips = extractIPs(data, source);
                allIPs = allIPs.concat(ips);
                console.log(`从 ${source} 获取到 ${ips.length} 个IP`);
            } catch (error) {
                console.log(`获取 ${source} 失败: ${error.message}`);
                // 继续尝试下一个数据源
                continue;
            }
        }

        // 去重并排序
        const uniqueIPs = [...new Set(allIPs)].sort();
        
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
        
        // 如果缓存有数据，即使出错也返回缓存数据
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

// 从不同数据源提取 IPv4 与 IPv6 地址
function extractIPs(data, source) {
    let rawCandidates = [];
    
    // 1. 尝试 JSON 格式提取
    if (source.includes('ipdb.api.030101.xyz') || source.includes('stock.hostmonit.com')) {
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
            // JSON 解析失败则回退到全局正则匹配
        }
    }

    // 2. 如果未从 JSON 结构化提取出数据，则通过正则提取全文本中的候选 IP
    if (rawCandidates.length === 0) {
        rawCandidates = matchAllIPs(data);
    }

    // 3. 过滤并保留公网 IPv4 / IPv6 地址
    return rawCandidates.filter(ip => isPublicIP(ip));
}

// 正则提取文本中的所有 IPv4 / IPv6 字符串
function matchAllIPs(text) {
    const ips = [];
    
    // IPv4 正则
    const ipv4Regex = /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g;
    const v4Matches = text.match(ipv4Regex);
    if (v4Matches) ips.push(...v4Matches);

    // IPv6 正则（匹配全写与压缩简写形式）
    const ipv6Regex = /(?:(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,7}:|(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}|(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}|(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}|(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:(?:(?::[0-9a-fA-F]{1,4}){1,6})|:(?:(?::[0-9a-fA-F]{1,4}){1,7}|:))/g;
    const v6Matches = text.match(ipv6Regex);
    if (v6Matches) ips.push(...v6Matches);

    return ips;
}

// 检查是否为有效公网 IP (包含 IPv4 与 IPv6)
function isPublicIP(ip) {
    const ipType = net.isIP(ip);

    // IPv4 公网判断
    if (ipType === 4) {
        const parts = ip.split('.').map(Number);
        if (parts[0] === 0) return false;
        if (parts[0] === 10) return false;
        if (parts[0] === 127) return false;
        if (parts[0] === 169 && parts[1] === 254) return false;
        if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;
        if (parts[0] === 192 && parts[1] === 168) return false;
        return true;
    }

    // IPv6 公网判断
    if (ipType === 6) {
        const lower = ip.toLowerCase();
        // 排除环回与未指定地址 (::, ::1)
        if (lower === '::' || lower === '::1') return false;
        // 排除链路本地地址 (fe80::/10)
        if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return false;
        // 排除唯一本地私网地址 (fc00::/7)
        if (lower.startsWith('fc') || lower.startsWith('fd')) return false;
        return true;
    }

    return false;
}
