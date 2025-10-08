# 部署指南 / Deployment Guide

本指南将帮助你将 YetAnotherAA-Signer 推送到 GitHub 并进行完整的生产环境部署，包括智能合约和签名服务。

## 步骤 1: 在 GitHub 上创建仓库

1. 访问 https://github.com/new
2. 仓库名称：`YetAnotherAA-Signer`
3. 描述：`Production-ready BLS signature aggregation service for ERC-4337 account abstraction`
4. 选择 **Public**（或根据需要选择 Private）
5. **不要**初始化 README、.gitignore 或 LICENSE（我们已经准备好了）
6. 点击 "Create repository"

## 步骤 2: 推送代码到 GitHub

在终端中执行以下命令：

```bash
# 进入准备好的目录
cd /tmp/YetAnotherAA-Signer

# 初始化 git 仓库
git init

# 添加所有文件
git add .

# 创建初始提交
git commit -m "Initial commit: Extract signer from YetAnotherAA monorepo

- BLS12-381 signature aggregation service
- Smart contracts for on-chain verification (Solidity)
- Gossip network for multi-node coordination
- On-chain node registration
- KMS integration support
- NestJS-based RESTful API
- ERC-4337 compatible (v0.6/v0.7/v0.8)
- Complete documentation and examples"

# 添加远程仓库
git remote add origin https://github.com/fanhousanbu/YetAnotherAA-Signer.git

# 推送到 GitHub
git branch -M master
git push -u origin master
```

## 步骤 3: 验证部署

访问 https://github.com/fanhousanbu/YetAnotherAA-Signer 确认：

- ✅ README.md 正确显示
- ✅ LICENSE 文件存在
- ✅ 所有源代码文件都已上传
- ✅ .gitignore 正确排除了 node_modules 和敏感文件

## 步骤 4: 部署智能合约

在部署签名服务之前，必须先部署智能合约。

### 4.1 安装 Foundry

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

### 4.2 部署 Validator 合约

```bash
cd validator

# 安装依赖
forge install

# 设置环境变量
export ETH_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY
export ETH_PRIVATE_KEY=your_deployer_private_key

# 部署到 Sepolia (v0.7 示例)
forge script script/DeployAAStarV7.s.sol:DeployAAStarV7 \
  --rpc-url $ETH_RPC_URL \
  --private-key $ETH_PRIVATE_KEY \
  --broadcast \
  --legacy

# 记录部署的合约地址
# VALIDATOR_CONTRACT_ADDRESS: 0x...
# FACTORY_CONTRACT_ADDRESS: 0x...
```

### 4.3 验证合约（可选但推荐）

```bash
# 在 Etherscan 上验证合约
forge verify-contract \
  --chain-id 11155111 \
  --constructor-args $(cast abi-encode "constructor(address)" $ENTRY_POINT) \
  $VALIDATOR_CONTRACT_ADDRESS \
  src/AAStarValidator.sol:AAStarValidator \
  --etherscan-api-key $ETHERSCAN_API_KEY
```

详细的合约部署说明请参考 [validator/README.md](validator/README.md)。

## 步骤 5: 配置签名服务

克隆仓库并配置签名服务：

```bash
# 克隆仓库
git clone https://github.com/fanhousanbu/YetAnotherAA-Signer.git
cd YetAnotherAA-Signer

# 安装依赖
npm install

# 复制环境变量配置
cp .env.example .env

# 编辑 .env 填入配置（重要！）
# 必须设置从步骤4获得的 VALIDATOR_CONTRACT_ADDRESS
nano .env
```

在 `.env` 中配置：

```bash
# 使用步骤4部署的合约地址
VALIDATOR_CONTRACT_ADDRESS=0xYourDeployedValidatorAddress

# 其他配置
ETH_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY
ETH_PRIVATE_KEY=your_private_key
```

测试运行：

```bash
# 构建项目
npm run build

# 启动开发服务器测试
npm run start:dev
```

## 步骤 6: 生产环境部署

### 使用 Docker（推荐）

创建 `Dockerfile`:

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3001

CMD ["npm", "run", "start:prod"]
```

创建 `docker-compose.yml` 用于多节点部署:

```yaml
version: '3.8'

