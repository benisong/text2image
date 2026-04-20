#!/usr/bin/env bash
set -euo pipefail

# text2image 一键部署脚本（pm2 版）
# - 默认端口 16000；nginx / Cloudflare 反代指向该端口
# - 首次运行自动生成 .env 与随机管理员密码
# - 缺少 Node 或版本 < 20 时自动安装 Node 24（apt/dnf/yum/apk）
# - 后续运行：拉新代码后再次执行即可，会增量装依赖、重新 build、热重启 pm2

cd "$(dirname "$0")"

REQUIRED_NODE_MAJOR=20
INSTALL_NODE_MAJOR=24

log()  { printf "\033[1;32m[deploy]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[deploy]\033[0m %s\n" "$*" >&2; }
die()  { printf "\033[1;31m[deploy]\033[0m %s\n" "$*" >&2; exit 1; }

need_sudo() {
  # 在需要时把 sudo 打到命令前面；如果已经是 root 就为空
  if [ "$(id -u)" -eq 0 ]; then
    echo ""
  elif command -v sudo >/dev/null 2>&1; then
    echo "sudo"
  else
    die "需要 root 或 sudo 权限来安装系统软件包，请手动安装 Node.js >= ${REQUIRED_NODE_MAJOR}"
  fi
}

ensure_curl() {
  if command -v curl >/dev/null 2>&1; then
    return
  fi
  local SUDO
  SUDO="$(need_sudo)"
  if command -v apt-get >/dev/null 2>&1; then
    DEBIAN_FRONTEND=noninteractive $SUDO apt-get update -y
    DEBIAN_FRONTEND=noninteractive $SUDO apt-get install -y curl ca-certificates
  elif command -v dnf >/dev/null 2>&1; then
    $SUDO dnf install -y curl ca-certificates
  elif command -v yum >/dev/null 2>&1; then
    $SUDO yum install -y curl ca-certificates
  elif command -v apk >/dev/null 2>&1; then
    $SUDO apk add --no-cache curl ca-certificates
  else
    die "未找到 curl 且无法自动安装，请手动安装 curl 后重试"
  fi
}

install_node() {
  log "自动安装 Node.js ${INSTALL_NODE_MAJOR} ..."
  local SUDO
  SUDO="$(need_sudo)"
  ensure_curl

  if command -v apt-get >/dev/null 2>&1; then
    log "检测到 apt，使用 NodeSource 仓库"
    curl -fsSL "https://deb.nodesource.com/setup_${INSTALL_NODE_MAJOR}.x" | $SUDO -E bash -
    DEBIAN_FRONTEND=noninteractive $SUDO apt-get install -y nodejs
  elif command -v dnf >/dev/null 2>&1; then
    log "检测到 dnf，使用 NodeSource 仓库"
    curl -fsSL "https://rpm.nodesource.com/setup_${INSTALL_NODE_MAJOR}.x" | $SUDO bash -
    $SUDO dnf install -y nodejs
  elif command -v yum >/dev/null 2>&1; then
    log "检测到 yum，使用 NodeSource 仓库"
    curl -fsSL "https://rpm.nodesource.com/setup_${INSTALL_NODE_MAJOR}.x" | $SUDO bash -
    $SUDO yum install -y nodejs
  elif command -v apk >/dev/null 2>&1; then
    log "检测到 apk (Alpine)，直接安装系统仓库里的 nodejs"
    $SUDO apk add --no-cache nodejs npm
  else
    die "无法识别系统包管理器，请手动安装 Node.js >= ${REQUIRED_NODE_MAJOR}"
  fi
}

current_node_major() {
  if command -v node >/dev/null 2>&1; then
    node -v 2>/dev/null | sed 's/v\([0-9]*\).*/\1/'
  else
    echo 0
  fi
}

