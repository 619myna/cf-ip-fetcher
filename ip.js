// 简单内存缓存
let cache = {
    data: null,
    timestamp: 0,
    ttl: 60000 // 1分钟
};

export default async function handler(req, res) {
    // 设置基础响应头
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');

    try {
        const now = Date.now();

        // 1. 命中缓存
        if (cache.data && (now - cache.timestamp) < cache.ttl) {
            res.setHeader('X-Cache', 'HIT');
            return res.status(200).send(cache.data);
        }

        const dataSources = [
            'https://ipdb.api.030101.xyz/?type=bestcf',
            'https://ip.164746.xyz/ipTop.html', 
            'https://stock.hostmonit.com/CloudFlareYes',
            'https://www.wetest.vip/page/cloudflare/address_v4.html',
            'https://api.urlce.com/cloudflare.html'
        ];

        // 2. 并发请求，设置 2.5 秒硬超时
        const fetchPromises = dataSources.map(async (source) => {
            const data = await safeFetch(source, 2500);
            return extractIPs(data, source);
        });

        const results = await Promise.all(fetchPromises);
        let allIPs = [];
        results.forEach(ips => {
            if (Array.isArray(ips)) {
                allIPs.push(...ips);
            }
        });

        // 3. 去重与排序
        const uniqueIPs = [...new Set(allIPs)].sort();

        if (uniqueIPs.length > 0) {
            const resultText = uniqueIPs.join('\n');
            cache.data = resultText;
            cache.timestamp = now;

            res.setHeader('X-Cache', 'MISS');
            return res.status(200).send(resultText);
        }

        // 降级策略：如果有旧缓存则返回旧缓存
        if (cache.data) {
            res.setHeader('X-Cache', 'HIT-FALLBACK');
            return res.status(200).send(cache.data);
        }

        return res.status(500).send('Error: Unable to fetch IPs from any source.');

    } catch (error) {
        // 兜底防护，绝不崩溃
        if (cache.data) {
            return res.status(200).send(cache.data);
        }
        return res.status(500).send('Server Internal Error');
    }
}

// 零崩溃安全请求函数
async function safeFetch(url, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            }
        });
        clearTimeout(timer);
        if (!response.ok) return '';
        return await response.text();
    } catch (e) {
        clearTimeout(timer);
        return ''; // 遇到网络错误、超时一律返回空，不抛错
    }
}

// 提取 IP 逻辑
function extractIPs(data, source) {
    if (!data) return [];
    const ips = [];
    const ipRegex = /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g;

    if (source.includes('ipdb.api.030101.xyz') || source.includes('stock.hostmonit.com')) {
        try {
            const jsonData = JSON.parse(data);
            const list = jsonData.data || jsonData.info || [];
            if (Array.isArray(list)) {
                list.forEach(item => {
                    if (item.ip && typeof item.ip === 'string') {
                        const match = item.ip.match(ipRegex);
                        if (match) ips.push(...match);
                    }
                });
            }
        } catch (e) {
            const matches = data.match(ipRegex);
            if (matches) ips.push(...matches);
        }
    } else {
        const matches = data.match(ipRegex);
        if (matches) ips.push(...matches);
    }

    return ips.filter(ip => {
        const parts = ip.split('.').map(Number);
        if (parts[0] === 0 || parts[0] === 10 || parts[0] === 127) return false;
        if (parts[0] === 169 && parts[1] === 254) return false;
        if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;
        if (parts[0] === 192 && parts[1] === 168) return false;
        return true;
    });
}

        let allIPs = [];
        results.forEach((result) => {
            if (result.status === 'fulfilled') {
                allIPs.push(...result.value);
            }
        });

        // 去重排序
        const uniqueIPs = [...new Set(allIPs)].sort();

        // 3. 结果处理
        if (uniqueIPs.length > 0) {
            const resultText = uniqueIPs.join('\n');
            cache.data = resultText;
            cache.timestamp = now;

            res.setHeader('X-Cache', 'MISS');
            res.setHeader('X-Cache-Expire', new Date(now + cache.ttl).toISOString());
            return res.end(resultText);
        }

        // 如果获取失败但有旧缓存，返回降级缓存
        if (cache.data) {
            res.setHeader('X-Cache', 'HIT-FALLBACK');
            return res.end(cache.data);
        }

        res.statusCode = 500;
        res.end('Error: Failed to fetch IPs from all sources');

    } catch (error) {
        console.error('Function Error:', error.message);
        if (cache.data) {
            res.setHeader('X-Cache', 'HIT-FALLBACK');
            return res.end(cache.data);
        }
        res.statusCode = 500;
        res.end('Server Error: ' + error.message);
    }
};

