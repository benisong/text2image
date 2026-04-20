#!/usr/bin/env bash
set -euo pipefail

# text2image 一键部署脚本（pm2 版）
# 自动处理的依赖：
#   node (>= 20，缺失/过旧自动装 Node 24)
#   npm   (随 nodejs 一起)
#   curl  (NodeSource 脚本需要)
#   pm2   (全局 npm 安装)
#   build-essential + python3  (better-sqlite3 源码编译兜底)
# 默认端口 16000，nginx / Cloudflare 反代指向该端口

cd "$(dirname "$0")"

REQUIRED_NODE_MAJOR=20
INSTALL_NODE_MAJOR=24

log()  { printf "\033[1;32m[deploy]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[deploy]\033[0m %s\n" "$*" >&2; }
die()  { printf "\033[1;31m[deploy]\033[0m %s\n" "$*" >&2; exit 1; }

# 以 root 身份执行一个命令；非 root 走 sudo；都没有则退出
run_as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    die "需要 root 或 sudo 权限来安装系统软件包，请手动安装相关依赖后重跑。"
  fi
}

# 等同 run_as_root，但保留环境变量（apt 需要 DEBIAN_FRONTEND 等）
run_as_root_env() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo -E "$@"
  else
    die "需要 root 或 sudo 权限来安装系统软件包，请手动安装相关依赖后重跑。"
  fi
}

# 检测包管理器
detect_pkg_mgr() {
  if command -v apt-get >/dev/null 2>&1; then echo apt; return; fi
  if command -v dnf     >/dev/null 2>&1; then echo dnf; return; fi
  if command -v yum     >/dev/null 2>&1; then echo yum; return; fi
  if command -v apk     >/dev/null 2>&1; then echo apk; return; fi
  echo none
}

PKG_MGR="$(detect_pkg_mgr)"

pkg_install() {
  # pkg_install <package...>
  case "$PKG_MGR" in
    apt)
      run_as_root_env env DEBIAN_FRONTEND=noninteractive apt-get update -y
      run_as_root_env env DEBIAN_FRONTEND=noninteractive apt-get install -y "$@"
      ;;
    dnf) run_as_root dnf install -y "$@" ;;
    yum) run_as_root yum install -y "$@" ;;
    apk) run_as_root apk add --no-cache "$@" ;;
    none) die "无法识别系统包管理器，请手动安装：$*" ;;
  esac
}

ensure_curl() {
  if command -v curl >/dev/null 2>&1; then return; fi
  log "未检测到 curl，自动安装"
  case "$PKG_MGR" in
    apt|dnf|yum) pkg_install curl ca-certificates ;;
    apk) pkg_install curl ca-certificates ;;
    *) die "需要 curl，请手动安装后重试" ;;
  esac
}

install_node() {
  log "自动安装 Node.js ${INSTALL_NODE_MAJOR} ..."
  ensure_curl

  case "$PKG_MGR" in
    apt)
      local tmp
      tmp="$(mktemp)"
      curl -fsSL "https://deb.nodesource.com/setup_${INSTALL_NODE_MAJOR}.x" -o "$tmp" \
        || { rm -f "$tmp"; die "下载 NodeSource 脚本失败（网络/代理问题？）"; }
      run_as_root bash "$tmp"
      rm -f "$tmp"
      run_as_root_env env DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
      ;;
    dnf)
      local tmp; tmp="$(mktemp)"
      curl -fsSL "https://rpm.nodesource.com/setup_${INSTALL_NODE_MAJOR}.x" -o "$tmp" \
        || { rm -f "$tmp"; die "下载 NodeSource 脚本失败"; }
      run_as_root bash "$tmp"
      rm -f "$tmp"
      run_as_root dnf install -y nodejs
      ;;
    yum)
      local tmp; tmp="$(mktemp)"
      curl -fsSL "https://rpm.nodesource.com/setup_${INSTALL_NODE_MAJOR}.x" -o "$tmp" \
        || { rm -f "$tmp"; die "下载 NodeSource 脚本失败"; }
      run_as_root bash "$tmp"
      rm -f "$tmp"
      run_as_root yum install -y nodejs
      ;;
    apk)
      log "Alpine 直接用系统仓库 (nodejs + npm)"
      pkg_install nodejs npm
      ;;
    *)
      die "无法识别系统包管理器，请手动安装 Node.js >= ${REQUIRED_NODE_MAJOR}"
      ;;
  esac
}

ensure_build_tools() {
  # better-sqlite3 如果没有匹配的 prebuilt，需要源码编译
  if command -v cc >/dev/null 2>&1 || command -v gcc >/dev/null 2>&1; then
    if command -v python3 >/dev/null 2>&1 || command -v python >/dev/null 2>&1; then
      return
    fi
  fi
  log "安装编译工具（better-sqlite3 源码编译兜底）"
  case "$PKG_MGR" in
    apt) pkg_install build-essential python3 ;;
    dnf) run_as_root dnf groupinstall -y "Development Tools" || true
         pkg_install python3 ;;
    yum) run_as_root yum groupinstall -y "Development Tools" || true
         pkg_install python3 ;;
    apk) pkg_install build-base python3 ;;
    *)   warn "无法识别的系统，跳过编译工具安装；npm ci 失败时可能需要手动装 gcc/python3" ;;
  esac
}

current_node_major() {
  if command -v node >/dev/null 2>&1; then
    node -v 2>/dev/null | sed 's/v\([0-9]*\).*/\1/'
  else
    echo 0
  fi
}

# ---------- Node ----------
NODE_MAJOR="$(current_node_major)"
if [ "${NODE_MAJOR:-0}" -lt "$REQUIRED_NODE_MAJOR" ]; then
  if [ "${NODE_MAJOR:-0}" -eq 0 ]; then
    log "未检测到 node，开始自动安装"
  else
    warn "当前 Node v${NODE_MAJOR} < ${REQUIRED_NODE_MAJOR}，自动升级"
  fi
  install_node
  NODE_MAJOR="$(current_node_major)"
  if [ "${NODE_MAJOR:-0}" -lt "$REQUIRED_NODE_MAJOR" ]; then
    die "安装后 Node 版本仍不满足: $(node -v 2>/dev/null || echo 'not installed')"
  fi
  log "Node 已就绪: $(node -v)"
fi
command -v npm >/dev/null 2>&1 || die "未检测到 npm（通常随 nodejs 一起），请检查 Node 安装过程"

# ---------- 编译工具（给 better-sqlite3 兜底）----------
ensure_build_tools

# ---------- pm2 ----------
if ! command -v pm2 >/dev/null 2>&1; then
  log "未检测到 pm2，安装全局 pm2"
  if ! npm install -g pm2 >/dev/null 2>&1; then
    log "用户态安装失败，改用 root 身份再试"
    run_as_root npm install -g pm2 \
      || die "自动安装 pm2 失败，请手动执行: sudo npm install -g pm2"
  fi
fi

# ---------- .env ----------
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

# ---------- npm ci ----------
STAMP="node_modules/.deploy-stamp"
if [ ! -d node_modules ] || [ ! -f "$STAMP" ] || [ "package-lock.json" -nt "$STAMP" ]; then
  log "安装依赖（npm ci）..."
  npm ci --no-audit --no-fund
  mkdir -p node_modules
  touch "$STAMP"
else
  log "依赖未变更，跳过 npm ci"
fi

# ---------- build ----------
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