# ---------- Node 检查 / 自动安装 ----------
NODE_MAJOR="$(current_node_major)"
if [ "${NODE_MAJOR:-0}" -lt "$REQUIRED_NODE_MAJOR" ]; then
  if [ "${NODE_MAJOR:-0}" -eq 0 ]; then
    log "未检测到 node，开始自动安装"
  else
    warn "当前 Node 版本 v${NODE_MAJOR} 低于要求 (>= ${REQUIRED_NODE_MAJOR})，将自动升级"
  fi
  install_node

  NODE_MAJOR="$(current_node_major)"
  if ! command -v node >/dev/null 2>&1 || [ "${NODE_MAJOR:-0}" -lt "$REQUIRED_NODE_MAJOR" ]; then
    die "Node 安装后版本仍不满足: $(node -v 2>/dev/null || echo 'not installed')"
  fi
  log "Node 已就绪: $(node -v)"
fi

command -v npm >/dev/null 2>&1 || die "未检测到 npm（通常随 nodejs 一起安装，请检查安装过程）"

# ---------- pm2 检查 / 自动安装 ----------
if ! command -v pm2 >/dev/null 2>&1; then
  log "未检测到 pm2，尝试 npm install -g pm2"
  if ! npm install -g pm2 >/dev/null 2>&1; then
    SUDO="$(need_sudo)"
    log "直接 npm i -g 失败（可能没写权限），改用 $SUDO npm install -g pm2"
    $SUDO npm install -g pm2 || die "自动安装 pm2 失败，请手动执行: sudo npm install -g pm2"
  fi
fi

# ---------- 生成 .env ----------
APP_PORT_DEFAULT="${APP_PORT:-16000}"
ENV_FILE=".env"

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
# 宿主机端口；nginx / Cloudflare 反代请指向这个端口
APP_PORT=${APP_PORT_DEFAULT}

# 首次管理员凭据；登录后会强制改密
ADMIN_USERNAME=admin
ADMIN_PASSWORD=${ADMIN_PASSWORD}

# HTTPS 反代后设为 true；HTTP 直连保持 false，否则浏览器会丢弃 cookie
SESSION_COOKIE_SECURE=false

# OpenAI 兼容图像生成 API；可以先留空，启动后到管理端"API 配置"里填
IMAGE_API_BASE_URL=https://api.openai.com/v1
IMAGE_API_KEY=
IMAGE_API_MODEL=dall-e-3
IMAGE_API_SIZE=1024x1024
# auto / images / chat
IMAGE_API_ROUTE=auto

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
    echo "APP_PORT=${APP_PORT_DEFAULT}" >> "$ENV_FILE"
    log "补齐 APP_PORT=${APP_PORT_DEFAULT}"
  fi
fi

# ---------- 加载 .env 到当前 shell ----------
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
APP_PORT="${APP_PORT:-${APP_PORT_DEFAULT}}"
export APP_PORT

# ---------- 目录 ----------
mkdir -p data/images

# ---------- 依赖：仅在 package-lock 变化时重装 ----------
STAMP="node_modules/.deploy-stamp"
if [ ! -d node_modules ] || [ ! -f "$STAMP" ] || [ "package-lock.json" -nt "$STAMP" ]; then
  log "安装依赖（npm ci）..."
  npm ci --no-audit --no-fund
  mkdir -p node_modules
  touch "$STAMP"
else
  log "依赖未变更，跳过 npm ci"
fi

# ---------- 构建 ----------
log "构建（npm run build）..."
npm run build

# ---------- pm2 启动 / 热重启 ----------
if pm2 describe text2image >/dev/null 2>&1; then
  log "热重启 pm2 进程"
  pm2 reload ecosystem.config.cjs --update-env
else
  log "首次启动 pm2 进程"
  pm2 start ecosystem.config.cjs
fi

pm2 save >/dev/null 2>&1 || true

cat <<EOF

============================================================
  启动完成
  用户端:  http://<your-host>:${APP_PORT}/login
  管理端:  http://<your-host>:${APP_PORT}/admin/login
============================================================

常用命令：
  查看日志:   pm2 logs text2image
  查看状态:   pm2 status
  停止:       pm2 stop text2image
  开机自启:   sudo env PATH=\$PATH:\$(dirname "\$(command -v node)") \\
             \$(command -v pm2) startup systemd -u "\$USER" --hp "\$HOME"
             # 上面命令打印一行 sudo 命令，再执行一次即可
  完全卸载:   pm2 delete text2image && pm2 save

EOF
