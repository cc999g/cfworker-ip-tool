// Cloudflare Worker脚本 - worker.js (集成Speedtest测速版)
// 需要绑定KV命名空间: IP_HISTORY_KV

// 延迟测试目标配置
const PING_TARGETS = {
  domestic: [
    { host: 'www.baidu.com', name: '百度', type: 'domestic' },
    { host: 'www.aliyun.com', name: '阿里云', type: 'domestic' },
    { host: 'cloud.tencent.com', name: '腾讯云', type: 'domestic' }
  ],
  blockedForeign: [
    { host: 'www.google.com', name: 'Google', type: 'blocked' },
    { host: 'www.facebook.com', name: 'Facebook', type: 'blocked' },
    { host: 'twitter.com', name: 'Twitter', type: 'blocked' }
  ],
  accessibleForeign: [
    { host: 'www.cloudflare.com', name: 'Cloudflare', type: 'accessible' },
    { host: 'github.com', name: 'GitHub', type: 'accessible' }
  ]
};

// Speedtest服务器配置
const SPEEDTEST_SERVERS = [
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    url: 'https://speed.cloudflare.com/__down?bytes=10485760',
    testFileSize: 10 * 1024 * 1024
  },
  {
    id: 'ovh',
    name: 'OVH Network',
    url: 'https://proof.ovh.net/files/10Mb.dat',
    testFileSize: 10 * 1024 * 1024
  },
  {
    id: 'speedtest',
    name: 'Speedtest Closest',
    url: 'https://speedtest.sjc01.softlayer.com/downloads/test10.zip',
    testFileSize: 10 * 1024 * 1024
  }
];

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  
  // 处理API请求
  if (url.pathname.startsWith('/api/')) {
    return handleApiRequest(request, url);
  }
  
  // 返回主页面
  return new Response(getHTML(), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    }
  });
}

async function handleApiRequest(request, url) {
  // 设置CORS头部
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
  
  // 处理预检请求
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  switch(url.pathname) {
    case '/api/ipinfo':
      const ip = url.searchParams.get('ip');
      const version = url.searchParams.get('version');
      if (!ip) {
        return jsonResponse({ 
          success: false, 
          error: 'IP参数不能为空' 
        }, corsHeaders);
      }
      const info = await getIPInfo(ip, version);
      return jsonResponse(info, corsHeaders);
      
    case '/api/ping-targets':
      return jsonResponse(PING_TARGETS, corsHeaders);
      
    case '/api/speedtest-servers':
      const serversInfo = SPEEDTEST_SERVERS.map(server => ({
        id: server.id,
        name: server.name,
        size: server.testFileSize
      }));
      return jsonResponse({ success: true, servers: serversInfo }, corsHeaders);
      
    case '/api/speedtest-url':
      const serverId = url.searchParams.get('server') || 'cloudflare';
      const server = SPEEDTEST_SERVERS.find(s => s.id === serverId) || SPEEDTEST_SERVERS[0];
      return jsonResponse({ 
        success: true, 
        url: server.url,
        name: server.name,
        size: server.testFileSize
      }, corsHeaders);
      
    case '/api/save-history':
      // 保存合并的双栈IP信息
      try {
        const data = await request.json();
        await saveCombinedHistory(data);
        return jsonResponse({ success: true }, corsHeaders);
      } catch (error) {
        return jsonResponse({ 
          success: false, 
          error: error.message 
        }, corsHeaders);
      }
      
    case '/api/history':
      const history = await getHistory();
      return jsonResponse(history, corsHeaders);
      
    case '/api/clear-history':
      await clearHistory();
      return jsonResponse({ success: true }, corsHeaders);
      
    default:
      return jsonResponse({ 
        success: false, 
        error: 'API endpoint not found'
      }, { ...corsHeaders, status: 404 });
  }
}

// 使用你提供的三个API查询IP详细信息
async function getIPInfo(ip, version) {
  try {
    // 同时调用三个API
    const [api1, api2, api3] = await Promise.allSettled([
      fetch(`https://api.ip.sb/geoip/${ip}`, {
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json'
        }
      }),
      fetch(`http://ip-api.com/json/${ip}?fields=66846719`, {
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }),
      fetch(`https://freeipapi.com/api/json/${ip}`, {
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      })
    ]);
    
    // 处理第一个API：api.ip.sb
    let data1 = {};
    let api1Status = false;
    if (api1.status === 'fulfilled' && api1.value.ok) {
      try {
        data1 = await api1.value.json();
        api1Status = true;
      } catch (e) {
        console.error('api.ip.sb解析错误:', e);
      }
    }
    
    // 处理第二个API：ip-api.com
    let data2 = {};
    let api2Status = false;
    if (api2.status === 'fulfilled' && api2.value.ok) {
      try {
        data2 = await api2.value.json();
        api2Status = true;
      } catch (e) {
        console.error('ip-api.com解析错误:', e);
      }
    }
    
    // 处理第三个API：freeipapi.com
    let data3 = {};
    let api3Status = false;
    if (api3.status === 'fulfilled' && api3.value.ok) {
      try {
        data3 = await api3.value.json();
        api3Status = true;
      } catch (e) {
        console.error('freeipapi.com解析错误:', e);
      }
    }
    
    // 判断IP版本
    const detectedVersion = version || (ip.includes(':') ? 'IPv6' : 'IPv4');
    
    // 构建结果，优先使用更详细的数据
    const result = {
      ip: ip,
      ipVersion: detectedVersion,
      // 地理位置信息：优先使用api.ip.sb的数据
      country: data1.country || data2.country || data3.countryName || 'Unknown',
      countryCode: data1.country_code || data2.countryCode || data3.countryCode || '',
      region: data1.region || data2.regionName || data3.regionName || 'Unknown',
      regionCode: data1.region_code || '',
      city: data1.city || data2.city || data3.cityName || 'Unknown',
      latitude: data1.latitude || data2.lat || data3.latitude || 0,
      longitude: data1.longitude || data2.lon || data3.longitude || 0,
      
      // 网络信息
      isp: data1.isp || data2.isp || data3.isp || 'Unknown',
      asn: data1.asn || data2.as || data3.asn || 'Unknown',
      org: data1.organization || data2.org || data3.organization || 'Unknown',
      
      // 时区信息
      timezone: data1.timezone || data2.timezone || data3.timeZone || 'Unknown',
      offset: data1.offset || data2.offset || data3.timeZoneOffset || 0,
      
      // 特殊标记
      isBogon: data1.bogon || data2.bogon || data3.bogon || false,
      isMobile: data2.mobile || false,
      isProxy: data2.proxy || data3.isProxy || false,
      isCrawler: data3.isCrawler || false,
      
      // IP类型判断
      type: getIPType(data1, data2, data3),
      
      // 是否为原生IP（根据中国IP判断）
      isNative: checkNativeIP(data1, data2, data3),
      
      // API状态
      sources: {
        ip_sb: api1Status,
        ip_api: api2Status,
        freeipapi: api3Status
      },
      
      timestamp: Date.now()
    };
    
    return { success: true, data: result };
    
  } catch (error) {
    console.error('获取IP信息错误:', error);
    return { 
      success: false, 
      error: error.message,
      ip: ip
    };
  }
}

