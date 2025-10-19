const https = require('https');

module.exports = async (req, res) => {
    try {
        // 数据源列表
        const dataSources = [
            'https://ipdb.api.030101.xyz/?type=bestcf',
            'https://ip.164746.xyz/ipTop.html', 
            'https://stock.hostmonit.com/CloudFlareYes',
            'https://www.wetest.vip/page/cloudflare/address_v4.html'
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
        
        // 设置响应头
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Access-Control-Allow-Origin', '*');
        
        // 返回格式化的IP列表（每行一个）
        res.end(uniqueIPs.join('\n'));
        
    } catch (error) {
        console.error('全局错误:', error);
        res.status(500).end('Error: ' + error.message);
    }
};

// 获取数据函数
function fetchData(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (response) => {
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
