# 线上自习室（仅两人）

## 目录
- `client/`：Vue 3 + Vite 前端（开发阶段占位素材）
- `server/`：Node.js + Express + SQLite 后端（同域托管前端静态资源）

## 预设账号
- 小鸡毛 / 20041203
- 小白 / 20041016

> 可在 `server/src/db/seed.js` 修改。

## 本地开发
1. 安装依赖：
   - 在仓库根目录运行：`npm install`
2. 一键启动（推荐，VS Code 终端直接跑）：
   - `python start.py`
3. 手动启动（等价于一键启动）：
   - 启动后端（会提供 API，并在生产模式下托管前端 dist）：
   - `npm run dev`
   - 启动前端开发服务器（带代理到后端）：
   - 新开终端：`npm run dev:client`

前端开发访问：Vite 默认 `http://localhost:5173`（会代理 `/api` 到后端）。

## 生产部署（腾讯云）
1. 在服务器上构建：`npm install && npm run build`
2. 启动：`npm start`

默认端口：`3000`（可用 `PORT` 环境变量覆盖）。

## 环境变量
复制 `server/.env.example` 为 `server/.env` 并按需修改。
