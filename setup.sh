#!/bin/bash

# 双栈IP查询工具 - 一键部署脚本

echo "🎯 双栈IP查询工具部署脚本"
echo "=========================="

# 1. 检查依赖
echo "1. 检查系统依赖..."
if ! command -v git &> /dev/null; then
    echo "❌ Git未安装，请先安装Git"
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo "❌ Node.js未安装，请先安装Node.js"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "❌ npm未安装，请先安装npm"
    exit 1
fi

echo "✅ 依赖检查完成"

# 2. 克隆或创建项目
echo ""
echo "2. 准备项目文件..."
if [ ! -d "cfworker-ip-tool" ]; then
    mkdir cfworker-ip-tool
fi

cd cfworker-ip-tool

# 3. 初始化项目
echo "3. 初始化项目..."
npm init -y

# 4. 安装依赖
echo "4. 安装依赖..."
npm install wrangler --save-dev

# 5. 创建目录结构
echo "5. 创建项目结构..."
mkdir -p src public docs

echo "✅ 项目初始化完成"
echo ""
echo "🎉 下一步："
echo "1. 将worker.js代码复制到src/目录"
echo "2. 配置wrangler.toml文件"
echo "3. 运行: npm run deploy"