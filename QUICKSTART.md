# 快速开始 / Quick Start

> **注意**: 如果你的仓库已经推送到 GitHub，只是需要添加 validator 智能合约，请查看 [ADD_VALIDATOR.md](ADD_VALIDATOR.md)

## 场景 1: 添加 Validator 到已有仓库（推荐）

如果你已经推送了 signer 服务，现在想添加 validator 智能合约：

```bash
# 克隆你的仓库
git clone https://github.com/fanhousanbu/YetAnotherAA-Signer.git
cd YetAnotherAA-Signer

# 使用自动化脚本
bash /tmp/YetAnotherAA-Signer/update-with-validator.sh

# 或手动复制
cp -r /tmp/YetAnotherAA-Signer/validator ./
cp /tmp/YetAnotherAA-Signer/.gitmodules ./
git add .
git commit -m "Add validator smart contracts with submodules"
git push origin master
```

详细步骤请参考 [ADD_VALIDATOR.md](ADD_VALIDATOR.md)。

## 场景 2: 全新推送到 GitHub

如果你的文件在 `/tmp/YetAnotherAA-Signer`，执行以下命令：

```bash
cd /tmp/YetAnotherAA-Signer

# 初始化并推送
git init
git add .
git commit -m "Initial commit: Extract signer from YetAnotherAA monorepo"
git remote add origin https://github.com/fanhousanbu/YetAnotherAA-Signer.git
git branch -M master
git push -u origin master
```

## 从主仓库导出（替代方法）

如果你想直接从主仓库导出 signer 目录：

```bash
# 在主仓库目录
cd /Users/chao/Codes/YetAnotherAA

# 创建临时目录
mkdir -p /tmp/YetAnotherAA-Signer

# 复制 signer 目录
cp -r signer/* /tmp/YetAnotherAA-Signer/
cp signer/.env.example /tmp/YetAnotherAA-Signer/
cp signer/.gitignore /tmp/YetAnotherAA-Signer/
cp signer/.eslintrc.cjs /tmp/YetAnotherAA-Signer/
cp signer/.prettierignore /tmp/YetAnotherAA-Signer/

# 清理不需要的文件
cd /tmp/YetAnotherAA-Signer
rm -rf node_modules dist

# 初始化新仓库
git init
git add .
git commit -m "Initial commit: Extract signer from YetAnotherAA monorepo"
git remote add origin https://github.com/fanhousanbu/YetAnotherAA-Signer.git
git branch -M master
git push -u origin master
```

## 本地测试

推送前测试代码是否正常工作：

```bash
cd /tmp/YetAnotherAA-Signer

# 安装依赖
npm install

# 类型检查
npm run type-check

# 代码检查
npm run lint:check

# 格式检查
npm run format:check

# 构建
npm run build

# 如果一切正常，执行推送
```

## 验证清单

推送前确认：

- [ ] README.md 更新完成
- [ ] package.json 配置正确
- [ ] LICENSE 文件存在
- [ ] .gitignore 排除了敏感文件
- [ ] node_modules 和 dist 已删除
- [ ] 代码可以成功构建
- [ ] 环境变量示例文件 .env.example 存在

## 下一步

1. 在 GitHub 上创建仓库（如果还没创建）
2. 推送代码
3. 设置 GitHub Actions（可选）
4. 配置部署环境
5. 更新主仓库的文档，指向新的独立仓库
