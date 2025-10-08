#!/bin/bash
set -e

echo "🚀 添加 Validator 智能合约到 YetAnotherAA-Signer"
echo "================================================"

# 检查是否在仓库目录中
if [ ! -d ".git" ]; then
    echo "❌ 错误: 当前目录不是 git 仓库"
    echo "请先克隆仓库: git clone https://github.com/fanhousanbu/YetAnotherAA-Signer.git"
    exit 1
fi

# 拉取最新代码
echo "📥 拉取最新代码..."
git pull origin master

# 复制 validator 目录
echo "📂 复制 validator 目录..."
if [ -d "/tmp/YetAnotherAA-Signer/validator" ]; then
    cp -r /tmp/YetAnotherAA-Signer/validator ./
    echo "✅ 从 /tmp/YetAnotherAA-Signer 复制完成"
elif [ -d "/Users/chao/Codes/YetAnotherAA/validator" ]; then
    cp -r /Users/chao/Codes/YetAnotherAA/validator ./
    echo "✅ 从原 YetAnotherAA 仓库复制完成"
else
    echo "❌ 错误: 找不到 validator 源目录"
    exit 1
fi

# 清理编译产物
echo "🧹 清理编译产物..."
rm -rf validator/out validator/cache validator/broadcast validator/node_modules

# 复制 .gitmodules
echo "📝 复制 .gitmodules..."
if [ -f "/tmp/YetAnotherAA-Signer/.gitmodules" ]; then
    cp /tmp/YetAnotherAA-Signer/.gitmodules ./
elif [ -f "/Users/chao/Codes/YetAnotherAA/.gitmodules" ]; then
    cp /Users/chao/Codes/YetAnotherAA/.gitmodules ./
fi

# 清理现有的 lib 目录
echo "🧹 清理 validator/lib..."
rm -rf validator/lib/*

# 添加 git submodules
echo "📦 添加 Git Submodules..."
git submodule add -f https://github.com/foundry-rs/forge-std validator/lib/forge-std 2>/dev/null || echo "⚠️  forge-std submodule 已存在"
git submodule add -f https://github.com/OpenZeppelin/openzeppelin-contracts validator/lib/openzeppelin-contracts 2>/dev/null || echo "⚠️  openzeppelin-contracts submodule 已存在"
git submodule add -f https://github.com/eth-infinitism/account-abstraction validator/lib/account-abstraction 2>/dev/null || echo "⚠️  account-abstraction submodule 已存在"

# 更新 submodules
echo "🔄 更新 Submodules..."
git submodule update --init --recursive

# 更新文档
echo "📚 更新文档..."
if [ -f "/tmp/YetAnotherAA-Signer/README.md" ]; then
    cp /tmp/YetAnotherAA-Signer/README.md ./
    echo "✅ README.md 已更新"
fi

if [ -f "/tmp/YetAnotherAA-Signer/DEPLOYMENT.md" ]; then
    cp /tmp/YetAnotherAA-Signer/DEPLOYMENT.md ./
    echo "✅ DEPLOYMENT.md 已更新"
fi

if [ -f "/tmp/YetAnotherAA-Signer/ADD_VALIDATOR.md" ]; then
    cp /tmp/YetAnotherAA-Signer/ADD_VALIDATOR.md ./
    echo "✅ ADD_VALIDATOR.md 已添加"
fi

# 添加所有文件
echo "➕ 添加文件到 Git..."
git add .gitmodules validator/ README.md DEPLOYMENT.md ADD_VALIDATOR.md 2>/dev/null || true

# 显示状态
echo ""
echo "📊 Git 状态:"
git status

echo ""
echo "✅ 准备完成！"
echo ""
echo "下一步:"
echo "1. 检查上面的 git status 输出"
echo "2. 执行提交: git commit -m 'Add validator smart contracts with submodules'"
echo "3. 推送到 GitHub: git push origin master"
echo ""
echo "详细说明请参考 ADD_VALIDATOR.md"
