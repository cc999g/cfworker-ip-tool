# 双栈IP查询与测速工具

一个基于Cloudflare Workers构建的现代化IP查询与网络诊断工具，支持IPv4/IPv6双栈检测、延迟测试和网速测量。

## ✨ 功能特性

### 🔍 IP地址检测
- **双栈IP检测**: 同时检测IPv4和IPv6地址
- **多数据源验证**: 整合三个IP查询API提供准确信息
- **IP类型分析**: 识别住宅IP、机房IP、代理IP、移动网络
- **原生IP判断**: 特别针对中国原生IP的检测
- **详细地理位置**: 国家、地区、城市、经纬度等

### 📊 延迟测试
- **国内平台**: 百度、阿里云、腾讯云
- **国外可访问站点**: Cloudflare、GitHub
- **国外被屏蔽站点**: Google、Facebook、Twitter
- **实时延迟显示**: 颜色区分延迟质量

### 🚀 网速测试
- **多服务器选择**: Cloudflare、OVH、Speedtest
- **实时速度图表**: 使用Chart.js可视化速度变化
- **单位切换**: 支持Mbps、MB/s、Kbps自动转换
- **完整指标**: 下载速度、上传速度、延迟、抖动

### 📝 历史记录
- **智能存储**: 每条记录同时包含IPv4和IPv6信息
- **快速加载**: 点击历史记录一键重新加载
- **本地化存储**: 使用Cloudflare KV持久化存储

## 🛠️ 技术栈
```
| 组件 | 技术 |
|------|------|
| **前端** | HTML5, CSS3, JavaScript (ES6+) |
| **后端** | Cloudflare Workers |
| **图表** | Chart.js |
| **图标** | Font Awesome 6.0 |
| **存储** | Cloudflare KV |
| **样式** | 自定义响应式CSS |
```
## 🚀 快速部署

### 1. 准备环境
```
安装Wrangler CLI
npm install -g wrangler
```
### 2. 配置项目
```
登录Cloudflare
wrangler login

创建KV命名空间
wrangler kv:namespace create "IP_HISTORY_KV"
```
### 3. 部署步骤

1. 将worker.js文件内容复制到Cloudflare Workers编辑器
2. 在Workers设置中绑定KV命名空间，名称为`IP_HISTORY_KV`
3. 发布Worker

### 4. 访问应用
部署完成后，访问你的Worker域名即可使用。

## 📖 使用方法

### 主要功能操作

1. **IP地址检测**
   - 页面加载后自动检测IPv4和IPv6地址
   - 显示详细的IP类型和地理位置信息
   - 点击"重新检测IP"按钮可以重新检测

2. **延迟测试**
   - 点击"开始延迟测试"按钮
   - 系统会自动测试预设的8个目标节点
   - 结果以颜色区分延迟质量

3. **网速测试**
   - 点击"开始网速测试"按钮
   - 选择测速服务器（默认Cloudflare）
   - 点击"开始测速"按钮开始测试
   - 实时显示下载速度和进度图表

4. **历史记录管理**
   - 每次检测后自动保存到历史记录
   - 点击历史记录项可重新加载该次检测
   - 点击清除按钮删除所有历史记录

## 🔧 API端点
```
### Worker API
- GET / - 主页面
- GET /api/ipinfo - IP信息查询
- GET /api/ping-targets - 获取延迟测试目标
- GET /api/speedtest-servers - 获取测速服务器列表
- POST /api/save-history - 保存历史记录到KV
- GET /api/history - 获取历史记录列表
- POST /api/clear-history - 清除所有历史记录
```
### 请求示例
```
// 获取IP信息
fetch('/api/ipinfo?ip=8.8.8.8&version=IPv4')
  .then(response => response.json())
  .then(data => console.log(data));

// 保存历史记录
fetch('/api/save-history', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    timestamp: Date.now(),
    ipv4: ipv4Data,
    ipv6: ipv6Data
  })
});
```

## 📊 数据来源

### IP查询API
1. **api.ip.sb** - 主要信息源，提供基础IP信息
2. **ip-api.com** - 补充信息，特别是代理检测
3. **freeipapi.com** - IP类型判断和运营商信息

### 测速服务器
1. **Cloudflare** - speed.cloudflare.com (全球分布)
2. **OVH Network** - proof.ovh.net (法国)
3. **Speedtest** - speedtest.sjc01.softlayer.com (美国)

## 🏗️ 项目结构
```
双栈IP查询与测速工具/
├── worker.js                 # Cloudflare Worker主文件，包含所有逻辑
├── README.md                # 项目说明文档
└── 配置文件说明
    ├── 需要创建Cloudflare KV命名空间: IP_HISTORY_KV
    └── 需要绑定到Worker的KV命名空间
```
### worker.js 文件结构说明
```
worker.js
├── 配置部分
│   ├── PING_TARGETS: 延迟测试目标配置
│   ├── SPEEDTEST_SERVERS: 测速服务器配置
│   └── LATENCY_TARGETS: 延迟测试目标
├── 事件监听器
│   └── handleRequest: 主请求处理器
├── API路由处理
│   ├── handleApiRequest: API请求分发
│   ├── /api/ipinfo: IP信息查询
│   ├── /api/ping-targets: 获取延迟测试目标
│   ├── /api/speedtest-servers: 获取测速服务器
│   ├── /api/speedtest-url: 获取测速URL
│   ├── /api/save-history: 保存合并历史记录
│   ├── /api/history: 获取历史记录
│   └── /api/clear-history: 清除历史记录
├── 核心功能函数
│   ├── getIPInfo: 调用三个API获取IP信息
│   ├── saveCombinedHistory: 保存双栈历史记录
│   ├── getHistory: 获取历史记录
│   └── clearHistory: 清除历史记录
├── 辅助函数
│   ├── jsonResponse: JSON响应封装
│   ├── getIPType: IP类型判断
│   └── checkNativeIP: 原生IP判断
└── HTML生成函数
    └── getHTML: 生成完整的HTML页面
```

## 🤝 贡献指南

### 报告问题
1. 在Issues页面查看是否已有类似问题
2. 创建新的Issue，详细描述问题或建议
3. 提供复现步骤和环境信息

### 提交代码
1. Fork项目到你的GitHub账户
2. 创建功能分支
3. 提交更改
4. 推送到分支
5. 创建Pull Request

### 开发规范
- 使用ES6+语法
- 添加必要的注释
- 确保代码通过基础测试
- 更新相关文档

## 📄 许可证

本项目基于MIT许可证开源。

## 🙏 致谢

感谢以下项目和服务：
- [Cloudflare Workers](https://workers.cloudflare.com/) - 无服务器计算平台
- [Chart.js](https://www.chartjs.org/) - 数据可视化库
- [Font Awesome](https://fontawesome.com/) - 图标库
- 所有提供IP查询API的服务商