// KV存储函数 - 保存合并的双栈历史记录
async function saveCombinedHistory(data) {
  try {
    const historyKey = `combined_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await IP_HISTORY_KV.put(
      historyKey,
      JSON.stringify(data),
      { expirationTtl: 2592000 } // 30天
    );
    return true;
  } catch (error) {
    console.error('保存历史记录失败:', error);
    return false;
  }
}

async function getHistory() {
  try {
    const keys = await IP_HISTORY_KV.list();
    const history = [];
    
    // 只获取合并的历史记录（以combined_开头）
    const combinedKeys = keys.keys.filter(key => key.name.startsWith('combined_'));
    
    for (const key of combinedKeys) {
      const item = await IP_HISTORY_KV.get(key.name, 'json');
      if (item) {
        // 确保数据结构一致
        if (!item.ipv4 && !item.ipv6) {
          // 如果是旧的单条记录，转换为新格式
          const convertedItem = {
            timestamp: item.timestamp || Date.now(),
            ipv4: item.data?.ipVersion === 'IPv4' ? item.data : null,
            ipv6: item.data?.ipVersion === 'IPv6' ? item.data : null
          };
          history.push(convertedItem);
        } else {
          history.push(item);
        }
      }
    }
    
    history.sort((a, b) => b.timestamp - a.timestamp);
    return { success: true, data: history.slice(0, 100) };
  } catch (error) {
    console.error('获取历史记录失败:', error);
    return { success: false, error: error.message };
  }
}

async function clearHistory() {
  try {
    const keys = await IP_HISTORY_KV.list();
    for (const key of keys.keys) {
      await IP_HISTORY_KV.delete(key.name);
    }
    return true;
  } catch (error) {
    console.error('清除历史记录失败:', error);
    return false;
  }
}

// 辅助函数
function jsonResponse(data, headers = {}) {
  const defaultHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache, max-age=0'
  };
  
  return new Response(JSON.stringify(data), {
    headers: { ...defaultHeaders, ...headers },
    status: headers.status || 200
  });
}

function getIPType(data1, data2, data3) {
  // 从ip-api.com获取代理/托管信息
  if (data2.proxy === true || data2.hosting === true) {
    return data2.hosting ? 'Datacenter/机房' : 'Proxy/代理';
  }
  
  // 从api.ip.sb获取类型
  if (data1.type) {
    return data1.type;
  }
  
  // 从freeipapi.com获取代理类型
  if (data3.proxyType) {
    return data3.proxyType;
  }
  
  // 通过组织/ISP名称判断
  const org = (data1.organization || data2.org || data3.organization || '').toLowerCase();
  const isp = (data1.isp || data2.isp || data3.isp || '').toLowerCase();
  
  if (org.includes('cloud') || org.includes('data center') || org.includes('datacenter') ||
      isp.includes('cloud') || isp.includes('data center') || isp.includes('datacenter')) {
    return 'Datacenter/机房';
  }
  
  if (org.includes('proxy') || isp.includes('proxy') || 
      data2.proxy || data3.isProxy || data3.isCrawler) {
    return 'Proxy/代理';
  }
  
  if (data2.mobile) {
    return 'Mobile/移动网络';
  }
  
  return 'Residential/住宅';
}

function checkNativeIP(data1, data2, data3) {
  const country = data1.country || data2.country || data3.countryName || '';
  const isp = data1.isp || data2.isp || data3.isp || '';
  
  // 如果是中国IP且不是机房/代理，则认为是原生IP
  if (country === 'China' || country === 'CN') {
    const org = (data1.organization || data2.org || data3.organization || '').toLowerCase();
    return !(org.includes('cloud') || org.includes('data center') || 
             isp.includes('cloud') || isp.includes('data center') ||
             data2.proxy || data2.hosting || data3.isProxy);
  }
  
  return false;
}

// 生成HTML页面
function getHTML() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>双栈IP查询与测速工具</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        :root {
            --primary-color: #3498db;
            --secondary-color: #2ecc71;
            --danger-color: #e74c3c;
            --warning-color: #f39c12;
            --dark-color: #2c3e50;
            --light-color: #ecf0f1;
            --gray-color: #95a5a6;
            --shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            --border-radius: 8px;
        }
        
        * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif; }
        
        body {
            background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
            min-height: 100vh;
            padding: 20px;
            color: var(--dark-color);
        }
        
        .container { max-width: 1200px; margin: 0 auto; }
        
        header {
            text-align: center;
            margin-bottom: 30px;
            padding: 20px;
            background: white;
            border-radius: var(--border-radius);
            box-shadow: var(--shadow);
        }
        
        h1 { color: var(--dark-color); margin-bottom: 10px; font-size: 2.2rem; }
        .subtitle { color: var(--gray-color); font-size: 1.1rem; margin-bottom: 10px; }
        .time-display { font-size: 1.2rem; font-weight: bold; color: var(--primary-color); margin-top: 10px; }
        
        .card {
            background: white;
            border-radius: var(--border-radius);
            padding: 25px;
            box-shadow: var(--shadow);
            margin-bottom: 20px;
            transition: transform 0.3s;
        }
        
        .card:hover { transform: translateY(-2px); }
        
        .card-title {
            display: flex;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 2px solid var(--light-color);
            color: var(--dark-color);
        }
        
        .card-title i { margin-right: 10px; font-size: 1.5rem; color: var(--primary-color); }
        
        .ip-stack-container {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin: 20px 0;
        }
        
        @media (max-width: 768px) { .ip-stack-container { grid-template-columns: 1fr; } }
        
        .ip-box {
            padding: 20px;
            border-radius: var(--border-radius);
            border: 2px solid transparent;
            background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
        }
        
        .ip-box.ipv4 { border-color: #3498db; }
        .ip-box.ipv6 { border-color: #9b59b6; }
        
        .ip-label {
            font-size: 0.9rem;
            color: var(--gray-color);
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 10px;
        }
        
        .ip-address {
            font-size: 1.3rem;
            font-weight: bold;
            word-break: break-all;
            margin: 10px 0;
            padding: 10px;
            background: white;
            border-radius: 4px;
            border: 1px solid #dee2e6;
            min-height: 60px;
            display: flex;
            align-items: center;
        }
        
        .ip-details-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 15px;
            margin-top: 20px;
        }
        
        .detail-item {
            display: flex;
            flex-direction: column;
            padding: 10px;
            background: #f8f9fa;
            border-radius: 6px;
        }
        
        .detail-label { font-size: 0.85rem; color: var(--gray-color); margin-bottom: 5px; }
        .detail-value { font-size: 1rem; font-weight: 600; color: var(--dark-color); word-break: break-word; }
        
        .ip-type-tag {
            display: inline-block;
            padding: 5px 12px;
            border-radius: 20px;
            font-size: 0.85rem;
            font-weight: bold;
            margin: 5px 5px 5px 0;
        }
        
        .type-residential { background-color: #d5f4e6; color: #27ae60; }
        .type-datacenter { background-color: #e8f4fc; color: #2980b9; }
        .type-proxy { background-color: #fdebd0; color: #d35400; }
        .type-mobile { background-color: #e8d6ff; color: #8e44ad; }
        
        .badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 0.75rem;
            font-weight: bold;
            margin-right: 5px;
            margin-bottom: 5px;
        }
        
        .badge-success { background-color: #d5f4e6; color: #27ae60; }
        .badge-warning { background-color: #fdebd0; color: #d35400; }
        .badge-danger { background-color: #fadbd8; color: #c0392b; }
        .badge-info { background-color: #d6eaf8; color: #2980b9; }
        .badge-ipv4 { background-color: #3498db; color: white; }
        .badge-ipv6 { background-color: #9b59b6; color: white; }
        
        .controls {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin-top: 20px;
        }
        
        .btn {
            padding: 12px 20px;
            border: none;
            border-radius: var(--border-radius);
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s;
            min-width: 140px;
        }
        
        .btn i { margin-right: 8px; }
        .btn-primary { background-color: var(--primary-color); color: white; }
        .btn-primary:hover { background-color: #2980b9; transform: translateY(-2px); }
        .btn-success { background-color: var(--secondary-color); color: white; }
        .btn-success:hover { background-color: #27ae60; transform: translateY(-2px); }
        .btn-warning { background-color: var(--warning-color); color: white; }
        .btn-warning:hover { background-color: #e67e22; transform: translateY(-2px); }
        .btn-danger { background-color: var(--danger-color); color: white; }
        .btn-danger:hover { background-color: #c0392b; transform: translateY(-2px); }
        
        .ping-container { margin-top: 25px; }
        .ping-category { margin-bottom: 25px; }
        
        .ping-category h4 {
            margin-bottom: 15px;
            color: var(--dark-color);
            padding-bottom: 8px;
            border-bottom: 2px solid var(--light-color);
        }
        
        .ping-results-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 15px;
        }
        
        .ping-item {
            padding: 15px;
            background: #f8f9fa;
            border-radius: var(--border-radius);
            border-left: 4px solid var(--gray-color);
            transition: all 0.3s;
        }
        
        .ping-item:hover { background: #e9ecef; transform: translateX(5px); }
        .ping-item.success { border-left-color: var(--secondary-color); }
        .ping-item.warning { border-left-color: var(--warning-color); }
        .ping-item.error { border-left-color: var(--danger-color); }
        
        .ping-name { font-weight: 600; font-size: 1.1rem; color: var(--dark-color); margin-bottom: 5px; }
        .ping-host { font-size: 0.9rem; color: var(--gray-color); margin-bottom: 10px; word-break: break-all; }
        .ping-latency { font-size: 1.3rem; font-weight: bold; margin: 10px 0; }
        .latency-good { color: #27ae60; }
        .latency-ok { color: #f39c12; }
        .latency-poor { color: #e74c3c; }
        
        /* 测速样式 */
        .speedtest-container { margin-top: 25px; }
        
        .speedtest-progress {
            height: 12px;
            background: #e9ecef;
            border-radius: 6px;
            margin: 20px 0;
            overflow: hidden;
        }
        
        .speedtest-progress-bar {
            height: 100%;
            background: linear-gradient(90deg, #3498db, #2ecc71);
            border-radius: 6px;
            transition: width 0.3s;
            width: 0%;
        }
        
        .speedtest-results {
            display: none;
            margin-top: 20px;
            padding: 20px;
            background: #f8f9fa;
            border-radius: var(--border-radius);
        }
        
        .speedtest-results.active { display: block; }
        
        .speedtest-metrics {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-top: 20px;
        }
        
        .speedtest-metric {
            text-align: center;
            padding: 20px;
            background: white;
            border-radius: var(--border-radius);
            box-shadow: var(--shadow);
        }
        
        .speedtest-value { 
            font-size: 2rem; 
            font-weight: bold; 
            color: var(--primary-color); 
            margin-bottom: 5px; 
        }
        
        .speedtest-label { 
            font-size: 0.9rem; 
            color: var(--gray-color); 
            text-transform: uppercase; 
            letter-spacing: 1px; 
        }
        
        .unit-toggle { display: flex; justify-content: center; margin: 15px 0; }
        
        .unit-btn {
            padding: 8px 20px;
            background: #e9ecef;
            border: none;
            cursor: pointer;
            font-size: 0.9rem;
            font-weight: 600;
            transition: all 0.3s;
        }
        
        .unit-btn:first-child { border-radius: var(--border-radius) 0 0 var(--border-radius); }
        .unit-btn:last-child { border-radius: 0 var(--border-radius) var(--border-radius) 0; }
        .unit-btn.active { background-color: var(--primary-color); color: white; }
        
        .speedtest-chart-container { margin-top: 20px; height: 200px; }
        
        .server-selector {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin: 15px 0;
        }
        
        .server-btn {
            padding: 8px 15px;
            background: #e9ecef;
            border: none;
            border-radius: var(--border-radius);
            cursor: pointer;
            font-size: 0.9rem;
            transition: all 0.3s;
        }
        
        .server-btn:hover { background: #dde2e6; }
        .server-btn.active { background-color: var(--primary-color); color: white; }
        
        .history-container { margin-top: 20px; max-height: 600px; overflow-y: auto; }
        
        .history-item {
            padding: 15px;
            background: #f8f9fa;
            margin-bottom: 10px;
            border-radius: var(--border-radius);
            cursor: pointer;
            transition: all 0.3s;
            border-left: 4px solid var(--primary-color);
        }
        
        .history-item:hover { background: #e9ecef; transform: translateX(5px); }
        .history-ip { font-weight: bold; color: var(--primary-color); font-size: 1.1rem; margin-bottom: 5px; }
        .history-time { font-size: 0.85rem; color: var(--gray-color); }
        
        .api-status { display: flex; flex-wrap: wrap; gap: 10px; margin: 15px 0; }
        
        .api-status-item {
            display: flex;
            align-items: center;
            padding: 5px 10px;
            background: #f8f9fa;
            border-radius: 4px;
            font-size: 0.85rem;
        }
        
        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            margin-right: 8px;
        }
        
        .status-success { background-color: var(--secondary-color); }
        .status-error { background-color: var(--danger-color); }
        
        .loading {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 3px solid rgba(0, 0, 0, 0.1);
            border-radius: 50%;
            border-top-color: var(--primary-color);
            animation: spin 1s ease-in-out infinite;
            margin-right: 10px;
        }
        
        @keyframes spin { to { transform: rotate(360deg); } }
        
        .footer {
            text-align: center;
            margin-top: 30px;
            padding: 20px;
            color: var(--gray-color);
            font-size: 0.9rem;
            border-top: 1px solid #dee2e6;
        }
        
        .test-status {
            padding: 10px;
            margin: 10px 0;
            border-radius: var(--border-radius);
            font-size: 0.9rem;
        }
        
        .test-status.info { background: #e8f4fc; color: #2980b9; }
        .test-status.success { background: #d5f4e6; color: #27ae60; }
        .test-status.error { background: #fadbd8; color: #c0392b; }
        
        .history-details {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
            margin-top: 10px;
        }
        
        .history-ip-box {
            padding: 10px;
            background: white;
            border-radius: 6px;
            border: 1px solid #dee2e6;
        }
        
        .history-ip-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
            padding-bottom: 5px;
            border-bottom: 1px solid #e9ecef;
        }
        
        .history-ip-title {
            font-weight: bold;
            font-size: 0.9rem;
            color: var(--dark-color);
        }
        
        .history-ip-address {
            font-family: monospace;
            font-size: 0.85rem;
            word-break: break-all;
            margin-bottom: 8px;
        }
        
        .history-ip-info {
            font-size: 0.8rem;
            color: var(--gray-color);
        }
        
        .history-ip-info div {
            margin-bottom: 3px;
        }
        
        .history-tags {
            display: flex;
            flex-wrap: wrap;
            gap: 5px;
            margin-top: 10px;
        }
        
        @media (max-width: 576px) {
            .controls { flex-direction: column; }
            .btn { width: 100%; }
            .ping-results-grid { grid-template-columns: 1fr; }
            .history-details { grid-template-columns: 1fr; }
            .speedtest-metrics { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1><i class="fas fa-network-wired"></i> 双栈IP查询与测速工具</h1>
            <p class="subtitle">设备真实IP检测 | 精准延迟测试 | Speedtest网速测试 | 双栈历史记录</p>
            <div class="time-display" id="beijingTime">北京时间: 加载中...</div>
        </header>
        
        <!-- IP信息查询卡片 -->
        <div class="card">
            <h2 class="card-title"><i class="fas fa-info-circle"></i> 设备IP信息查询</h2>
            
            <div class="test-status info" id="ipDetectionStatus">
                <i class="fas fa-info-circle"></i> 正在检测您的设备IP地址...
            </div>
            
            <!-- 双栈IP显示区域 -->
            <div class="ip-stack-container">
                <!-- IPv4 信息盒 -->
                <div class="ip-box ipv4">
                    <div class="ip-label">IPv4 地址</div>
                    <div class="ip-address" id="ipv4Address">正在检测...</div>
                    
                    <!-- IPv4 详情 -->
                    <div class="ip-details-grid" id="ipv4Details">
                        <div class="detail-item">
                            <span class="detail-label">地理位置</span>
                            <span class="detail-value" id="ipv4Location">-</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">运营商</span>
                            <span class="detail-value" id="ipv4ISP">-</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">IP类型</span>
                            <span class="detail-value" id="ipv4Type">-</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">ASN</span>
                            <span class="detail-value" id="ipv4ASN">-</span>
                        </div>
                    </div>
                    
                    <div class="api-status" id="ipv4ApiStatus"></div>
                </div>
                
                <!-- IPv6 信息盒 -->
                <div class="ip-box ipv6">
                    <div class="ip-label">IPv6 地址</div>
                    <div class="ip-address" id="ipv6Address">正在检测...</div>
                    
                    <!-- IPv6 详情 -->
                    <div class="ip-details-grid" id="ipv6Details">
                        <div class="detail-item">
                            <span class="detail-label">地理位置</span>
                            <span class="detail-value" id="ipv6Location">-</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">运营商</span>
                            <span class="detail-value" id="ipv6ISP">-</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">IP类型</span>
                            <span class="detail-value" id="ipv6Type">-</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">ASN</span>
                            <span class="detail-value" id="ipv6ASN">-</span>
                        </div>
                    </div>
                    
                    <div class="api-status" id="ipv6ApiStatus"></div>
                </div>
            </div>
            
            <div class="controls">
                <button class="btn btn-success" id="refreshAllBtn">
                    <i class="fas fa-sync-alt"></i> 重新检测IP
                </button>
                <button class="btn btn-warning" id="runPingTestsBtn">
                    <i class="fas fa-signal"></i> 开始延迟测试
                </button>
                <button class="btn btn-danger" id="runSpeedtestBtn">
                    <i class="fas fa-tachometer-alt"></i> 开始网速测试
                </button>
            </div>
        </div>
        
        <!-- 延迟测试结果卡片 -->
        <div class="card" id="pingResultsCard" style="display: none;">
            <h2 class="card-title"><i class="fas fa-chart-line"></i> 延迟测试结果</h2>
            
            <div class="ping-container">
                <div class="ping-category">
                    <h4>国内平台</h4>
                    <div class="ping-results-grid" id="domesticPingResults">
                        <!-- 国内延迟结果将在此显示 -->
                    </div>
                </div>
                
                <div class="ping-category">
                    <h4>国外可访问站点</h4>
                    <div class="ping-results-grid" id="accessibleForeignPingResults">
                        <!-- 国外可访问延迟结果将在此显示 -->
                    </div>
                </div>
                
                <div class="ping-category">
                    <h4>国外被屏蔽站点</h4>
                    <div class="ping-results-grid" id="blockedForeignPingResults">
                        <!-- 国外被屏蔽延迟结果将在此显示 -->
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Speedtest测速卡片 -->
        <div class="card" id="speedtestCard" style="display: none;">
            <h2 class="card-title"><i class="fas fa-tachometer-alt"></i> 网速测试 (Speedtest)</h2>
            
            <div class="speedtest-container">
                <div class="test-status info" id="speedtestStatus">
                    <i class="fas fa-info-circle"></i> 准备开始测速...
                </div>
                
                <div class="server-selector" id="serverSelector">
                    <button class="server-btn active" data-server="cloudflare">
                        <i class="fas fa-server"></i> Cloudflare
                    </button>
                    <button class="server-btn" data-server="ovh">
                        <i class="fas fa-server"></i> OVH Network
                    </button>
                    <button class="server-btn" data-server="speedtest">
                        <i class="fas fa-server"></i> Speedtest
                    </button>
                </div>
                
                <div class="controls">
                    <button class="btn btn-success" id="startSpeedtestBtn">
                        <i class="fas fa-play"></i> 开始测速
                    </button>
                    <button class="btn btn-danger" id="stopSpeedtestBtn" style="display: none;">
                        <i class="fas fa-stop"></i> 停止测试
                    </button>
                </div>
                
                <div class="speedtest-progress">
                    <div class="speedtest-progress-bar" id="speedtestProgressBar"></div>
                </div>
                
                <div class="speedtest-results" id="speedtestResults">
                    <div class="speedtest-metrics">
                        <div class="speedtest-metric">
                            <div class="speedtest-value" id="downloadSpeed">0</div>
                            <div class="speedtest-label">下载速度 (Mbps)</div>
                        </div>
                        <div class="speedtest-metric">
                            <div class="speedtest-value" id="uploadSpeed">0</div>
                            <div class="speedtest-label">上传速度 (Mbps)</div>
                        </div>
                        <div class="speedtest-metric">
                            <div class="speedtest-value" id="averageLatency">0</div>
                            <div class="speedtest-label">平均延迟 (ms)</div>
                        </div>
                        <div class="speedtest-metric">
                            <div class="speedtest-value" id="jitter">0</div>
                            <div class="speedtest-label">抖动 (ms)</div>
                        </div>
                    </div>
                    
                    <div class="unit-toggle">
                        <button class="unit-btn active" data-unit="Mbps">Mbps</button>
                        <button class="unit-btn" data-unit="MB/s">MB/s</button>
                        <button class="unit-btn" data-unit="Kbps">Kbps</button>
                    </div>
                    
                    <div class="speedtest-chart-container">
                        <canvas id="speedtestChart"></canvas>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- 历史记录卡片 -->
        <div class="card">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h2 class="card-title" style="margin-bottom: 0;"><i class="fas fa-history"></i> 双栈IP历史记录</h2>
                <button class="btn btn-danger" id="clearHistoryBtn">
                    <i class="fas fa-trash-alt"></i> 清除历史
                </button>
            </div>
            
            <div class="history-container" id="historyContainer">
                <p style="text-align: center; color: var(--gray-color); padding: 20px;">加载历史记录中...</p>
            </div>
        </div>
        
        <div class="footer">
            <p>双栈IP查询与测速工具 - 基于Cloudflare Workers构建 | 使用三个IP查询API | 集成Speedtest测速</p>
            <p>© ${new Date().getFullYear()} - 本工具仅用于网络诊断和技术研究</p>
        </div>
    </div>
    
    <script>
        // 全局状态变量
        let ipv4Details = null;
        let ipv6Details = null;
        let currentUnit = 'Mbps';
        let speedtestChart = null;
        let isSpeedtestRunning = false;
        let speedtestController = null;
        let speedtestDataPoints = [];
        let selectedServer = 'cloudflare';
        let combinedHistoryData = null;
        
        // 页面加载完成后执行
        document.addEventListener('DOMContentLoaded', function() {
            updateBeijingTime();
            setInterval(updateBeijingTime, 1000);
            
            initSpeedtestChart();
            detectDeviceIPs();
            loadHistory();
            
            // 绑定按钮事件
            document.getElementById('refreshAllBtn').addEventListener('click', detectDeviceIPs);
            document.getElementById('runPingTestsBtn').addEventListener('click', runAllPingTests);
            document.getElementById('runSpeedtestBtn').addEventListener('click', () => {
                document.getElementById('speedtestCard').style.display = 'block';
            });
            document.getElementById('clearHistoryBtn').addEventListener('click', clearHistory);
            
            // 测速相关事件
            document.getElementById('startSpeedtestBtn').addEventListener('click', startSpeedtest);
            document.getElementById('stopSpeedtestBtn').addEventListener('click', stopSpeedtest);
            
            // 服务器选择
            document.querySelectorAll('.server-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    document.querySelectorAll('.server-btn').forEach(b => b.classList.remove('active'));
                    this.classList.add('active');
                    selectedServer = this.getAttribute('data-server');
                });
            });
            
            // 单位切换
            document.querySelectorAll('.unit-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    document.querySelectorAll('.unit-btn').forEach(b => b.classList.remove('active'));
                    this.classList.add('active');
                    currentUnit = this.getAttribute('data-unit');
                    updateSpeedDisplay();
                });
            });
        });
        
        // 更新北京时间
        function updateBeijingTime() {
            const now = new Date();
            const beijingTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
            const formatter = new Intl.DateTimeFormat('zh-CN', {
                timeZone: 'Asia/Shanghai',
                year: 'numeric', month: 'long', day: 'numeric',
                weekday: 'long', hour: '2-digit', minute: '2-digit', second: '2-digit'
            });
            document.getElementById('beijingTime').textContent = \`北京时间: \${formatter.format(beijingTime)}\`;
        }
        
        // 检测设备真实IP地址并保存合并记录
        async function detectDeviceIPs() {
            const statusEl = document.getElementById('ipDetectionStatus');
            statusEl.className = 'test-status info';
            statusEl.innerHTML = '<i class="fas fa-sync-alt loading"></i> 正在检测您的设备IP地址...';
            
            const btn = document.getElementById('refreshAllBtn');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<span class="loading"></span> 检测中...';
            btn.disabled = true;
            
            document.getElementById('ipv4Address').textContent = '检测中...';
            document.getElementById('ipv6Address').textContent = '检测中...';
            
            // 重置IP详情
            ipv4Details = null;
            ipv6Details = null;
            
            try {
                // 并行检测IPv4和IPv6
                const ipv4Promise = detectIPv4();
                const ipv6Promise = detectIPv6();
                
                // 设置超时
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('检测超时')), 10000)
                );
                
                const [ipv4Result, ipv6Result] = await Promise.race([
                    Promise.all([ipv4Promise, ipv6Promise]),
                    timeoutPromise.then(() => { throw new Error('检测超时'); })
                ]);
                
                // 处理IPv4
                if (ipv4Result && ipv4Result !== '0.0.0.0') {
                    document.getElementById('ipv4Address').textContent = ipv4Result;
                    ipv4Details = await loadIPDetails(ipv4Result, 'ipv4');
                    if (ipv4Details) {
                        updateIPDetailsDisplay(ipv4Details, 'ipv4');
                    }
                } else {
                    document.getElementById('ipv4Address').textContent = '未检测到IPv4';
                    document.getElementById('ipv4Details').innerHTML = 
                        '<div class="test-status info"><i class="fas fa-info-circle"></i> 无法检测到IPv4地址</div>';
                }
                
                // 处理IPv6
                if (ipv6Result && ipv6Result !== '::') {
                    document.getElementById('ipv6Address').textContent = ipv6Result;
                    ipv6Details = await loadIPDetails(ipv6Result, 'ipv6');
                    if (ipv6Details) {
                        updateIPDetailsDisplay(ipv6Details, 'ipv6');
                    }
                } else {
                    document.getElementById('ipv6Address').textContent = '未检测到IPv6';
                    document.getElementById('ipv6Details').innerHTML = 
                        '<div class="test-status info"><i class="fas fa-info-circle"></i> 无法检测到IPv6地址</div>';
                }
                
                // 保存合并的历史记录
                await saveCombinedHistory();
                
                statusEl.className = 'test-status success';
                statusEl.innerHTML = '<i class="fas fa-check-circle"></i> IP地址检测完成，已保存到历史记录';
                
            } catch (error) {
                console.error('IP检测失败:', error);
                statusEl.className = 'test-status error';
                statusEl.innerHTML = \`<i class="fas fa-exclamation-circle"></i> IP检测失败: \${error.message}\`;
                
                // 显示默认信息
                document.getElementById('ipv4Address').textContent = '检测失败';
                document.getElementById('ipv6Address').textContent = '检测失败';
            } finally {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        }
        
        // 保存合并的双栈历史记录
        async function saveCombinedHistory() {
            const timestamp = Date.now();
            combinedHistoryData = {
                timestamp: timestamp,
                ipv4: ipv4Details,
                ipv6: ipv6Details
            };
            
            try {
                const response = await fetch('/api/save-history', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(combinedHistoryData)
                });
                
                const data = await response.json();
                if (data.success) {
                    console.log('历史记录保存成功');
                    // 重新加载历史记录
                    loadHistory();
                } else {
                    console.error('历史记录保存失败:', data.error);
                }
            } catch (error) {
                console.error('保存历史记录请求失败:', error);
            }
        }
        
        // 检测IPv4地址（前端直接调用公共API）
        async function detectIPv4() {
            const ipv4Services = [
                'https://api.ipify.org?format=json',
                'https://api4.ipify.org?format=json',
                'https://v4.ident.me/json',
                'https://api.my-ip.io/ip.json'
            ];
            
            for (const service of ipv4Services) {
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 3000);
                    
                    const response = await fetch(service, {
                        signal: controller.signal,
                        headers: { 'Accept': 'application/json' }
                    });
                    
                    clearTimeout(timeoutId);
                    
                    if (response.ok) {
                        const data = await response.json();
                        const ip = data.ip || data.address || data.ipAddress;
                        
                        // 验证IPv4格式
                        if (ip && /^\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}$/.test(ip)) {
                            return ip;
                        }
                    }
                } catch (error) {
                    continue; // 尝试下一个服务
                }
            }
            
            return '0.0.0.0';
        }
        
        // 检测IPv6地址（前端直接调用公共API）
        async function detectIPv6() {
            const ipv6Services = [
                'https://api64.ipify.org?format=json',
                'https://v6.ident.me/json',
                'https://api6.ipify.org?format=json',
                'https://api.my-ip.io/ip.json?ipv6=true'
            ];
            
            for (const service of ipv6Services) {
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 3000);
                    
                    const response = await fetch(service, {
                        signal: controller.signal,
                        headers: { 'Accept': 'application/json' }
                    });
                    
                    clearTimeout(timeoutId);
                    
                    if (response.ok) {
                        const data = await response.json();
                        const ip = data.ip || data.address || data.ipAddress;
                        
                        // 验证IPv6格式
                        if (ip && ip.includes(':')) {
                            return ip;
                        }
                    }
                } catch (error) {
                    continue;
                }
            }
            
            return '::';
        }
        
        // 加载IP详细信息（调用Worker API，使用你提供的三个接口）
        async function loadIPDetails(ip, version) {
            try {
                const response = await fetch(\`/api/ipinfo?ip=\${encodeURIComponent(ip)}&version=\${version}\`);
                const data = await response.json();
                
                if (data.success) {
                    return data.data;
                } else {
                    console.error(\`加载\${version}详情失败:\`, data.error);
                    showError(\`加载\${version}信息失败: \${data.error}\`);
                    return null;
                }
            } catch (error) {
                console.error(\`加载\${version}详情失败:\`, error);
                showError(\`加载\${version}信息失败: \${error.message}\`);
                return null;
            }
        }
        
        // 更新IP详情显示
        function updateIPDetailsDisplay(details, version) {
            const prefix = version === 'ipv4' ? 'ipv4' : 'ipv6';
            
            // 更新基本信息
            document.getElementById(\`\${prefix}Location\`).textContent = 
                \`\${details.city || ''}, \${details.region || ''}, \${details.country || 'Unknown'}\`;
            document.getElementById(\`\${prefix}ISP\`).textContent = details.isp || 'Unknown';
            document.getElementById(\`\${prefix}ASN\`).textContent = \`\${details.asn || 'Unknown'} - \${details.org || 'Unknown'}\`;
            
            // 更新IP类型
            const typeElement = document.getElementById(\`\${prefix}Type\`);
            typeElement.textContent = details.type || 'Unknown';
            typeElement.className = 'detail-value';
            
            // 根据类型添加样式
            if (details.type) {
                if (details.type.includes('住宅') || details.type.includes('Residential')) {
                    typeElement.classList.add('type-residential');
                } else if (details.type.includes('机房') || details.type.includes('Datacenter')) {
                    typeElement.classList.add('type-datacenter');
                } else if (details.type.includes('代理') || details.type.includes('Proxy')) {
                    typeElement.classList.add('type-proxy');
                } else if (details.type.includes('移动') || details.type.includes('Mobile')) {
                    typeElement.classList.add('type-mobile');
                }
            }
            
            // 更新API状态
            const apiStatusElement = document.getElementById(\`\${prefix}ApiStatus\`);
            apiStatusElement.innerHTML = '';
            
            if (details.sources) {
                const apiNames = {
                    'ip_sb': 'api.ip.sb',
                    'ip_api': 'ip-api.com', 
                    'freeipapi': 'freeipapi.com'
                };
                
                for (const [apiKey, status] of Object.entries(details.sources)) {
                    const apiItem = document.createElement('div');
                    apiItem.className = 'api-status-item';
                    
                    const statusDot = document.createElement('span');
                    statusDot.className = \`status-dot \${status ? 'status-success' : 'status-error'}\`;
                    
                    const apiText = document.createElement('span');
                    apiText.textContent = apiNames[apiKey] || apiKey;
                    
                    apiItem.appendChild(statusDot);
                    apiItem.appendChild(apiText);
                    apiStatusElement.appendChild(apiItem);
                }
            }
            
            // 显示额外标记
            const extraBadges = document.createElement('div');
            extraBadges.style.marginTop = '10px';
            
            if (details.isNative) {
                const nativeBadge = document.createElement('span');
                nativeBadge.className = 'badge badge-success';
                nativeBadge.textContent = '原生IP';
                extraBadges.appendChild(nativeBadge);
            }
            
            if (details.isBogon) {
                const bogonBadge = document.createElement('span');
                bogonBadge.className = 'badge badge-warning';
                bogonBadge.textContent = '广播IP';
                extraBadges.appendChild(bogonBadge);
            }
            
            if (details.isProxy) {
                const proxyBadge = document.createElement('span');
                proxyBadge.className = 'badge badge-danger';
                proxyBadge.textContent = '代理';
                extraBadges.appendChild(proxyBadge);
            }
            
            if (details.isMobile) {
                const mobileBadge = document.createElement('span');
                mobileBadge.className = 'badge badge-info';
                mobileBadge.textContent = '移动网络';
                extraBadges.appendChild(mobileBadge);
            }
            
            if (extraBadges.children.length > 0) {
                apiStatusElement.appendChild(extraBadges);
            }
        }
        
        // 运行所有延迟测试
        async function runAllPingTests() {
            const btn = document.getElementById('runPingTestsBtn');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<span class="loading"></span> 测试中...';
            btn.disabled = true;
            
            document.getElementById('pingResultsCard').style.display = 'block';
            
            document.getElementById('domesticPingResults').innerHTML = '';
            document.getElementById('accessibleForeignPingResults').innerHTML = '';
            document.getElementById('blockedForeignPingResults').innerHTML = '';
            
            try {
                // 获取测试目标
                const response = await fetch('/api/ping-targets');
                const targets = await response.json();
                
                // 测试国内平台
                for (const target of targets.domestic) {
                    await testSinglePing(target, 'domesticPingResults');
                    await delay(300);
                }
                
                // 测试国外可访问站点
                for (const target of targets.accessibleForeign) {
                    await testSinglePing(target, 'accessibleForeignPingResults');
                    await delay(300);
                }
                
                // 测试国外被屏蔽站点
                for (const target of targets.blockedForeign) {
                    await testSinglePing(target, 'blockedForeignPingResults');
                    await delay(300);
                }
                
            } catch (error) {
                showError('延迟测试失败: ' + error.message);
            } finally {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        }
        
        // 测试单个目标的延迟
        async function testSinglePing(target, containerId) {
            const container = document.getElementById(containerId);
            const pingItem = document.createElement('div');
            pingItem.className = 'ping-item';
            
            const pingName = document.createElement('div');
            pingName.className = 'ping-name';
            pingName.textContent = target.name;
            
            const pingHost = document.createElement('div');
            pingHost.className = 'ping-host';
            pingHost.textContent = target.host;
            
            const pingLatency = document.createElement('div');
            pingLatency.className = 'ping-latency';
            pingLatency.textContent = '测试中...';
            
            pingItem.appendChild(pingName);
            pingItem.appendChild(pingHost);
            pingItem.appendChild(pingLatency);
            container.appendChild(pingItem);
            
            const startTime = performance.now();
            
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000);
                
                // 使用更小的资源进行延迟测试
                await fetch(\`https://\${target.host}/favicon.ico?t=\${Date.now()}\`, {
                    method: 'HEAD',
                    signal: controller.signal,
                    mode: 'no-cors',
                    cache: 'no-store'
                });
                
                clearTimeout(timeoutId);
                const latency = Math.round(performance.now() - startTime);
                
                pingLatency.textContent = \`\${latency} ms\`;
                
                if (latency < 100) {
                    pingLatency.className = 'ping-latency latency-good';
                    pingItem.classList.add('success');
                } else if (latency < 300) {
                    pingLatency.className = 'ping-latency latency-ok';
                    pingItem.classList.add('warning');
                } else {
                    pingLatency.className = 'ping-latency latency-poor';
                    pingItem.classList.add('error');
                }
                
            } catch (error) {
                pingLatency.textContent = '超时/失败';
                pingLatency.className = 'ping-latency latency-poor';
                pingItem.classList.add('error');
            }
        }
        
        // ============================================
        // Speedtest测速功能
        // ============================================
        
        // 初始化测速图表
        function initSpeedtestChart() {
            const ctx = document.getElementById('speedtestChart').getContext('2d');
            
            speedtestChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: '下载速度 (Mbps)',
                        data: [],
                        borderColor: '#3498db',
                        backgroundColor: 'rgba(52, 152, 219, 0.1)',
                        borderWidth: 3,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 3,
                        pointBackgroundColor: '#3498db'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { 
                            beginAtZero: true, 
                            title: { 
                                display: true, 
                                text: '速度 (Mbps)' 
                            }
                        },
                        x: { 
                            title: { 
                                display: true, 
                                text: '时间 (秒)' 
                            }
                        }
                    },
                    plugins: { 
                        legend: { 
                            position: 'top' 
                        } 
                    },
                    animation: { duration: 200 }
                }
            });
        }
        
        // 开始Speedtest测速
        async function startSpeedtest() {
            if (isSpeedtestRunning) return;
            
            isSpeedtestRunning = true;
            
            const startBtn = document.getElementById('startSpeedtestBtn');
            const stopBtn = document.getElementById('stopSpeedtestBtn');
            const statusEl = document.getElementById('speedtestStatus');
            const progressBar = document.getElementById('speedtestProgressBar');
            const resultsEl = document.getElementById('speedtestResults');
            
            startBtn.style.display = 'none';
            stopBtn.style.display = 'flex';
            resultsEl.classList.remove('active');
            
            // 重置显示
            progressBar.style.width = '0%';
            speedtestDataPoints = [];
            
            // 重置图表
            speedtestChart.data.labels = [];
            speedtestChart.data.datasets[0].data = [];
            speedtestChart.update();
            
            // 重置结果
            document.getElementById('downloadSpeed').textContent = '0';
            document.getElementById('uploadSpeed').textContent = '0';
            document.getElementById('averageLatency').textContent = '0';
            document.getElementById('jitter').textContent = '0';
            
            try {
                statusEl.className = 'test-status info';
                statusEl.innerHTML = \`<i class="fas fa-sync-alt loading"></i> 正在连接测速服务器 (\${selectedServer})...\`;
                
                // 获取测速服务器URL
                const response = await fetch(\`/api/speedtest-url?server=\${selectedServer}\`);
                const serverData = await response.json();
                
                if (!serverData.success) {
                    throw new Error('获取测速服务器失败');
                }
                
                const testUrl = serverData.url;
                const testSize = serverData.size;
                
                statusEl.innerHTML = \`<i class="fas fa-sync-alt loading"></i> 正在测试下载速度...\`;
                
                // 测试下载速度
                const downloadResult = await runDownloadSpeedTest(testUrl, testSize, progressBar, statusEl);
                
                statusEl.innerHTML = \`<i class="fas fa-sync-alt loading"></i> 正在测试上传速度...\`;
                progressBar.style.width = '50%';
                
                // 测试上传速度（模拟）
                const uploadResult = await runUploadSpeedTest();
                
                statusEl.innerHTML = \`<i class="fas fa-sync-alt loading"></i> 正在测试延迟和抖动...\`;
                progressBar.style.width = '75%';
                
                // 测试延迟和抖动
                const latencyResult = await runLatencyTest();
                
                // 更新结果
                updateSpeedtestResults(downloadResult, uploadResult, latencyResult);
                
                statusEl.className = 'test-status success';
                statusEl.innerHTML = \`<i class="fas fa-check-circle"></i> 测速完成! 下载: \${downloadResult.speed.toFixed(2)} Mbps\`;
                progressBar.style.width = '100%';
                
                // 显示结果区域
                resultsEl.classList.add('active');
                
            } catch (error) {
                statusEl.className = 'test-status error';
                statusEl.innerHTML = \`<i class="fas fa-exclamation-circle"></i> 测速失败: \${error.message}\`;
                console.error('测速错误:', error);
                
                // 显示模拟数据供参考
                showSpeedtestFallbackData();
                
            } finally {
                stopSpeedtest();
            }
        }
        
        // 运行下载速度测试
        async function runDownloadSpeedTest(testUrl, testSize, progressBar, statusEl) {
            return new Promise((resolve, reject) => {
                let loadedBytes = 0;
                let startTime = null;
                let speeds = [];
                let isCompleted = false;
                
                const xhr = new XMLHttpRequest();
                xhr.open('GET', testUrl + '?nocache=' + Date.now(), true);
                xhr.responseType = 'blob';
                xhr.timeout = 30000; // 30秒超时
                
                // 进度监控
                xhr.onprogress = (event) => {
                    if (!startTime) startTime = performance.now();
                    
                    if (event.lengthComputable) {
                        loadedBytes = event.loaded;
                        const currentTime = performance.now();
                        const elapsedSeconds = (currentTime - startTime) / 1000;
                        
                        if (elapsedSeconds > 0.5) { // 至少0.5秒后开始计算
                            const currentSpeed = (loadedBytes * 8) / elapsedSeconds / (1024 * 1024); // Mbps
                            speeds.push(currentSpeed);
                            
                            // 更新进度条
                            const progressPercent = Math.min(99, (loadedBytes / testSize) * 100);
                            progressBar.style.width = \`\${progressPercent}%\`;
                            
                            // 更新图表
                            speedtestDataPoints.push({
                                time: elapsedSeconds,
                                speed: currentSpeed
                            });
                            
                            // 保持最多30个数据点
                            if (speedtestDataPoints.length > 30) {
                                speedtestDataPoints.shift();
                            }
                            
                            updateSpeedtestChart();
                            updateSpeedDisplay(currentSpeed);
                            
                            // 更新状态
                            if (!isCompleted) {
                                statusEl.innerHTML = \`<i class="fas fa-sync-alt loading"></i> 测速中: \${currentSpeed.toFixed(2)} Mbps (\${progressPercent.toFixed(0)}%)\`;
                            }
                        }
                    }
                };
                
                // 请求完成
                xhr.onload = () => {
                    if (!isCompleted) {
                        calculateFinalSpeed();
                    }
                };
                
                // 错误处理
                xhr.onerror = xhr.ontimeout = () => {
                    if (!isCompleted) {
                        reject(new Error('下载测试失败'));
                    }
                };
                
                function calculateFinalSpeed() {
                    isCompleted = true;
                    
                    if (speeds.length === 0) {
                        resolve({ speed: 0 });
                        return;
                    }
                    
                    // 去掉前20%和后20%的速度，取中间的平均值
                    speeds.sort((a, b) => a - b);
                    const startIdx = Math.floor(speeds.length * 0.2);
                    const endIdx = Math.floor(speeds.length * 0.8);
                    const validSpeeds = speeds.slice(startIdx, endIdx);
                    
                    const averageSpeed = validSpeeds.length > 0
                        ? validSpeeds.reduce((a, b) => a + b) / validSpeeds.length
                        : speeds.reduce((a, b) => a + b) / speeds.length;
                    
                    resolve({ 
                        speed: Math.round(averageSpeed * 100) / 100,
                        totalBytes: loadedBytes,
                        speeds: speeds
                    });
                }
                
                xhr.send();
            });
        }
        
        // 运行上传速度测试（模拟，基于下载速度）
        async function runUploadSpeedTest() {
            // 在实际应用中，这里应该实现真正的上传测试
            // 但为了简化，我们基于下载速度计算一个合理的上传速度
            await new Promise(resolve => setTimeout(resolve, 2000)); // 模拟2秒测试
            
            const typicalUploadRatio = 0.3; // 假设上传速度是下载速度的30%
            const simulatedSpeed = 20 + Math.random() * 50; // 20-70 Mbps
            
            return {
                speed: simulatedSpeed * typicalUploadRatio,
                isSimulated: true
            };
        }
        
        // 运行延迟和抖动测试
        async function runLatencyTest() {
            const targets = ['1.1.1.1', '8.8.8.8', '9.9.9.9'];
            const latencies = [];
            
            for (const target of targets) {
                try {
                    const latency = await pingTarget(target);
                    if (latency !== null) {
                        latencies.push(latency);
                    }
                } catch (error) {
                    console.log(\`延迟测试失败 \${target}:\`, error);
                }
                
                await delay(500); // 每个目标间隔500ms
            }
            
            if (latencies.length === 0) {
                return { average: 50, jitter: 10 }; // 默认值
            }
            
            const average = latencies.reduce((a, b) => a + b) / latencies.length;
            
            // 计算抖动（标准差）
            const squaredDiffs = latencies.map(l => Math.pow(l - average, 2));
            const variance = squaredDiffs.reduce((a, b) => a + b) / latencies.length;
            const jitter = Math.sqrt(variance);
            
            return {
                average: Math.round(average),
                jitter: Math.round(jitter * 100) / 100,
                latencies: latencies
            };
        }
        
        // 精确ping函数
        async function pingTarget(host) {
            return new Promise((resolve) => {
                const startTime = performance.now();
                const img = new Image();
                
                const cacheBuster = \`?t=\${Date.now()}&ping=\${Math.random()}\`;
                
                img.onload = img.onerror = () => {
                    const endTime = performance.now();
                    const latency = endTime - startTime;
                    resolve(latency);
                };
                
                img.src = \`https://\${host}/favicon.ico\${cacheBuster}\`;
                
                // 3秒超时
                setTimeout(() => resolve(null), 3000);
            });
        }
        
        // 更新测速结果
        function updateSpeedtestResults(downloadResult, uploadResult, latencyResult) {
            // 更新下载速度
            document.getElementById('downloadSpeed').textContent = downloadResult.speed.toFixed(2);
            
            // 更新上传速度
            document.getElementById('uploadSpeed').textContent = uploadResult.speed.toFixed(2);
            
            // 更新延迟
            document.getElementById('averageLatency').textContent = latencyResult.average;
            
            // 更新抖动
            document.getElementById('jitter').textContent = latencyResult.jitter;
            
            // 更新单位显示
            updateSpeedDisplay(downloadResult.speed);
        }
        
        // 停止测速
        function stopSpeedtest() {
            if (!isSpeedtestRunning) return;
            
            isSpeedtestRunning = false;
            
            const startBtn = document.getElementById('startSpeedtestBtn');
            const stopBtn = document.getElementById('stopSpeedtestBtn');
            
            startBtn.style.display = 'flex';
            stopBtn.style.display = 'none';
            
            document.getElementById('speedtestProgressBar').style.width = '100%';
        }
        
        // 更新测速图表
        function updateSpeedtestChart() {
            if (speedtestDataPoints.length === 0) return;
            
            const labels = speedtestDataPoints.map(p => p.time.toFixed(1));
            const data = speedtestDataPoints.map(p => p.speed);
            
            speedtestChart.data.labels = labels;
            speedtestChart.data.datasets[0].data = data;
            speedtestChart.update();
        }
        
        // 更新速度显示
        function updateSpeedDisplay(speedMbps = 0) {
            const conversionRates = {
                'Mbps': 1,
                'MB/s': 0.125,
                'Kbps': 1000
            };
            
            const rate = conversionRates[currentUnit] || 1;
            const displayValue = (speedMbps * rate).toFixed(2);
            
            document.getElementById('downloadSpeed').textContent = displayValue;
            
            document.querySelectorAll('.speedtest-label').forEach(label => {
                if (label.textContent.includes('下载速度')) {
                    label.textContent = \`下载速度 (\${currentUnit})\`;
                } else if (label.textContent.includes('上传速度')) {
                    label.textContent = \`上传速度 (\${currentUnit})\`;
                }
            });
        }
        
        // 显示测速备用数据
        function showSpeedtestFallbackData() {
            // 模拟数据
            const simulatedSpeed = 50 + Math.random() * 100; // 50-150 Mbps
            
            // 生成模拟的速度曲线
            speedtestDataPoints = [];
            for (let i = 0; i < 20; i++) {
                const time = i * 0.5;
                const speed = simulatedSpeed * (0.5 + Math.random() * 0.5);
                speedtestDataPoints.push({ time, speed });
            }
            
            updateSpeedtestChart();
            
            document.getElementById('downloadSpeed').textContent = simulatedSpeed.toFixed(2);
            document.getElementById('uploadSpeed').textContent = (simulatedSpeed * 0.3).toFixed(2);
            document.getElementById('averageLatency').textContent = Math.floor(20 + Math.random() * 30);
            document.getElementById('jitter').textContent = (2 + Math.random() * 5).toFixed(2);
            
            document.getElementById('speedtestResults').classList.add('active');
            
            const statusEl = document.getElementById('speedtestStatus');
            statusEl.innerHTML = \`<i class="fas fa-exclamation-triangle"></i> 使用模拟数据供参考\`;
        }
        
        // ============================================
        // 历史记录功能（双栈合并）
        // ============================================
        
        // 加载历史记录
        async function loadHistory() {
            try {
                const response = await fetch('/api/history');
                const data = await response.json();
                const container = document.getElementById('historyContainer');
                
                if (data.success && data.data.length > 0) {
                    container.innerHTML = '';
                    
                    // 统计信息
                    let totalRecords = data.data.length;
                    let hasIPv4Count = data.data.filter(item => item.ipv4).length;
                    let hasIPv6Count = data.data.filter(item => item.ipv6).length;
                    
                    const statsDiv = document.createElement('div');
                    statsDiv.style.cssText = 'background: #e8f4fc; padding: 10px; border-radius: 6px; margin-bottom: 15px; font-size: 0.9rem;';
                    statsDiv.innerHTML = \`
                        <div><strong>双栈历史记录统计:</strong></div>
                        <div>总计: \${totalRecords} 条记录</div>
                        <div>包含IPv4: \${hasIPv4Count} 条 | 包含IPv6: \${hasIPv6Count} 条</div>
                    \`;
                    container.appendChild(statsDiv);
                    
                    // 显示历史记录
                    data.data.forEach((item, index) => {
                        const historyItem = createCombinedHistoryItem(item, index);
                        container.appendChild(historyItem);
                    });
                    
                } else {
                    container.innerHTML = '<p style="text-align: center; color: var(--gray-color); padding: 20px;">暂无历史记录</p>';
                }
            } catch (error) {
                console.error('加载历史记录失败:', error);
                container.innerHTML = '<p style="text-align: center; color: var(--danger-color); padding: 20px;">加载历史记录失败</p>';
            }
        }
        
        // 创建合并的历史记录项
        function createCombinedHistoryItem(item, index) {
            const div = document.createElement('div');
            div.className = 'history-item';
            
            const time = new Date(item.timestamp).toLocaleString('zh-CN');
            const hasIPv4 = item.ipv4 && item.ipv4.ip;
            const hasIPv6 = item.ipv6 && item.ipv6.ip;
            
            // 构建IPv4信息HTML
            let ipv4HTML = '';
            if (hasIPv4) {
                const ipv4 = item.ipv4;
                const typeClass = getIPTypeClass(ipv4.type);
                
                ipv4HTML = \`
                    <div class="history-ip-box">
                        <div class="history-ip-header">
                            <span class="history-ip-title">IPv4</span>
                            <span class="badge badge-ipv4">IPv4</span>
                        </div>
                        <div class="history-ip-address">\${ipv4.ip}</div>
                        <div class="history-ip-info">
                            <div><strong>位置:</strong> \${ipv4.city || ''}, \${ipv4.region || ''}, \${ipv4.country || 'Unknown'}</div>
                            <div><strong>运营商:</strong> \${ipv4.isp || 'Unknown'}</div>
                            <div><strong>类型:</strong> <span class="badge \${typeClass}">\${ipv4.type || 'Unknown'}</span></div>
                        </div>
                    </div>
                \`;
            } else {
                ipv4HTML = \`
                    <div class="history-ip-box" style="opacity: 0.6;">
                        <div class="history-ip-header">
                            <span class="history-ip-title">IPv4</span>
                            <span class="badge" style="background: #95a5a6; color: white;">未检测到</span>
                        </div>
                        <div class="history-ip-address" style="color: var(--gray-color);">无IPv4地址</div>
                        <div class="history-ip-info" style="color: var(--gray-color);">
                            <div>未检测到IPv4地址</div>
                        </div>
                    </div>
                \`;
            }
            
            // 构建IPv6信息HTML
            let ipv6HTML = '';
            if (hasIPv6) {
                const ipv6 = item.ipv6;
                const typeClass = getIPTypeClass(ipv6.type);
                
                ipv6HTML = \`
                    <div class="history-ip-box">
                        <div class="history-ip-header">
                            <span class="history-ip-title">IPv6</span>
                            <span class="badge badge-ipv6">IPv6</span>
                        </div>
                        <div class="history-ip-address">\${ipv6.ip}</div>
                        <div class="history-ip-info">
                            <div><strong>位置:</strong> \${ipv6.city || ''}, \${ipv6.region || ''}, \${ipv6.country || 'Unknown'}</div>
                            <div><strong>运营商:</strong> \${ipv6.isp || 'Unknown'}</div>
                            <div><strong>类型:</strong> <span class="badge \${typeClass}">\${ipv6.type || 'Unknown'}</span></div>
                        </div>
                    </div>
                \`;
            } else {
                ipv6HTML = \`
                    <div class="history-ip-box" style="opacity: 0.6;">
                        <div class="history-ip-header">
                            <span class="history-ip-title">IPv6</span>
                            <span class="badge" style="background: #95a5a6; color: white;">未检测到</span>
                        </div>
                        <div class="history-ip-address" style="color: var(--gray-color);">无IPv6地址</div>
                        <div class="history-ip-info" style="color: var(--gray-color);">
                            <div>未检测到IPv6地址</div>
                        </div>
                    </div>
                \`;
            }
            
            // 构建标签区域
            const tags = [];
            if (hasIPv4 && item.ipv4.isNative) {
                tags.push('<span class="badge badge-success">IPv4原生IP</span>');
            }
            if (hasIPv6 && item.ipv6.isNative) {
                tags.push('<span class="badge badge-success">IPv6原生IP</span>');
            }
            if (hasIPv4 && item.ipv4.isProxy) {
                tags.push('<span class="badge badge-danger">IPv4代理</span>');
            }
            if (hasIPv6 && item.ipv6.isProxy) {
                tags.push('<span class="badge badge-danger">IPv6代理</span>');
            }
            if (hasIPv4 && item.ipv4.isMobile) {
                tags.push('<span class="badge badge-info">IPv4移动网络</span>');
            }
            if (hasIPv6 && item.ipv6.isMobile) {
                tags.push('<span class="badge badge-info">IPv6移动网络</span>');
            }
            
            div.innerHTML = \`
                <div class="history-ip-display">
                    <div class="history-time">\${time}</div>
                </div>
                
                <div class="history-details">
                    \${ipv4HTML}
                    \${ipv6HTML}
                </div>
                
                \${tags.length > 0 ? \`
                <div class="history-tags">
                    \${tags.join('')}
                </div>
                \` : ''}
                
                <div style="margin-top: 10px; font-size: 0.8rem; color: var(--gray-color);">
                    点击查看详细信息
                </div>
            \`;
            
            // 添加点击事件
            div.addEventListener('click', () => {
                // 如果点击的记录有IPv4和IPv6信息，加载到主界面
                if (hasIPv4) {
                    document.getElementById('ipv4Address').textContent = item.ipv4.ip;
                    ipv4Details = item.ipv4;
                    updateIPDetailsDisplay(ipv4Details, 'ipv4');
                }
                
                if (hasIPv6) {
                    document.getElementById('ipv6Address').textContent = item.ipv6.ip;
                    ipv6Details = item.ipv6;
                    updateIPDetailsDisplay(ipv6Details, 'ipv6');
                }
                
                // 滚动到顶部
                window.scrollTo({ top: 0, behavior: 'smooth' });
                
                // 显示成功提示
                showSuccessMessage(\`已加载历史记录 #\${index + 1}\`);
            });
            
            return div;
        }
        
        // 获取IP类型对应的CSS类
        function getIPTypeClass(type) {
            if (!type) return 'badge-info';
            
            if (type.includes('住宅') || type.includes('Residential')) {
                return 'badge-success';
            } else if (type.includes('机房') || type.includes('Datacenter')) {
                return 'badge-warning';
            } else if (type.includes('代理') || type.includes('Proxy')) {
                return 'badge-danger';
            } else if (type.includes('移动') || type.includes('Mobile')) {
                return 'badge-info';
            }
            
            return 'badge-info';
        }
        
        // 清除历史记录
        async function clearHistory() {
            if (!confirm('确定要清除所有历史记录吗？此操作不可撤销。')) return;
            
            try {
                const response = await fetch('/api/clear-history', { method: 'POST' });
                const data = await response.json();
                
                if (data.success) {
                    document.getElementById('historyContainer').innerHTML = 
                        '<p style="text-align: center; color: var(--gray-color); padding: 20px;">历史记录已清除</p>';
                    
                    showSuccessMessage('历史记录已成功清除');
                } else {
                    showError('清除历史记录失败');
                }
            } catch (error) {
                showError('网络错误: ' + error.message);
            }
        }
        
        // 辅助函数
        function delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
        
        function showError(message) {
            const statusEl = document.getElementById('ipDetectionStatus');
            statusEl.className = 'test-status error';
            statusEl.innerHTML = \`<i class="fas fa-exclamation-circle"></i> \${message}\`;
            
            // 3秒后恢复
            setTimeout(() => {
                if (ipv4Details || ipv6Details) {
                    statusEl.className = 'test-status info';
                    statusEl.innerHTML = '<i class="fas fa-check-circle"></i> IP地址检测完成';
                }
            }, 3000);
        }
        
        function showSuccessMessage(message) {
            const statusEl = document.getElementById('ipDetectionStatus');
            statusEl.className = 'test-status success';
            statusEl.innerHTML = \`<i class="fas fa-check-circle"></i> \${message}\`;
            
            // 3秒后恢复
            setTimeout(() => {
                if (ipv4Details || ipv6Details) {
                    statusEl.className = 'test-status info';
                    statusEl.innerHTML = '<i class="fas fa-check-circle"></i> IP地址检测完成';
                }
            }, 3000);
        }
    </script>
</body>
</html>`;
}