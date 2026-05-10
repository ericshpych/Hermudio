# CLAUDE.md

Hermudio - AI 个性化音乐电台

## 开发命令

### 启动服务

```bash
# 安装依赖
npm install

# 启动开发服务器（端口 6688）
npm start
# 或
node server.js
```

### 服务地址

- 开发服务器：http://localhost:6688
- Hermes AI 服务：http://localhost:8642（需单独启动）

---

## 项目概述

Hermudio 是一个 AI 个性化音乐电台项目，通过 AI DJ 自动播报开场白、歌曲介绍、过渡文案，支持语音播报。提供电台模式和聊天模式两种交互方式，根据时间、天气、场景智能推荐音乐。

### 核心特性

- **电台模式**：AI 自动播报、自动推荐、连续播放
- **聊天模式**：对话式交互、用户主动点歌、30 秒自动播放
- **场景感知**：根据时间（早/中/晚/夜）、天气自动调整推荐策略
- **语音合成**：MiniMax TTS + 浏览器语音降级方案

---

## 技术架构

### 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vanilla JavaScript + HTML5 + CSS3（移动优先设计） |
| 后端 | Node.js + Express |
| 数据库 | SQLite3 |
| 音乐源 | @music163/ncm-cli（网易云音乐 CLI） |
| AI 服务 | Hermes AI（本地 LLM 服务，端口 8642） |
| TTS | MiniMax TTS API（speech-2.8-hd）+ edge-tts-nodejs + Web Speech API |
| 天气 API | Open-Meteo（免费，无需 API Key） |

### 依赖包

```json
{
  "name": "hermudio",
  "version": "1.0.0",
  "dependencies": {
    "edge-tts-nodejs": "^1.0.6",
    "express": "^4.18.2",
    "node-fetch": "^2.7.0",
    "sqlite3": "^5.1.6"
  }
}
```

**⚠️ 依赖问题：** `axios` 在代码中用于 MiniMax TTS API 调用，但未在 package.json 中声明。需手动安装：

```bash
npm install axios
```

### 系统架构图

```
User Browser --> Express Server (6688)
                     |
                     +-- MusicService --> ncm-cli --> Netease Music
                     +-- RecommendationEngine --> SQLite DB
                     +-- HermesService --> Hermes AI (8642)
                     +-- SceneAnalyzer --> Open-Meteo API
                     +-- RadioHostService
                     +-- UserProfile --> SQLite DB
                     +-- TTS Controller --> MiniMax API / Edge TTS
```

---

## 项目结构

```
Hermudio/
├── server.js                    # Express 服务器（端口 6688）
├── package.json                 # 依赖配置
├── src/
│   ├── music-service.js         # 音乐服务（ncm-cli 集成）
│   ├── recommendation-engine.js # 推荐引擎
│   ├── scene-analyzer.js        # 场景分析器（时间/天气）
│   ├── hermes-service.js        # Hermes AI 服务集成
│   ├── radio-host-service.js     # 电台主持人服务
│   ├── radio-host.js            # 电台主持人（旧版）
│   ├── tts-service.js           # TTS 服务（浏览器端）
│   └── user-profile.js          # 用户画像服务
├── public/
│   ├── index.html               # 主页面（电台+聊天双模式）
│   ├── sw.js                    # Service Worker
│   └── *.html                   # 测试页面
└── data/
    └── hermudio.db              # SQLite 数据库
```

---

## 核心服务

### MusicService (`src/music-service.js`)

负责与 ncm-cli 交互，执行音乐搜索、播放、停止等操作。

**主要方法：**
- `searchSongs(keyword, limit)` - 搜索歌曲
- `getPlayUrl(songId)` - 获取播放地址
- `getLyrics(songId)` - 获取歌词
- `play(songId)` - 播放歌曲
- `stop()` - 停止播放
- `next()` / `previous()` - 下一首/上一首
- `getQueue()` / `setQueue()` - 播放队列管理

### RecommendationEngine (`src/recommendation-engine.js`)

基于场景和用户偏好的多策略推荐引擎。

**推荐策略：**
1. 场景匹配（时间/天气/心情）
2. 用户偏好匹配
3. 每日播放去重
4. 跳过模式过滤（电子、嘻哈、白噪音等）
5. 兜底推荐链

**主要方法：**
- `getRecommendation(userId)` - 获取推荐歌曲
- `getSceneRecommendation(scene)` - 场景推荐
- `getMoodRecommendation(mood)` - 心情推荐

### SceneAnalyzer (`src/scene-analyzer.js`)

获取当前场景上下文信息。