services:
  signer-node-1:
    build: .
    environment:
      - NODE_STATE_FILE=/app/data/node_001.json
      - PORT=3001
      - GOSSIP_PUBLIC_URL=ws://signer-node-1:3001/ws
      - GOSSIP_BOOTSTRAP_PEERS=ws://signer-node-2:3002/ws,ws://signer-node-3:3003/ws
    ports:
      - "3001:3001"
    volumes:
      - ./data/node_001.json:/app/data/node_001.json

  signer-node-2:
    build: .
    environment:
      - NODE_STATE_FILE=/app/data/node_002.json
      - PORT=3002
      - GOSSIP_PUBLIC_URL=ws://signer-node-2:3002/ws
      - GOSSIP_BOOTSTRAP_PEERS=ws://signer-node-1:3001/ws,ws://signer-node-3:3003/ws
    ports:
      - "3002:3002"
    volumes:
      - ./data/node_002.json:/app/data/node_002.json

  signer-node-3:
    build: .
    environment:
      - NODE_STATE_FILE=/app/data/node_003.json
      - PORT=3003
      - GOSSIP_PUBLIC_URL=ws://signer-node-3:3003/ws
      - GOSSIP_BOOTSTRAP_PEERS=ws://signer-node-1:3001/ws,ws://signer-node-2:3002/ws
    ports:
      - "3003:3003"
    volumes:
      - ./data/node_003.json:/app/data/node_003.json
```

部署：

```bash
docker-compose up -d
```

### 使用 PM2

```bash
# 安装 PM2
npm install -g pm2

# 启动多个节点
NODE_STATE_FILE=./node_001.json PORT=3001 pm2 start npm --name "signer-node-1" -- run start:prod
NODE_STATE_FILE=./node_002.json PORT=3002 pm2 start npm --name "signer-node-2" -- run start:prod
NODE_STATE_FILE=./node_003.json PORT=3003 pm2 start npm --name "signer-node-3" -- run start:prod

# 保存配置
pm2 save

# 设置开机自启
pm2 startup
```

## 步骤 7: 注册签名节点到合约

启动签名服务后，需要将节点注册到智能合约：

```bash
# 方式1: 使用 API 注册
curl -X POST http://localhost:3001/node/register

# 方式2: 使用 Foundry 脚本注册（如果有自定义脚本）
# cd validator
# forge script script/RegisterNode.s.sol --rpc-url $ETH_RPC_URL --broadcast
```

验证注册成功：

```bash
# 检查节点信息
curl http://localhost:3001/node/info

# 应该返回 registered: true
```

## 步骤 8: 配置 GitHub Actions（可选）

创建 `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [ master ]
  pull_request:
    branches: [ master ]

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '20'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Type check
      run: npm run type-check
      
    - name: Lint
      run: npm run lint:check
      
    - name: Format check
      run: npm run format:check
      
    - name: Build
      run: npm run build
      
    - name: Test
      run: npm run test:ci
```

## 安全注意事项

### 智能合约安全

1. **合约部署**
   - 使用专用的部署钱包，部署后隔离存储私钥
   - 在测试网充分测试后再部署到主网
   - 考虑使用多签钱包管理合约所有权
   - 在 Etherscan 上验证合约源码

2. **合约升级**
   - AAStarValidator 合约应该是不可升级的（安全优先）
   - 如需升级，部署新合约并迁移节点注册

### 签名服务安全

1. **私钥管理**
   - 生产环境使用 KMS
   - 永远不要提交 `node_*.json` 文件到 git
   - 使用环境变量管理敏感配置
   - 定期备份节点状态文件（加密存储）

2. **网络安全**
   - 使用 HTTPS 用于 API 端点
   - 使用 WSS（WebSocket Secure）用于 gossip 网络
   - 配置防火墙规则限制访问
   - 使用 VPN 或专用网络连接节点

3. **访问控制**
   - 实施 API 密钥认证
   - 使用 IP 白名单
   - 定期轮换密钥
   - 监控异常访问模式

4. **运维安全**
   - 定期更新依赖包
   - 监控合约事件和交易
   - 设置告警系统
   - 定期审计日志

## 监控和日志

推荐设置：

- **日志**: Winston + ELK Stack
- **监控**: Prometheus + Grafana
- **告警**: PagerDuty / Slack
- **性能**: New Relic / DataDog

## 支持

遇到问题？

- GitHub Issues: https://github.com/fanhousanbu/YetAnotherAA-Signer/issues
- 主项目: https://github.com/fanhousanbu/YetAnotherAA
