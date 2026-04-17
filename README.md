# Text2Image

一个面向小规模团队使用的轻量级文生图系统，默认单机部署，支持用户端和管理端两套界面。

## 当前能力

- 用户端聊天式出图
- 连续修改上一张图时只传提示词和随机种子上下文
- 两种输出模式
  - `image_only`
  - `image_with_commentary`
- 后端负责调用 Vertex AI、接收 base64、落盘图片、返回图片地址
- SQLite 保存会话、用户、任务、配置
- 图片保存在本地目录
- 删除会话时同步删除该会话下的图片
- 管理端可管理用户、密码、API 配置和会话列表

## 技术栈

- Next.js 16 App Router
- React 19
- Tailwind CSS 4
- SQLite + `better-sqlite3`
- Google Vertex AI Imagen
- Docker / Docker Compose

## 目录说明

- `data/app.db`: SQLite 数据库
- `data/images/sessions/<sessionId>/`: 会话图片目录
- `src/app/(user)`: 用户端页面
- `src/app/(admin)`: 管理端页面
- `src/app/api`: 服务端接口

## 本地开发

```bash
npm install
npm run dev
```

默认地址：

- 用户端: `http://localhost:3000/login`
- 管理端: `http://localhost:3000/admin/login`

默认管理员账号：

- 用户名: `admin`
- 密码: `admin123456`

首次启动后可在管理端修改管理员密码，并填写 Vertex AI 配置。

## Docker 部署

1. 复制环境变量模板

```bash
cp .env.example .env
```

Windows PowerShell 可以用：

```powershell
Copy-Item .env.example .env
```

2. 根据需要修改 `.env`

- `ADMIN_USERNAME` / `ADMIN_PASSWORD` 用于首次初始化管理员
- `VERTEX_*` 会作为默认配置写入系统设置
- `VERTEX_SERVICE_ACCOUNT_JSON` 可以直接填单行 JSON；也可以启动后在管理端配置

3. 启动服务

```bash
docker compose up -d --build
```

4. 访问页面

- 用户端: `http://<your-host>:3000/login`
- 管理端: `http://<your-host>:3000/admin/login`

## 使用流程

1. 管理员登录管理端
2. 创建普通用户账号
3. 在 API 配置页填写 Vertex AI 参数和服务账号 JSON
4. 用户登录后新建会话并输入提示词
5. 后端异步生成图片并保存到本地目录
6. 若删除会话，会同时删除数据库记录和对应图片目录

## 注意事项

- 这是单机单实例方案，适合约 5 个用户、几百到两千张图片的规模
- 当前的“连续修改”本质上是基于上一轮 prompt 和 seed 的再次文生图，不是真正的图生图局部编辑
- 任务队列为进程内实现，服务器重启时未完成任务不会自动恢复
- `data/` 目录需要持久化保存，Docker Compose 已默认挂载到宿主机