**功能：**
- 获取当前时段（morning/afternoon/evening/night）
- 调用 Open-Meteo API 获取天气
- 根据时间和天气推断心情

**时段细分：**
- 凌晨（0-5点）、清晨（5-7点）、早晨（7-9点）
- 上午（9-12点）、中午（12-14点）、下午（14-17点）
- 傍晚（17-19点）、晚上（19-22点）、深夜（22-24点）

### HermesService (`src/hermes-service.js`)

与本地 Hermes AI 服务通信（端口 8642）。

**功能：**
- 处理用户聊天消息，解析意图
- 生成电台口播文案（开场白/歌曲介绍/过渡语）
- 支持多种对话场景（点歌、推荐、控制播放等）

**System Prompt 角色：**
- `Hermes` - AI 音乐助手，负责对话和推荐
- `Radio Host` - 电台主持人，负责口播文案

### RadioHostService (`src/radio-host-service.js`)

管理电台播报流程，生成口播文案。

**文案类型：**
- 欢迎语（<100 字）
- 歌曲介绍（15-20 秒播报时长）
- 歌曲结束语（10-15 秒播报时长）
- 过渡文案
- 结束语

**兜底策略：** 当 Hermes AI 不可用时，使用本地多样化模板库。

### UserProfile (`src/user-profile.js`)

管理用户偏好数据，学习用户喜好。

**数据内容：**
- 偏好风格（preferredStyles）
- 偏好艺人（preferredArtists）
- 不喜欢风格（dislikedStyles）
- 播放历史（playHistory）
- 跳过模式（skipPatterns）
- 偏好时段（favoriteTimes）

---

## API 路由

### 核心 API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/health | 健康检查 |
| GET | /api/scene | 获取当前场景（时间/天气） |
| GET | /api/search | 搜索歌曲 |
| GET | /api/recommend | 获取推荐歌曲 |
| POST | /api/play | 播放指定歌曲 |
| POST | /api/play-recommend | 播放推荐歌曲 |
| POST | /api/stop | 停止播放 |
| POST | /api/previous | 播放上一首 |
| GET | /api/status | 获取播放状态 |
| GET | /api/song/:songId | 获取歌曲详情 |
| GET | /api/lyrics/:songId | 获取歌词 |

### 服务状态

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/hermes/status | 检查 Hermes AI 服务可用性 |
| GET | /api/tts/status | 检查 TTS 配置状态 |

### 用户与反馈

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/profile | 获取用户画像 |
| POST | /api/profile | 更新用户画像 |
| POST | /api/feedback | 记录喜欢/跳过反馈 |
| GET | /api/stats | 获取用户统计 |
| GET | /api/history | 获取播放历史 |

### 聊天功能

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/chat | Hermes AI 聊天 |
| GET | /api/chat/history | 获取聊天历史 |
| POST | /api/chat/clear | 清空聊天历史 |
| GET | /api/chat/welcome | 获取聊天欢迎语 |

### 电台功能

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/radio/welcome | 生成电台欢迎语 |
| POST | /api/radio/song-intro | 生成歌曲介绍 |
| POST | /api/radio/song-outro | 生成歌曲结束语 |
| POST | /api/radio/playlist-intro | 生成歌单介绍 |
| GET | /api/radio/closing | 生成结束语 |
| GET | /api/radio/playlist | 获取今日歌单 |
| POST | /api/radio/mark-played | 标记歌曲已播放 |
| POST | /api/radio/clear-played | 清除播放记录 |

### 认证

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/login-url | 获取网易云登录 URL |
| POST | /api/auth/login | 开始网易云登录 |
| GET | /api/auth/status | 检查登录状态 |
| POST | /api/auth/logout | 退出登录 |

### 本地音乐库

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/library | 获取本地音乐库列表 |
| POST | /api/library | 添加歌曲到本地音乐库 |

### TTS

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/tts/voices | 获取 TTS 音色列表 |
| POST | /api/tts/doubao | MiniMax 语音合成 |

---

## 数据模型

### 数据库表结构

