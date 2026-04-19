#!/usr/bin/env bash
set -euo pipefail

# text2image 一键部署脚本
# - 默认端口 16000（宿主机）→ 容器内 3000
# - 首次运行自动生成 .env 和随机管理员密码
# - 再次运行等价于重新 build + 重启

cd "$(dirname "$0")"

log() { printf "\033[1;32m[deploy]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[deploy]\033[0m %s\n" "$*" >&2; }
die() { printf "\033[1;31m[deploy]\033[0m %s\n" "$*" >&2; exit 1; }

# ---------- 依赖检查 ----------
command -v docker >/dev/null 2>&1 || die "未检测到 docker，请先安装 Docker Engine。"

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  die "未检测到 docker compose 插件或 docker-compose 命令。"
fi

APP_PORT="${APP_PORT:-16000}"
ENV_FILE=".env"

# ---------- 生成 .env ----------
rand_password() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 18 | tr -d '=/+' | cut -c1-16
  else
    head -c 32 /dev/urandom | LC_ALL=C tr -dc 'A-Za-z0-9' | head -c 16
  fi
}

if [ ! -f "$ENV_FILE" ]; then
  log "未找到 .env，生成默认配置"
  ADMIN_PASSWORD="$(rand_password)"
  cat > "$ENV_FILE" <<EOF
# 宿主机端口，nginx/Cloudflare 请指向这个端口
APP_PORT=${APP_PORT}

# 首次管理员凭据（可在登录后在管理端改密）
ADMIN_USERNAME=admin
ADMIN_PASSWORD=${ADMIN_PASSWORD}

# HTTPS 反代后设为 true；HTTP 直连保持 false，否则 cookie 会丢
SESSION_COOKIE_SECURE=false

# Vertex AI 可以先留空，启动后在管理端"API 配置"里填
VERTEX_PROJECT_ID=
VERTEX_LOCATION=us-central1
VERTEX_IMAGEN_MODEL=imagen-4.0-generate-001
VERTEX_SERVICE_ACCOUNT_JSON=

PROMPT_OPTIMIZER_MODEL=template
GENERATION_MAX_CONCURRENCY=2
IMAGE_ROOT_DIR=data/images
EOF
  chmod 600 "$ENV_FILE"
  log "已生成 .env（权限 600）"
  log "初始管理员账号: admin"
  log "初始管理员密码: ${ADMIN_PASSWORD}"
  warn "首次登录后请立即在管理端修改密码。"
else
  log ".env 已存在，沿用原有配置"
  if ! grep -q '^APP_PORT=' "$ENV_FILE"; then
    echo "APP_PORT=${APP_PORT}" >> "$ENV_FILE"
    log "补齐 APP_PORT=${APP_PORT}"
  fi
fi

# ---------- 目录 ----------
mkdir -p data/images

# ---------- 启动 ----------
log "构建并启动容器"
"${COMPOSE[@]}" up -d --build

# ---------- 健康等待 ----------
FINAL_PORT="$(grep -E '^APP_PORT=' "$ENV_FILE" | tail -n1 | cut -d= -f2)"
FINAL_PORT="${FINAL_PORT:-$APP_PORT}"

log "容器状态:"
"${COMPOSE[@]}" ps

cat <<EOF

============================================================
  启动完成
  用户端:  http://<your-host>:${FINAL_PORT}/login
  管理端:  http://<your-host>:${FINAL_PORT}/admin/login
============================================================

常用命令：
  查看日志:   ${COMPOSE[*]} logs -f app
  停止:       ${COMPOSE[*]} down
  更新重启:   ./deploy.sh
  删除数据:   ${COMPOSE[*]} down && rm -rf data

EOF
