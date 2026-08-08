// api/index.js (Vercel 标准Serverless入口)
export const config = {
  runtime: "edge", // 改用Edge Runtime，稳定性远高于Node.js Runtime
  maxDuration: 15, // 最大执行时长15秒
};

// 全局缓存
let cache = {
  data: null,
  timestamp: 0,
  ttl: 60000,
};

// 轻量化高效正则（RFC4291标准，精简无冗余分组，性能极强）
const ipv4Regex = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const ipv6Regex = /\b(?:[0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}\b/g;

// 私有IPv6前缀黑名单
const privateV6Prefix = ['fe80:', 'fc', 'fd', 'ff', '::1', '::ffff:'];

export default async function handler(req) {
  const now = Date.now();
  // 命中缓存直接返回
  if (cache.data && now - cache.timestamp < cache.ttl) {
    return new Response(cache.data, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "X-Cache": "HIT",
      },
    });
  }

  const dataSources = [
    "https://ipdb.api.030101.xyz/?type=bestcf",
    "https://ip.164746.xyz/ipTop.html",
    "https://stock.hostmonit.com/CloudFlareYes",
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
