# Vertex AI 手机端文生图产品设计

## 1. 目标

做一个手机端优先的聊天式文生图应用，核心流程如下：

1. 用户输入自然语言提示词
2. 后端调用低成本 LLM 对提示词做结构化改写
3. 后端将整理后的参数发送给 Vertex AI Imagen
4. Vertex AI 返回 base64 图片数据
5. 后端将图片落地到本地文件并返回图片 URL
6. 后端根据模式决定是否生成解说文本
7. 前端仅展示图片和可选解说
8. 用户可以基于上一轮生成结果继续追问修改

这个产品的本质是“连续文生图”，不是精确图生图编辑器。MVP 阶段不依赖原图回传模型，只依赖历史生成参数、effective prompt、seed 和用户增量指令继续生成。

支持两种输出模式：

- `image_only`：仅返回图片
- `image_with_commentary`：返回图片和一段解说

## 2. 产品边界

### 2.1 MVP 支持

- 聊天式连续出图
- 保存会话上下文
- 基于上一张图继续修改
- 两种输出模式：仅生图 / 生图附带解说
- 保留或重置 seed
- 返回历史图片
- 支持手机端访问
- 支持异步任务状态展示

### 2.2 MVP 不支持

- 局部重绘
- 蒙版编辑
- 精确保持人物姿势/物体位置完全不变
- 多图混合
- 复杂工作流编排

### 2.3 产品定义

当用户说“把上一张改成黄昏风格，人物别变太多”时，系统不是把图片再次发给模型，而是：

- 读取上一轮 `effective_prompt`
- 读取上一轮 `negative_prompt`
- 读取上一轮 `seed`
- 读取上一轮尺寸、比例、风格标签
- 将本轮用户增量描述 `delta_prompt` 一起发给便宜 LLM
- LLM 输出新的结构化 prompt
- 再次调用 Vertex AI Imagen 生成新图

## 3. 总体架构

```text
User Web (Next.js Server-Rendered UI)
        |
        +-----------------------------+
        |                             |
        v                             v
Admin Web (Next.js)            API Layer (Next.js Route Handlers)
        |
        +--> SQLite
        |      - users
        |      - auth_sessions
        |      - sessions
        |      - chat_messages
        |      - generations
        |      - jobs
        |      - system_settings
        |
        +--> In-Process Job Runner
        |      - generation queue
        |      - concurrency control
        |
        +--> Prompt Optimizer LLM
        |      - 低成本文本模型
        |
        +--> Vertex AI Imagen
        |      - 返回 base64
        |
        +--> Commentary Generator
        |      - 低成本文本模型
        |      - 仅在 image_with_commentary 模式启用
        |
        +--> Local File Storage
               - data/images/sessions/{sessionId}/
               - 持久化图片文件
               - 删除会话时同步删除目录
```

## 4. 为什么这样拆

### 4.1 前端和 API 放在同一个 Next.js 应用

优点：

- 开发速度快
- 适合手机端服务端渲染页面
- 便于直接处理登录态和页面渲染
- Route Handlers 足够承担业务 API

前端实现原则：

- 前端不接收 Vertex AI 原始 base64
- 前端不负责图片解码
- 前端不在浏览器中把 base64 转成图片
- 后端落盘后只给前端图片 URL
- 页面尽量使用服务端渲染和少量轮询

### 4.2 生成任务走进程内队列

原因：

- 生图耗时比普通接口长
- 需要失败重试
- 需要限制并发避免打爆 Vertex AI 配额
- 需要在手机端显示“排队中/生成中/完成”

说明：

- 当前方案不使用 Redis/BullMQ
- 使用单进程任务队列即可满足 MVP
- 任务状态仍然落 SQLite，页面通过轮询读取

### 4.3 图片先落本地，再回本地 URL

原因：

- base64 适合 Vertex AI 返回，不适合长期在前端长期保存
- 手机端长列表加载 base64 会明显加重内存压力
- 本地文件更便于删除会话时同步清理
- 单机部署时无需额外对象存储成本

### 4.4 部署边界

这套方案默认是单机单实例部署，适合：

- 本地运行
- 单台 Windows/Linux 服务器
- 小团队内网使用
- 低到中等并发

这套方案不适合：

- Cloud Run 多实例
- Vercel Serverless
- 多节点横向扩容
- 图片需要跨机器共享的部署方式

### 4.5 针对当前规模的最终收敛

如果实际规模是：

