# 双栈IP查询与测速工具

一个基于Cloudflare Workers构建的双栈IP查询与测速工具，支持IPv4和IPv6地址检测、延迟测试和Speedtest网速测试。



## ✨ 功能特性

### 🔍 IP地址检测
- **双栈IP检测**: 同时检测IPv4和IPv6地址
- **多数据源**: 整合三个IP查询API（api.ip.sb、ip-api.com、freeipapi.com）
- **IP类型分析**: 识别住宅IP、机房IP、代理IP、移动网络
- **原生IP判断**: 特别针对中国原生IP的检测
- **详细地理位置**: 国家、地区、城市、经纬度等

### 📊 延迟测试
- **国内平台**: 百度、阿里云、腾讯云
- **国外可访问站点**: Cloudflare、GitHub
- **国外被屏蔽站点**: Google、Facebook、Twitter
- **实时延迟显示**: 颜色区分延迟质量

### 🚀 网速测试(待完善)
- **多服务器选择**: Cloudflare、OVH、Speedtest
- **下载速度测试**: 使用多个备用测速源
- **实时速度图表**: 使用Chart.js显示速度变化
- **单位切换**: Mbps、MB/s、Kbps
- **完整指标**: 下载速度、上传速度、延迟、抖动

### 📝 历史记录
- **双栈合并存储**: 每条记录同时包含IPv4和IPv6信息
- **智能存储**: 任一协议没有则留空
- **详细信息显示**: IP类型、地理位置、运营商等
- **快速加载**: 点击历史记录可快速加载到主界面

## 🚀 快速开始

### 1. 克隆项目
```bash
git clone https://github.com/cc999g/cfworker-ip-tool.git
cd cfworker-ip-tool