// 使用现代原生 fetch 请求数据
async function fetchData(url) {
    // 强制 2.5 秒硬超时，防止挂起 Vercel 进程
    const response = await fetch(url, {
        signal: AbortSignal.timeout(2500),
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    return await response.text();
}

// 提取 IP 逻辑
function extractIPs(data, source) {
    const ips = [];
    const ipRegex = /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g;

    if (source.includes('ipdb.api.030101.xyz') || source.includes('stock.hostmonit.com')) {
        try {
            const jsonData = JSON.parse(data);
            const list = jsonData.data || jsonData.info || [];
            if (Array.isArray(list)) {
                list.forEach(item => {
                    if (item.ip && typeof item.ip === 'string') {
                        const match = item.ip.match(ipRegex);
                        if (match) ips.push(...match);
                    }
                });
            }
        } catch (e) {
            const matches = data.match(ipRegex);
            if (matches) ips.push(...matches);
        }
    } else {
        const matches = data.match(ipRegex);
        if (matches) ips.push(...matches);
    }

    return ips.filter(ip => {
        const parts = ip.split('.').map(Number);
        if (parts[0] === 0 || parts[0] === 10 || parts[0] === 127) return false;
        if (parts[0] === 169 && parts[1] === 254) return false;
        if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;
        if (parts[0] === 192 && parts[1] === 168) return false;
        return true;
    });
}
        const results = await Promise.allSettled(
            dataSources.map(async (source) => {
                const data = await fetchData(source);
                return extractIPs(data, source);
            })
        );

        let allIPs = [];
        results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                console.log(`数据源 [${dataSources[index]}] 成功获取 ${result.value.length} 个 IP`);
                allIPs = allIPs.concat(result.value);
            } else {
                console.log(`数据源 [${dataSources[index]}] 失败: ${result.reason.message}`);
            }
        });

        // 3. 去重排序
        const uniqueIPs = [...new Set(allIPs)].sort();
        const resultText = uniqueIPs.join('\n');

        if (uniqueIPs.length > 0) {
            // 更新缓存
            cache.data = resultText;
            cache.timestamp = now;
            res.setHeader('X-Cache', 'MISS');
            res.setHeader('X-Cache-Expire', new Date(now + cache.ttl).toISOString());
            return res.end(resultText);
        } else {
            throw new Error('所有数据源均未获取到有效 IP');
        }

    } catch (error) {
        console.error('全局错误:', error.message);
        
        // 降级策略：返回过期的缓存（如果有的话）
        if (cache.data) {
            console.log('发生错误，返回过期的缓存数据');
            res.setHeader('X-Cache', 'HIT-FALLBACK');
            return res.end(cache.data);
        }
        
        // standard Node http response 方法
        res.statusCode = 500;
        res.end('Error: ' + error.message);
    }
};

// 获取数据函数（优化了超时与重定向）
function fetchData(url, redirectCount = 0) {
    return new Promise((resolve, reject) => {
        if (redirectCount > 3) {
            return reject(new Error('重定向次数过多'));
        }

        const req = https.get(url, (response) => {
            // 正确处理相对路径与绝对路径重定向
            if (response.statusCode === 301 || response.statusCode === 302) {
                const redirectLocation = response.headers.location;
                if (!redirectLocation) return reject(new Error('301/302 未提供 Location Header'));
                
                // 处理相对路径重定向
                const targetUrl = new URL(redirectLocation, url).toString();
                return fetchData(targetUrl, redirectCount + 1).then(resolve).catch(reject);
            }

            if (response.statusCode !== 200) {
                return reject(new Error(`HTTP ${response.statusCode}`));
            }

            let rawData = '';
            response.on('data', (chunk) => rawData += chunk);
            response.on('end', () => resolve(rawData));
        }).on('error', reject);
        
        // 将单次请求超时缩短至 3.5 秒，避免 Vercel 10秒总限制崩溃
        req.setTimeout(3500, () => {
            req.destroy();
            reject(new Error('请求超时 (3.5s)'));
        });
    });
}

