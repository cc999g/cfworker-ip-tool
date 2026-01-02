# 双栈IP查询与测速工具
![GitHub](https://img.shields.io/github/license/cc999g/cfworker-ip-tool)
![GitHub last commit](https://img.shields.io/github/last-commit/cc999g/cfworker-ip-tool)
![GitHub stars](https://img.shields.io/github/stars/cc999g/cfworker-ip-tool?style=social)

一个基于Cloudflare Workers构建的双栈IP查询与测速工具，支持IPv4和IPv6地址检测、延迟测试和Speedtest网速测试。

![界面截图](https://via.placeholder.com/800x400.png?text=双栈IP查询工具界面)

🔧 技术栈
前端: HTML5、CSS3、JavaScript (ES6+)

后端: Cloudflare Workers

图表: Chart.js

图标: Font Awesome

存储: Cloudflare KV


🔐 API端点
Worker API
GET / - 主页面

GET /api/ipinfo - IP信息查询

GET /api/ping-targets - 获取延迟测试目标

GET /api/speedtest-servers - 获取测速服务器

POST /api/save-history - 保存历史记录

GET /api/history - 获取历史记录

POST /api/clear-history - 清除历史记录

📱 使用说明
检测IP地址: 访问页面自动检测IPv4和IPv6地址

延迟测试: 点击"开始延迟测试"按钮测试网络延迟

网速测试: 选择测速服务器后开始测速

查看历史: 点击历史记录可以重新加载IP信息

清除历史: 点击清除按钮可以删除所有历史记录

🔗 数据来源
IP查询API
api.ip.sb - 提供详细的地理位置信息

ip-api.com - 提供代理/托管信息

freeipapi.com - 提供额外的IP类型信息

测速服务器（测速未完善）
Cloudflare: speed.cloudflare.com

OVH Network: proof.ovh.net

Speedtest: speedtest.sjc01.softlayer.com

📄 许可证
本项目采用 MIT 许可证 - 查看 LICENSE 文件了解详情。

🙏 致谢
Cloudflare Workers - 提供无服务器计算平台

Chart.js - 提供图表展示

Font Awesome - 提供图标资源

🤝 贡献
欢迎提交 Issue 和 Pull Request！

Fork 项目

创建功能分支 (git checkout -b feature/AmazingFeature)

提交更改 (git commit -m 'Add some AmazingFeature')

推送到分支 (git push origin feature/AmazingFeature)

开启 Pull Request

📞 联系
GitHub: cc999g

邮箱: yai@z.org

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

### 🚀 网速测试
- **多服务器选择**: Cloudflare、OVH、Speedtest
- **下载速度测试**: 使用多个备用测速源（未完善）
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