```sql
-- 用户画像表
CREATE TABLE user_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT UNIQUE NOT NULL,
    preferred_styles TEXT DEFAULT '[]',
    preferred_artists TEXT DEFAULT '[]',
    disliked_styles TEXT DEFAULT '[]',
    play_history TEXT DEFAULT '[]',
    skip_patterns TEXT DEFAULT '{}',
    favorite_times TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 播放历史表
CREATE TABLE play_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    song_id TEXT NOT NULL,
    played_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 本地音乐库表
CREATE TABLE local_library (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    song_id TEXT UNIQUE NOT NULL,
    song_name TEXT,
    artist TEXT,
    album TEXT,
    styles TEXT DEFAULT '[]',
    can_play BOOLEAN DEFAULT 1,
    play_count INTEGER DEFAULT 0,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 用户反馈表
CREATE TABLE user_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    song_id TEXT NOT NULL,
    song_name TEXT,
    artist TEXT,
    action TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 每日播放记录表（避免重复推荐）
CREATE TABLE daily_plays (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    song_id TEXT NOT NULL,
    play_date TEXT NOT NULL,
    play_count INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(song_id, play_date)
);
```

### 核心类型定义

```typescript
// 歌曲类型
interface Song {
  id: string;              // 加密 ID
  encryptedId: string;     // 加密 ID（用于 ncm-cli）
  originalId: number;      // 原始 ID
  name: string;
  artist: string;
  album: string;
  duration: number;
  canPlay: boolean;
  vipFlag: boolean;
  coverImgUrl?: string;
}

// 场景类型
interface Scene {
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  weather: 'sunny' | 'cloudy' | 'rainy' | 'snowy';
  mood: 'energetic' | 'happy' | 'relaxed' | 'focused' | 'melancholy' | 'peaceful';
  hour: number;
  timestamp: string;
}

// 用户画像类型
interface UserPreferences {
  userId: string;
  preferredStyles: string[];
  preferredArtists: string[];
  dislikedStyles: string[];
  playHistory: PlayRecord[];
  skipPatterns: Record<string, number>;
  favoriteTimes: Record<string, number>;
}

// 推荐结果类型
interface Recommendation {
  song: Song;
  reason: string;
  source: 'search' | 'library' | 'scene' | 'popular' | 'default' | 'style_match';
}

// AI 聊天响应类型
interface ChatResponse {
  message: string;
  action: 'play' | 'recommend' | 'pause' | 'skip' | 'feedback' | 'greeting' | 'chat' | 'info' | 'none';
  song?: Song;
  recommendedSongs?: Song[];
  autoPlayTimeout?: number;
}
```

---

## 前端页面

### 主页面 (`public/index.html`)

单页面应用，包含电台模式和聊天模式。

**模式切换：**
- 电台模式：AI 自动播报、自动推荐
- 聊天模式：对话式交互、用户主动点歌

**核心 UI 区域：**
- 歌曲信息区（封面、名称、艺人）
- 播放器控制区（播放/暂停、上一首/下一首、进度条）
- AI DJ 播报区（滚动字幕、逐字高亮）
- 播放列表（底部弹出式）

### 测试页面

- `mock-test.html` - Mock 数据测试
- `test-tts.html` - TTS 功能测试
- `test-mode-switch.html` - 模式切换测试
- `test-playback-failure.html` - 播放失败测试

---

## 开发规范

### 代码组织

- 服务代码按功能模块化，每个服务独立文件
- 前端代码：原生 JavaScript，无框架依赖
- 后端代码：Express 路由模块化组织

### 命名规范

- 变量/函数：camelCase
- 类名：PascalCase
- 常量：UPPER_SNAKE_CASE
- 文件：kebab-case

### API 设计规范

- RESTful API 设计
- 统一返回格式：`{ success: boolean, data?: any, message?: string, error?: string }`
- 错误处理：HTTP 状态码 + 错误信息

### AI 服务调用规范

**Hermes AI 调用：**
- 基础 URL：`http://localhost:8642/v1`
- 模型：`hermes-agent`
- 系统提示词包含两个角色：音乐助手（对话）和电台主持（口播）

**Prompt 要求：**
- 严禁输出思考过程、分析步骤
- 严禁自我指涉（"作为 AI"、"根据系统提示"）
- 直接输出最终回复内容
- 每次回复都要有所不同，避免重复

---

## 第三方服务

### ncm-cli 配置

- 配置目录：`../.ncm-home`（项目根目录）
- 登录凭证存储在 `~/.ncm-home/.config/ncm-cli/` 下
- 首次使用需扫码登录网易云音乐账号

### Hermes AI 服务

- 需要单独启动本地 Hermes AI 服务
- 默认端口：8642
- 提供自然语言对话和文案生成能力

### MiniMax TTS

- API 版本：speech-2.8-hd
- 需要配置 `MINIMAX_API_KEY` 和 `MINIMAX_GROUP_ID`
- API 地址：`https://api.minimaxi.com/v1/t2a_v2`
- 降级方案：edge-tts-nodejs（本地 TTS）+ 浏览器 Web Speech API

### Edge TTS