- 约 5 个用户
- 图片总量大概率不超过 2000 张
- 会话删除时同步删图
- 部署在单台服务器

那么最终建议直接收敛成：

- 一个 Next.js 应用
- 一个 SQLite 数据库文件
- 一个本地图片目录
- 一个进程内任务循环
- 不拆微服务
- 不引入 Redis
- 不引入消息中间件
- 不引入对象存储

这个规模下，最重要的是：

- 结构清晰
- 方便维护
- 出问题容易排查
- 备份简单

## 5. 关键业务对象

### 5.1 Session

一个登录用户的一段聊天会话。

### 5.2 Message

聊天流中的一条消息，可能是：

- 用户文本
- 系统状态
- 生成结果

### 5.3 Generation

一次真正的生图记录，保存所有可复现参数。

### 5.4 Job

一次异步执行任务，用于驱动前端状态。

## 6. 数据库设计

推荐 SQLite，数据库文件默认放在：

```text
data/app.db
```

### 6.1 `sessions`

```sql
id                 uuid pk
user_id            uuid null
title              varchar(120) null
status             varchar(20) not null default 'active'
created_at         timestamptz not null
updated_at         timestamptz not null
last_message_at    timestamptz not null
```

### 6.2 `chat_messages`

```sql
id                 uuid pk
session_id         uuid not null
role               varchar(20) not null
message_type       varchar(30) not null
content_text       text null
generation_id      uuid null
job_id             uuid null
created_at         timestamptz not null
```

说明：

- `role`: `user` / `assistant` / `system`
- `message_type`: `text` / `image` / `status`

### 6.3 `generations`

```sql
id                 uuid pk
session_id         uuid not null
parent_generation_id uuid null
trigger_message_id uuid not null

provider           varchar(30) not null
model              varchar(80) not null

original_prompt    text not null
effective_prompt   text not null
negative_prompt    text null
prompt_json        jsonb not null

seed               bigint null
keep_seed          boolean not null default false
aspect_ratio       varchar(10) not null
image_size         varchar(20) null
mime_type          varchar(40) not null

status             varchar(20) not null
vertex_request_id  varchar(120) null

output_mode        varchar(30) not null
explanation_text   text null
explanation_status varchar(20) null

storage_bucket     varchar(120) null
storage_path       varchar(255) null
public_url         text null

width              int null
height             int null
file_size_bytes    bigint null

error_code         varchar(80) null
error_message      text null

created_at         timestamptz not null
updated_at         timestamptz not null
completed_at       timestamptz null
```

### 6.4 `jobs`

```sql
id                 uuid pk
session_id         uuid not null
generation_id      uuid not null
job_type           varchar(30) not null
queue_name         varchar(50) not null
queue_job_id       varchar(100) null
status             varchar(20) not null
attempt_count      int not null default 0
progress           int not null default 0
error_message      text null
created_at         timestamptz not null
updated_at         timestamptz not null
started_at         timestamptz null
finished_at        timestamptz null
```

### 6.5 `users`

管理员和普通用户统一放在一个表里，用 `role` 区分。

```sql
id                 uuid pk
username           varchar(50) unique not null
password_hash      text not null
role               varchar(20) not null
display_name       varchar(80) null
is_active          boolean not null default true
last_login_at      timestamptz null
created_at         timestamptz not null
updated_at         timestamptz not null
```

说明：

- `role`: `admin` / `user`
- 用户不能自助注册，默认由管理员创建账号
- 密码修改和重置在管理端进行

### 6.6 `auth_sessions`

```sql
id                 uuid pk
user_id            uuid not null
session_token      text unique not null
expires_at         timestamptz not null
created_at         timestamptz not null
updated_at         timestamptz not null
```

### 6.7 `system_settings`

用于管理端维护 API 配置、系统开关、路径配置。

```sql
id                 uuid pk
setting_key        varchar(80) unique not null
setting_type       varchar(20) not null
value_json         text null
value_text         text null
is_secret          boolean not null default false
created_at         timestamptz not null
updated_at         timestamptz not null
```

建议配置项：

- `vertex.project_id`
- `vertex.location`
- `vertex.imagen_model`
- `vertex.service_account_json`
- `prompt_optimizer.provider`
- `prompt_optimizer.model`
- `generation.max_concurrency`
- `storage.image_root_dir`
- `app.allow_user_register`

generation 相关建议枚举：

- `output_mode`: `image_only` / `image_with_commentary`
- `explanation_status`: `none` / `queued` / `completed` / `failed`

## 7. 任务队列设计

