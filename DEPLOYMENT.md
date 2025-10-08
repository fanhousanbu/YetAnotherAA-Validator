# 部署指南 / Deployment Guide

本指南将帮助你将 YetAnotherAA-Signer 推送到 GitHub 并进行部署。

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
- Gossip network for multi-node coordination
- On-chain node registration
- KMS integration support
- NestJS-based RESTful API
- Complete documentation and examples"

# 添加远程仓库
git remote add origin https://github.com/fanhousanbu/YetAnotherAA-Signer.git

# 推送到 GitHub
git branch -M main
git push -u origin main
```

## 步骤 3: 验证部署

访问 https://github.com/fanhousanbu/YetAnotherAA-Signer 确认：

- ✅ README.md 正确显示
- ✅ LICENSE 文件存在
- ✅ 所有源代码文件都已上传
- ✅ .gitignore 正确排除了 node_modules 和敏感文件

## 步骤 4: 本地开发设置

克隆新仓库并开始开发：

```bash
# 克隆仓库
git clone https://github.com/fanhousanbu/YetAnotherAA-Signer.git
cd YetAnotherAA-Signer

# 安装依赖
npm install

# 复制环境变量配置
cp .env.example .env
# 编辑 .env 填入你的配置

# 构建项目
npm run build

# 启动开发服务器
npm run start:dev
```

## 步骤 5: 生产环境部署

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

## 步骤 6: 配置 GitHub Actions（可选）

创建 `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

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

1. **私钥管理**
   - 生产环境使用 KMS
   - 永远不要提交 `node_*.json` 文件到 git
   - 使用环境变量管理敏感配置

2. **网络安全**
   - 使用 HTTPS 用于 API 端点
   - 使用 WSS（WebSocket Secure）用于 gossip 网络
   - 配置防火墙规则

3. **访问控制**
   - 实施 API 密钥认证
   - 使用 IP 白名单
   - 定期轮换密钥

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