- 使用 `edge-tts-nodejs` 实现本地语音合成
- 不依赖外部 API，作为 MiniMax 的降级方案
- 支持多种语音角色

### Open-Meteo 天气

- 免费天气 API，无需 API Key
- 默认使用北京坐标（39.9042, 116.4074）
- 缓存时间：30 分钟

---

## 环境变量

```bash
# MiniMax TTS API（可选）
MINIMAX_API_KEY=your_api_key
MINIMAX_GROUP_ID=your_group_id

# 服务器端口（可选，默认 6688）
PORT=6688
```

---

## 常见问题

### ncm-cli 未登录

症状：播放歌曲提示无权限

解决：
```bash
# 检查登录状态
npx @music163/ncm-cli login --check

# 重新登录
npx @music163/ncm-cli login
```

### Hermes AI 服务不可用

症状：AI 对话或口播文案返回错误

解决：确保 Hermes AI 服务在 localhost:8642 运行

### 天气获取失败

症状：场景信息显示默认天气

解决：Open-Meteo API 需要网络连接，检查防火墙设置

---

## 数据库验证

### 表结构验证结果

| 表名 | 文档定义 | 实际实现 | 状态 |
|------|---------|---------|------|
| user_profiles | ✅ | ✅ | 一致 |
| play_history | ✅ | ✅ | 一致 |
| local_library | ✅ | ✅ | 一致 |
| user_feedback | ✅ | ✅ | 一致 |
| daily_plays | ✅ | ✅ | 一致 |

**验证结论：** 数据库表结构与文档定义完全一致。

### 索引

```sql
CREATE INDEX idx_daily_plays_date ON daily_plays(play_date);
```

---

## API 端点完整列表

| Method | Endpoint | Category | Description |
|--------|----------|----------|-------------|
| GET | /api/health | 核心 | 健康检查 |
| GET | /api/scene | 核心 | 获取当前场景（时间/天气） |
| GET | /api/search | 核心 | 搜索歌曲 |
| GET | /api/recommend | 核心 | 获取推荐歌曲 |
| POST | /api/play | 核心 | 播放指定歌曲 |
| POST | /api/play-recommend | 核心 | 播放推荐歌曲 |
| POST | /api/stop | 核心 | 停止播放 |
| POST | /api/previous | 核心 | 播放上一首 |
| GET | /api/status | 核心 | 获取播放状态 |
| GET | /api/song/:songId | 核心 | 获取歌曲详情 |
| GET | /api/lyrics/:songId | 核心 | 获取歌词 |
| GET | /api/hermes/status | 服务状态 | 检查 Hermes AI 可用性 |
| GET | /api/tts/status | 服务状态 | 检查 TTS 配置状态 |
| GET | /api/profile | 用户 | 获取用户画像 |
| POST | /api/profile | 用户 | 更新用户画像 |
| POST | /api/feedback | 用户 | 记录喜欢/跳过反馈 |
| GET | /api/stats | 用户 | 获取用户统计 |
| GET | /api/history | 用户 | 获取播放历史 |
| POST | /api/chat | 聊天 | Hermes AI 聊天 |
| GET | /api/chat/history | 聊天 | 获取聊天历史 |
| POST | /api/chat/clear | 聊天 | 清空聊天历史 |
| GET | /api/chat/welcome | 聊天 | 获取聊天欢迎语 |
| GET | /api/radio/welcome | 电台 | 生成电台欢迎语 |
| POST | /api/radio/song-intro | 电台 | 生成歌曲介绍 |
| POST | /api/radio/song-outro | 电台 | 生成歌曲结束语 |
| POST | /api/radio/playlist-intro | 电台 | 生成歌单介绍 |
| GET | /api/radio/closing | 电台 | 生成结束语 |
| GET | /api/radio/playlist | 电台 | 获取今日歌单 |
| POST | /api/radio/mark-played | 电台 | 标记歌曲已播放 |
| POST | /api/radio/clear-played | 电台 | 清除播放记录 |
| GET | /api/login-url | 认证 | 获取网易云登录 URL |
| POST | /api/auth/login | 认证 | 开始网易云登录 |
| GET | /api/auth/status | 认证 | 检查登录状态 |
| POST | /api/auth/logout | 认证 | 退出登录 |
| GET | /api/library | 音乐库 | 获取本地音乐库 |
| POST | /api/library | 音乐库 | 添加到本地音乐库 |
| GET | /api/tts/voices | TTS | 获取 TTS 音色列表 |
| POST | /api/tts/doubao | TTS | MiniMax 语音合成 |

**总计：** 36 个 API 端点