使用 SQLite + 内存队列组合。

逻辑上仍保留一个队列名：

- `image-generation`

任务状态：

- `waiting`
- `active`
- `completed`
- `failed`

每个任务负载：

```json
{
  "jobId": "uuid",
  "sessionId": "uuid",
  "generationId": "uuid",
  "messageId": "uuid"
}
```

执行方式：

- API 把任务写入 `jobs`
- 进程内 job runner 轮询或直接消费新任务
- 同时最多处理固定数量任务

并发建议：

- MVP: `1-2`
- 小流量线上：`2-3`
- SQLite 写锁存在时，不建议高并发

重试策略：

- 最多 2 次
- 指数退避：5 秒、15 秒
- 对于安全过滤或明确参数错误，不自动重试

任务驱动建议：

- 首选轮询间隔 `1-2s`
- 页面端任务状态用短轮询
- 后续如果需要实时性，再补 SSE

## 8. Prompt Optimizer 设计

这个模块负责把自然语言转成 Vertex AI 可控参数。

### 8.1 输入

```json
{
  "user_prompt": "帮我画一个下雨天站在便利店门口的女孩",
  "history": {
    "last_effective_prompt": "cinematic portrait of a girl standing...",
    "last_negative_prompt": "blurry, deformed hands",
    "last_seed": 481923,
    "aspect_ratio": "9:16",
    "style_tags": ["cinematic", "portrait", "rainy"]
  },
  "instruction_mode": "modify_last",
  "output_mode": "image_only"
}
```

### 8.2 输出

必须强制 LLM 返回 JSON：

```json
{
  "action": "modify_last",
  "prompt": "cinematic portrait of a young woman standing at a convenience store entrance on a rainy evening, neon reflections, realistic photography, moody lighting",
  "negative_prompt": "blurry, low quality, extra fingers, deformed hands, duplicated face",
  "aspect_ratio": "9:16",
  "keep_seed": true,
  "output_mode": "image_only",
  "style_tags": ["cinematic", "rainy", "portrait", "realistic"]
}
```

### 8.3 两种模式

#### `new_image`

首次生成，忽略上一次 generation。

#### `modify_last`

在上一张图语义基础上做重写，尽量保留：

- 主体
- 镜头
- 构图
- 风格

### 8.4 系统约束

Prompt Optimizer 的 system prompt 需要明确：

- 只输出 JSON
- 不输出解释
- 如果用户要求“保持构图”，优先 `keep_seed=true`
- 如果用户说“换个完全不同的”，则 `keep_seed=false`
- 如果用户没有指定比例，沿用上一轮比例

## 9. Vertex AI 调用设计

### 9.1 请求参数

核心参数：

- `prompt`
- `negative_prompt`
- `sampleCount = 1`
- `aspect_ratio`
- `seed`
- `enhancePrompt`
- `outputOptions.mimeType`

业务层补充参数：

- `output_mode`
- `need_commentary`

### 9.2 实战规则

#### 规则 1

如果你希望“连续修改”更稳定，默认使用：

- `sampleCount = 1`
- `enhancePrompt = false`

原因：

- `sampleCount > 1` 会让用户选图逻辑更复杂
- `enhancePrompt` 会影响 prompt 的可控性

#### 规则 2

如果使用 `seed` 做稳定输出，业务层必须保存：

- 原始用户 prompt
- effective prompt
- seed
- 参数 JSON

#### 规则 3

后端必须保存 Vertex AI 真正返回的 `prompt` 字段；如果有这个字段，以它作为下一轮连续生成的基准。

## 10. 图片落地策略

### 10.1 推荐流程

1. Vertex AI 返回 `bytesBase64Encoded`
2. 服务端解码成 `Buffer`
3. 写入本地文件系统
4. 记录文件绝对路径和访问 URL
5. 返回受控访问 URL

### 10.2 存储路径规范

```text
data/images/sessions/{sessionId}/{generationId}.png
```

### 10.3 前端最终使用

前端尽量只展示：

- `publicUrl`
- `thumbnailUrl`（后续可加）
- `explanationText`（仅解说模式）

不直接保存长 base64。

### 10.4 删除会话时同步删除图片

删除策略：

1. 查询会话下所有 generation
2. 拿到该会话图片目录 `data/images/sessions/{sessionId}/`
3. 先删除目录内图片文件
4. 再删除数据库中的 `generations`、`chat_messages`、`jobs`、`sessions`

推荐约束：