// 提取 IP 的逻辑保持不变
function extractIPs(data, source) {
    const ips = [];
    const ipRegex = /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g;
    
    if (source.includes('ipdb.api.030101.xyz') || source.includes('stock.hostmonit.com')) {
        try {
            const jsonData = JSON.parse(data);
            const list = jsonData.data || jsonData.info || [];
            if (Array.isArray(list)) {
                list.forEach(item => {
                    if (item.ip && typeof item.ip === 'string') {
                        const match = item.ip.match(ipRegex);
                        if (match) ips.push(...match);
                    }
                });
            }
        } catch (e) {
            const matches = data.match(ipRegex);
            if (matches) ips.push(...matches);
        }
    } else {
        const matches = data.match(ipRegex);
        if (matches) ips.push(...matches);
    }
    
    return ips.filter(ip => {
        const parts = ip.split('.').map(Number);
        if (parts[0] === 0 || parts[0] === 10 || parts[0] === 127) return false;
        if (parts[0] === 169 && parts[1] === 254) return false;
        if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;
        if (parts[0] === 192 && parts[1] === 168) return false;
        return true;
    });
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

// 从不同数据源提取IP地址
function extractIPs(data, source) {
    const ips = [];
    
    // IP地址正则表达式（匹配IPv4）
    const ipRegex = /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g;
    
    // 根据数据源进行不同的处理
    if (source.includes('ipdb.api.030101.xyz')) {
        // JSON格式处理
        try {
            const jsonData = JSON.parse(data);
            if (jsonData && Array.isArray(jsonData.data)) {
                jsonData.data.forEach(item => {
                    if (item.ip && typeof item.ip === 'string') {
                        const match = item.ip.match(ipRegex);
                        if (match) ips.push(...match);
                    }
                });
            }
        } catch (e) {
            // 如果JSON解析失败，回退到文本提取
            const matches = data.match(ipRegex);
            if (matches) ips.push(...matches);
        }
    }
    else if (source.includes('stock.hostmonit.com')) {
        // JSON格式处理
        try {
            const jsonData = JSON.parse(data);
            if (jsonData && Array.isArray(jsonData.info)) {
                jsonData.info.forEach(item => {
                    if (item.ip && typeof item.ip === 'string') {
                        const match = item.ip.match(ipRegex);
                        if (match) ips.push(...match);
                    }
                });
            }
        } catch (e) {
            const matches = data.match(ipRegex);
            if (matches) ips.push(...matches);
        }
    }
    else if (source.includes('wetest.vip')) {
        // HTML表格处理
        const tableMatches = data.match(/<td[^>]*>(\d+\.\d+\.\d+\.\d+)<\/td>/g);
        if (tableMatches) {
            tableMatches.forEach(td => {
                const ipMatch = td.match(ipRegex);
                if (ipMatch) ips.push(...ipMatch);
            });
        } else {
            // 回退到通用IP提取
            const matches = data.match(ipRegex);
            if (matches) ips.push(...matches);
        }
    }
    else {
        // 通用处理：提取所有IP地址
        const matches = data.match(ipRegex);
        if (matches) ips.push(...matches);
    }
    
    // 过滤有效的IP地址（排除本地和私有IP）
    return ips.filter(ip => {
        const parts = ip.split('.');
        // 排除 0.x.x.x, 10.x.x.x, 127.x.x.x, 169.254.x.x, 172.16.x.x-172.31.x.x, 192.168.x.x
        if (parts[0] === '0') return false;
        if (parts[0] === '10') return false;
        if (parts[0] === '127') return false;
        if (parts[0] === '169' && parts[1] === '254') return false;
        if (parts[0] === '172' && parseInt(parts[1]) >= 16 && parseInt(parts[1]) <= 31) return false;
        if (parts[0] === '192' && parts[1] === '168') return false;
        return true;
    });
            }
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
