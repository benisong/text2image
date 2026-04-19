// PM2 配置；deploy.sh 会先把 .env 加载进 shell，再交给 pm2 启动，
// 所以这里 env 只声明一些一定要的默认值，其他从 process.env 透传。

module.exports = {
  apps: [
    {
      name: "text2image",
      cwd: __dirname,
      script: "./node_modules/next/dist/bin/next",
      args: "start",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "1G",
      kill_timeout: 5000,
      env: {
        NODE_ENV: "production",
        HOSTNAME: "0.0.0.0",
        PORT: process.env.APP_PORT || "16000",
        NEXT_TELEMETRY_DISABLED: "1",
      },
    },
  ],
};
