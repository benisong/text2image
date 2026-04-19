# Text2Image

一个面向小规模团队使用的轻量级文生图系统，单机部署，支持用户端与管理端两套界面。后端走 OpenAI 兼容的图像生成接口（`POST /v1/images/generations`），换模型/换供应商只改 Base URL + Key + Model 三项。

## 当前能力

- 用户端聊天式出图，支持"继续上一张"
- 两种输出模式：`image_only` / `image_with_commentary`
- 后端调用 OpenAI 兼容图像 API，落盘 PNG
- SQLite 保存会话、用户、任务、配置、审计日志
- 失败任务可一键重试
- 管理端管理用户、密码、API 配置、会话列表
- 首次登录强制改密、API Key 不回显浏览器、操作审计

## 技术栈

- Next.js 16 App Router + React 19 + Tailwind 4
- SQLite + `better-sqlite3`
- OpenAI 兼容图像 API
- pm2 进程管理

## 一键部署

服务器要求：Node.js >= 20。

```bash
git clone <repo>
cd text2image
bash deploy.sh
```

`deploy.sh` 会自动：

- 检查 Node 版本，缺 pm2 时尝试 `npm install -g pm2`（失败请手动 sudo 安装）
- 没有 `.env` 时生成默认配置 + 一个随机管理员密码（屏幕上打印一次）
- 仅在 `package-lock.json` 变化时跑 `npm ci`，否则跳过
- `npm run build`
- pm2 首次 start 或热 reload，自带自动重启 + 1G 内存上限
- `pm2 save` 保存进程列表，方便开机恢复

宿主机端口默认 **16000**：

- 用户端: `http://<host>:16000/login`
- 管理端: `http://<host>:16000/admin/login`

修改端口：编辑 `.env` 里的 `APP_PORT=`，再次 `bash deploy.sh`。

### 第一次部署完做一次开机自启

```bash
sudo env PATH=$PATH:$(dirname "$(command -v node)") \
  $(command -v pm2) startup systemd -u "$USER" --hp "$HOME"
```

它会打印一行 `sudo` 命令，按提示执行一次即可。之后机器重启 pm2 会自动拉起 text2image。

### 反代示例（nginx + Cloudflare）

```nginx
server {
  listen 80;
  server_name img.example.com;

  client_max_body_size 20m;

  location / {
    proxy_pass http://127.0.0.1:16000;
    proxy_http_version 1.1;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout  120s;
    proxy_send_timeout  120s;
  }
}
```

走 HTTPS（Cloudflare Flexible / Full）时把 `.env` 里的 `SESSION_COOKIE_SECURE` 改成 `true`，再 `bash deploy.sh`。

## 本地开发

```bash
npm install
npm run dev
```

默认地址：

- 用户端: `http://localhost:3000/login`
- 管理端: `http://localhost:3000/admin/login`

默认管理员账号 / 密码：`admin` / `admin123456`，首次登录强制改密。

## API 配置

任何 OpenAI 兼容图像生成端点都可用，关键字段：

| 字段 | 示例 |
| --- | --- |
| Base URL | `https://api.openai.com/v1`，或自部署/中转的 `/v1` 路径 |
| Model | `dall-e-3`、`gpt-image-1` 等 |
| Size | `1024x1024`、`1792x1024`、`1024x1792` |
| API Key | `sk-...`（保存后不再回显，只能替换） |

可在 `.env` 里设 `IMAGE_API_*` 作为初始默认值，也可以启动后到管理端 `API 配置` 页面填入。

## 目录说明

- `data/app.db`: SQLite 数据库
- `data/images/sessions/<sessionId>/`: 会话图片目录
- `src/app/(user)`: 用户端页面
- `src/app/(admin)`: 管理端页面
- `src/app/api`: 服务端接口
- `src/server`: 服务端业务代码
- `ecosystem.config.cjs`: pm2 进程配置

## 常用命令

```bash
pm2 logs text2image     # 实时日志
pm2 status              # 进程状态
pm2 restart text2image  # 简单重启
pm2 stop text2image     # 停止
pm2 delete text2image   # 卸载进程
```

## 注意事项

- 单机单实例方案，适合约 5 个用户、几百到两千张图片的规模
- "继续上一张"本质上是基于上一轮 prompt 的再次文生图，不是真正的图生图局部编辑
- 任务队列为进程内实现；进程启动时会把 `active` 状态的任务复位为 `waiting` 后续作为积压拉起
- `data/` 目录持久化保存所有数据，迁移时把它打包带走即可