- 一个会话的所有图片都放在一个目录
- 删除时优先按目录递归删除，而不是逐张拼路径删除
- 如果文件删除失败，则中止数据库删除并提示管理员

## 11. API 设计

推荐 REST 风格，足够支撑 MVP。

### 11.1 创建会话

`POST /api/sessions`

请求：

```json
{
  "title": "默认新会话"
}
```

响应：

```json
{
  "id": "session_uuid",
  "title": "默认新会话"
}
```

### 11.2 获取会话列表

`GET /api/sessions`

### 11.3 获取会话详情

`GET /api/sessions/:sessionId`

响应包含：

- session 基本信息
- messages
- 最近 generations

### 11.4 发送消息并发起生成

`POST /api/sessions/:sessionId/messages`

请求：

```json
{
  "content": "把上一张改成黄昏，保留人物和构图",
  "mode": "modify_last",
  "parentGenerationId": "generation_uuid",
  "keepSeed": true,
  "outputMode": "image_with_commentary"
}
```

响应：

```json
{
  "messageId": "message_uuid",
  "jobId": "job_uuid",
  "generationId": "generation_uuid",
  "status": "queued",
  "outputMode": "image_with_commentary"
}
```

### 11.5 查询任务状态

`GET /api/jobs/:jobId`

响应：

```json
{
  "id": "job_uuid",
  "status": "active",
  "progress": 65,
  "generationId": "generation_uuid"
}
```

### 11.6 获取 generation 详情

`GET /api/generations/:generationId`

响应：

```json
{
  "id": "generation_uuid",
  "status": "completed",
  "publicUrl": "https://...",
  "effectivePrompt": "...",
  "negativePrompt": "...",
  "seed": 481923,
  "aspectRatio": "9:16",
  "outputMode": "image_with_commentary",
  "explanationText": "这张图保留了原先的人物和构图，只把整体时间氛围改成了黄昏，并加强了霓虹反射和暖冷对比。"
}
```

### 11.16 读取图片文件

`GET /api/images/:generationId`

说明：

- 服务端从本地文件读取图片
- 设置正确的 `Content-Type`
- 前端只把这个地址放进 `img.src`

### 11.7 用户登录

`POST /api/auth/login`

请求：

```json
{
  "username": "demo",
  "password": "******"
}
```

响应：

```json
{
  "user": {
    "id": "user_uuid",
    "username": "demo",
    "role": "user"
  }
}
```

### 11.8 用户退出

`POST /api/auth/logout`

### 11.9 获取当前用户

`GET /api/auth/me`

### 11.10 管理端获取用户列表

`GET /api/admin/users`

### 11.11 管理端创建用户

`POST /api/admin/users`

请求：

```json
{
  "username": "alice",
  "password": "Init123456",
  "role": "user",
  "displayName": "Alice"
}
```

### 11.12 管理端重置密码

`PATCH /api/admin/users/:userId/password`

### 11.13 管理端启用/禁用用户

`PATCH /api/admin/users/:userId/status`

### 11.14 管理端读取 API 配置

`GET /api/admin/settings/api`

### 11.15 管理端更新 API 配置

`PUT /api/admin/settings/api`

请求示例：

```json
{
  "vertexProjectId": "my-project",
  "vertexLocation": "us-central1",
  "imagenModel": "imagen-4.0-generate-001",
  "promptOptimizerModel": "cheap-llm-model",
  "maxConcurrency": 2,
  "imageRootDir": "data/images"
}
```

## 12. Worker 执行流程

```text
1. 取 job
2. 读 generation 记录
3. 查询 parent generation
4. 调用 Prompt Optimizer
5. 更新 generation.prompt_json
6. 调用 Vertex AI Imagen
7. 解码 base64
8. 写入本地图片目录
9. 如果 `output_mode = image_with_commentary`，调用解说生成器
10. 更新 generation 完成状态
11. 写入 assistant/image message
12. job completed
```

失败分支：

```text
1. 写 jobs.failed
2. 写 generations.failed
3. 写一条 system/status message
4. 前端显示“生成失败，可重试”
```

解说模式说明：

- 不需要把图片再发给 AI
- 直接基于 `effective_prompt`、`negative_prompt`、`seed`、用户增量指令生成解说
- 这样可以省成本，也保持链路简单

## 13. 前端页面设计

## 13.1 页面结构

### 用户端 `/login`

用户登录页。

### 用户端 `/`

登录后跳转到会话列表。

### 用户端 `/chat/[sessionId]`

主聊天页。

