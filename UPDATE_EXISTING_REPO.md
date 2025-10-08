# 更新已有仓库 - 添加 Validator 智能合约

> 适用于已经将 signer 服务推送到 GitHub 的用户

## 快速开始

### 方式 1: 一键自动化脚本 ⚡（推荐）

```bash
# 克隆你的现有仓库
git clone https://github.com/fanhousanbu/YetAnotherAA-Signer.git
cd YetAnotherAA-Signer

# 运行自动化脚本
bash /tmp/YetAnotherAA-Signer/update-with-validator.sh

# 检查更改
git status

# 提交并推送
git commit -m "Add validator smart contracts with submodules

- AAStarValidator: BLS signature verification
- AAStarAccount: ERC-4337 accounts (v0.6/v0.7/v0.8)
- AAStarAccountFactory: Account creation factories
- Deployment scripts and documentation
- Git submodules for Foundry dependencies"

git push origin master
```

### 方式 2: 手动步骤

```bash
# 1. 克隆现有仓库
git clone https://github.com/fanhousanbu/YetAnotherAA-Signer.git
cd YetAnotherAA-Signer

# 2. 复制 validator 目录和配置
cp -r /tmp/YetAnotherAA-Signer/validator ./
cp /tmp/YetAnotherAA-Signer/.gitmodules ./
cp /tmp/YetAnotherAA-Signer/ADD_VALIDATOR.md ./
cp /tmp/YetAnotherAA-Signer/README.md ./
cp /tmp/YetAnotherAA-Signer/DEPLOYMENT.md ./
cp /tmp/YetAnotherAA-Signer/QUICKSTART.md ./

# 3. 清理不需要的文件
rm -rf validator/lib/*

# 4. 添加 Git Submodules
git submodule add https://github.com/foundry-rs/forge-std validator/lib/forge-std
git submodule add https://github.com/OpenZeppelin/openzeppelin-contracts validator/lib/openzeppelin-contracts
git submodule add https://github.com/eth-infinitism/account-abstraction validator/lib/account-abstraction

# 5. 更新 submodules
git submodule update --init --recursive

# 6. 添加所有文件
git add .

# 7. 提交并推送
git commit -m "Add validator smart contracts with submodules"
git push origin master
```

## 验证清单

添加完成后，检查以下内容：

### 在本地检查

```bash
# 1. 检查 submodules 状态
git submodule status

# 应该看到类似输出：
# <commit-hash> validator/lib/forge-std (v1.x.x)
# <commit-hash> validator/lib/openzeppelin-contracts (v5.x.x)
# <commit-hash> validator/lib/account-abstraction (vx.x.x)

# 2. 验证 submodules 内容
ls -la validator/lib/forge-std/src
ls -la validator/lib/openzeppelin-contracts/contracts
ls -la validator/lib/account-abstraction/contracts

# 3. 测试合约构建
cd validator
forge build
cd ..
```

### 在 GitHub 上检查

1. ✅ 访问 https://github.com/fanhousanbu/YetAnotherAA-Signer
2. ✅ 验证 validator/ 目录存在
3. ✅ 进入 validator/lib/ 目录
4. ✅ 应该看到 3 个 submodule（带 @ 符号和 commit hash）
5. ✅ README.md 显示完整的系统架构
6. ✅ 新增了 ADD_VALIDATOR.md 文档

## 克隆测试

让团队成员测试克隆（包含 submodules）：

```bash
# 完整克隆（推荐）
git clone --recursive https://github.com/fanhousanbu/YetAnotherAA-Signer.git

# 或分步克隆
git clone https://github.com/fanhousanbu/YetAnotherAA-Signer.git
cd YetAnotherAA-Signer
git submodule update --init --recursive
```

## 常见问题

### Q1: 脚本提示找不到源目录

```bash
# 确保临时目录存在
ls -la /tmp/YetAnotherAA-Signer/validator

# 如果不存在，从原 YetAnotherAA 仓库复制
cp -r /Users/chao/Codes/YetAnotherAA/validator /tmp/YetAnotherAA-Signer/
```

### Q2: Submodule 添加失败（已存在）

```bash
# 删除现有目录
rm -rf validator/lib/forge-std
rm -rf validator/lib/openzeppelin-contracts
rm -rf validator/lib/account-abstraction

# 删除 git 缓存
git rm --cached validator/lib/forge-std
git rm --cached validator/lib/openzeppelin-contracts
git rm --cached validator/lib/account-abstraction

# 重新添加
git submodule add https://github.com/foundry-rs/forge-std validator/lib/forge-std
git submodule add https://github.com/OpenZeppelin/openzeppelin-contracts validator/lib/openzeppelin-contracts
git submodule add https://github.com/eth-infinitism/account-abstraction validator/lib/account-abstraction
```

### Q3: Submodule 显示为空

```bash
# 初始化并更新
git submodule update --init --recursive

# 或单独更新
cd validator/lib/forge-std && git pull origin master && cd ../../..
```

### Q4: 推送时冲突

```bash
# 拉取远程更改
git pull origin master --rebase

# 解决冲突后
git add .
git rebase --continue
git push origin master
```

## 下一步

添加 validator 后：

1. ✅ **部署合约** - 参考 [validator/README.md](validator/README.md)
   ```bash
   cd validator
   forge script script/DeployAAStarV7.s.sol --broadcast
   ```

2. ✅ **更新 signer 配置** - 使用部署的合约地址
   ```bash
   # 更新 .env 文件
   VALIDATOR_CONTRACT_ADDRESS=0xYourDeployedAddress
   ```

3. ✅ **启动 signer 服务**
   ```bash
   npm install
   npm run build
   npm run start:dev
   ```

4. ✅ **注册签名节点**
   ```bash
   curl -X POST http://localhost:3001/node/register
   ```

## 相关文档

- **ADD_VALIDATOR.md** - 详细的添加指南和故障排除
- **validator/README.md** - 智能合约完整文档
- **DEPLOYMENT.md** - 生产环境部署指南
- **README.md** - 项目总览和架构说明

## 支持

遇到问题？

- 📖 查看 [ADD_VALIDATOR.md](ADD_VALIDATOR.md) 获取详细步骤
- 🐛 提交 Issue: https://github.com/fanhousanbu/YetAnotherAA-Signer/issues
- 📚 主项目: https://github.com/fanhousanbu/YetAnotherAA