### 用户端 `/image/[generationId]`

单图详情页，后续可做分享。

### 管理端 `/admin/login`

管理员登录页。

### 管理端 `/admin`

管理后台首页。

### 管理端 `/admin/users`

用户账号管理页。

### 管理端 `/admin/settings/api`

API 配置管理页。

### 管理端 `/admin/settings/system`

系统配置管理页。

### 管理端 `/admin/sessions`

会话和任务查看页。

## 13.2 手机端聊天页布局

顶部：

- 返回按钮
- 会话标题
- 更多操作

中间消息区：

- 用户文字气泡
- 系统状态消息
- 图片卡片
- 解说卡片（仅解说模式）

底部输入区：

- 多行输入框
- “继续上一张”开关
- “保留随机种子”开关
- 输出模式切换：
  - 仅生图
  - 生图附带解说
- 发送按钮

图片卡片操作：

- 再来一张
- 基于这张继续改
- 复制提示词
- 查看参数

## 13.3 手机端交互原则

- 输入框固定底部
- 图片列表懒加载
- 大图先展示模糊占位
- 生成中显示骨架屏和进度文案
- 避免 base64 直接长期挂在 DOM 上
- 前端只拿图片 URL，不处理 base64
- 解说模式只显示后端生成好的文本

## 13.4 管理端页面布局

管理端左侧导航：

- 仪表盘
- 用户管理
- API 配置
- 系统设置
- 会话记录
- 任务记录

用户管理页：

- 用户列表
- 创建用户
- 重置密码
- 启用/禁用

API 配置页：

- Vertex AI 项目 ID
- 地区
- 模型名
- 服务账号 JSON
- Prompt Optimizer 模型
- 并发数

系统设置页：

- 图片存储根目录
- 是否允许普通用户修改用户名
- 默认图片比例
- 默认保留 seed 策略

## 14. 状态机设计

### 14.1 Job 状态

```text
queued -> processing -> completed
queued -> processing -> failed
queued -> canceled
```

### 14.2 Generation 状态

```text
draft -> queued -> generating -> uploading -> completed
draft -> queued -> generating -> failed
```

### 14.3 前端展示映射

- `queued`: 排队中
- `generating`: 生成中
- `uploading`: 正在整理图片
- `completed`: 显示图片
- `failed`: 显示错误和重试按钮

## 15. 可执行目录结构

推荐单仓库、简化结构：

```text
text2image/
  src/
    app/
      (user)/
        login/
        chat/
        image/
      (admin)/
        admin/
          login/
          users/
          settings/
          sessions/
    components/
      user/
      admin/
      shared/
    lib/
      auth/
      db/
        migrations/
        queries/
      settings/
      validators/
    server/
      ai/
        prompt-optimizer/
        vertex-imagen/
      jobs/
      storage/
      services/
    styles/
  data/
    app.db
    images/
      sessions/
  docs/
    vertex-ai-text2image-design.md
```

## 16. 推荐技术栈

## 16.1 前端

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- Server Components 优先
- 极少量客户端交互

## 16.2 服务端

- Next.js Route Handlers
- Node.js
- Zod

## 16.3 数据层

- SQLite
- better-sqlite3
- SQL migration files

## 16.4 云服务

- Vertex AI Imagen
- 本地文件系统存图

## 16.5 认证

MVP 阶段直接做账号密码登录：

- 一个 `users` 表
- 一个 `auth_sessions` 表
- `httpOnly` cookie 持有会话 token
- `admin` 和 `user` 用 role 区分

## 17. 推荐技术栈版本

以下版本是建议的起点，确认开工时再以锁定版本为准：

- Node.js 24 LTS
- Next.js 15
- React 19
- Tailwind CSS 4
- SQLite 3

## 17.1 技术栈决策表

| 层 | 推荐 | 备选 | 选择原因 | 当前结论 |
| --- | --- | --- | --- | --- |
| 前端框架 | Next.js App Router | Vite + React | 需要移动端页面、SSR、API 同仓开发、后续做后台也顺手 | 选 Next.js |
| UI 样式 | Tailwind CSS | CSS Modules / UnoCSS | 开发速度快，适合做聊天类高频迭代界面 | 选 Tailwind |
| 服务端 API | Next.js Route Handlers | NestJS / Fastify | MVP 更轻，减少前后端拆分成本 | 先选 Route Handlers |
| 校验 | Zod | Yup / Joi | TS 友好，前后端共享 schema 容易 | 选 Zod |
| 数据访问 | better-sqlite3 + 直接 SQL | Drizzle ORM | 项目规模很小，直接 SQL 更透明，维护成本更低 | 选直接 SQL |
| 主数据库 | SQLite | PostgreSQL | 单机部署更简单，零运维，适合 MVP | 选 SQLite |
| 队列 | 进程内任务队列 | BullMQ / RabbitMQ | 去掉 Redis 依赖，单机足够用 | 先进程内队列 |
| 图片存储 | 本地文件系统 | Cloud Storage / S3 | 删除会话时同步删图最直接 | 选本地文件 |
| 部署 | 单机 Node 服务 | Cloud Run / Kubernetes | 和 SQLite、本地文件模型一致 | 选单机部署 |
| 认证 | 用户名密码 + 角色 | Auth.js / Firebase Auth | 后台独立管理用户最直接 | 先自建账号体系 |

## 18. 为什么选这套栈

### 18.1 Next.js 15 + React 19

适合手机端 Web、SSR、Route Handlers 和未来后台管理页共用一套栈。

### 18.2 SQLite

适合单机、低运维、少量并发的会话消息和配置数据。

### 18.3 better-sqlite3 + 直接 SQL

这个项目的表数量有限，查询模型也比较稳定，不值得为了小规模系统额外引入 ORM 复杂度。

### 18.4 进程内任务队列

适合单机异步生图，不需要额外引入 Redis。

### 18.5 本地文件存储

适合按会话目录管理图片，也便于同步删除。

### 18.6 管理端 + 用户端双界面

更符合“管理员统一管账号、密码、API 配置”的要求。

### 18.7 后端主导渲染

图片解码、落盘、读取和解说生成都放在后端，前端只负责：

- 提交 prompt
- 选择输出模式
- 显示图片
- 显示可选解说

## 19. 非功能性要求

### 19.1 性能

- 首屏加载目标：移动 4G 下 2.5 秒内进入可交互
- 聊天页图片使用懒加载
- 一次会话默认仅加载最近 20 条消息

### 19.2 安全

- Vertex AI 密钥和服务账号只放服务端
- 不允许前端直连 Vertex AI
- 本地图片访问建议走受控文件接口，不直接暴露任意磁盘路径
- 接口增加基础速率限制
- 密码必须存 hash，不存明文
- `system_settings` 中的敏感配置建议用服务端密钥加密

### 19.3 可观测性

必须记录：

- job id
- generation id
- session id
- Vertex request id
- provider latency
- image write latency
- fail reason

### 19.4 备份

必须一起备份：

- `data/app.db`
- `data/images/`

## 20. MVP 开发顺序

### 阶段 1：可跑通

- 初始化 Next.js 项目
- 接入 SQLite
- 做用户登录和管理员登录
- 做会话页和聊天页
- 做管理端用户管理页
- 做管理端 API 配置页
- 做发消息接口
- 打通 Vertex AI 单次出图
- 打通后端 base64 落盘和图片读取接口

### 阶段 2：可连续修改

- 保存 generation 参数
- 接入 Prompt Optimizer
- 增加 parent generation
- 增加 keep seed
- 增加本地文件落盘
- 增加删除会话同步删图
- 增加 `image_only` / `image_with_commentary` 两种模式
- 增加后端解说生成

### 阶段 3：可上线

- 图片本地 URL 化
- 加任务状态轮询
- 增加错误重试
- 增加基础埋点和日志
- 增加备份脚本

## 21. 本项目的最终建议

### 方案结论

这是一个非常适合先做成 MVP 的项目，而且 Vertex AI + 手机端 H5 的组合是合理的。

### 推荐架构结论

- 前端：Next.js，分用户端和管理端
- 后端：Next.js API + 进程内 job runner
- 数据库：SQLite
- 队列：内存队列 + jobs 表
- 图片存储：本地文件系统
- 生图：Vertex AI Imagen
- 输出模式：
  - 仅生图
  - 生图附带解说
- 上下文策略：只传结构化参数，不回传原图
- 用户体系：管理员创建账号并管理密码、API 配置、系统配置

### 开工时默认先做的最小闭环

1. 管理员登录
2. 配置 Vertex AI 参数
3. 创建普通用户
4. 普通用户登录
5. 新建会话
6. 输入提示词
7. 创建 job
8. Worker 调 Vertex AI
9. base64 写本地文件
10. 返回 URL
11. 按模式决定是否生成解说
12. 聊天流展示
13. 基于上一张继续改图
