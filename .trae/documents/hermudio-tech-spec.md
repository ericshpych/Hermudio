# Hermudio 技术架构文档

## 1. 架构设计

```mermaid
graph TD
    A[User Browser] --> B[Frontend HTML/JS/CSS]
    B --> C[Express Backend Server]
    C --> D[Netease Cloud Music CLI]
    C --> E[MiniMax TTS API]
    C --> F[Open-Meteo Weather API]
    B --> G[Hermes AI Local Service]
    D --> H[Netease Music Service]

    subgraph "Frontend Layer"
        B
    end

    subgraph "Backend Layer"
        C
    end

    subgraph "External Services"
        D
        E
        F
        H
    end

    subgraph "Local AI Service"
        G
    end
```

## 2. 技术描述

- **Frontend**: Vanilla JavaScript + HTML5 + CSS3（无框架）
- **Backend**: Node.js@20 + Express@4
- **Music Source**: Netease Cloud Music CLI (@music163/ncm-cli)
- **TTS Service**: MiniMax TTS API (speech-2.8-hd) + 浏览器Web Speech API
- **Weather API**: Open-Meteo (Free, no API key required)
- **AI Service**: Hermes Local AI (localhost:8642)
- **Initialization Tool**: npm init

### 核心依赖

```json
{
  "dependencies": {
    "axios": "^1.8.4",
    "cors": "^2.8.6",
    "express": "^4.22.1"
  }
}
```

## 3. 路由定义

| Route | Purpose |
|-------|---------|
| / | 主页面，包含电台模式和聊天模式 |
| /test-tts.html | TTS测试页面 |

## 4. API 定义

### 4.1 网易云音乐 CLI API

#### 登录相关
```
POST /api/cli/login
```

Response:
| Param Name | Param Type | Description |
|------------|------------|-------------|
| code | number | 200成功 |
| success | boolean | 登录状态 |
| loginUrl | string | 扫码登录链接 |
| message | string | 提示信息 |

```
GET /api/cli/login/check
```

Response:
| Param Name | Param Type | Description |
|------------|------------|-------------|
| isLoggedIn | boolean | 是否已登录 |
| loginSession | object | 登录会话状态 |

#### 歌曲搜索与播放
```
GET /api/cli/search?keyword={keyword}&limit={limit}
```

Response:
| Param Name | Param Type | Description |
|------------|------------|-------------|
| data | Song[] | 歌曲列表 |
| success | boolean | 请求状态 |

```
POST /api/cli/play
```

Request:
| Param Name | Param Type | isRequired | Description |
|------------|------------|------------|-------------|
| songId | string | true | 歌曲加密ID |
| originalId | number | false | 歌曲原始ID |
| songName | string | false | 歌曲名称 |
| artist | string | false | 艺人名称 |

```
POST /api/cli/pause
POST /api/cli/resume
POST /api/cli/next
POST /api/cli/prev
POST /api/cli/stop
```

#### 播放状态
```
GET /api/cli/status
```

Response:
| Param Name | Param Type | Description |
|------------|------------|-------------|
| isPlaying | boolean | 播放状态 |
| currentSong | Song | 当前歌曲 |
| volume | number | 音量 |
| playMode | string | 播放模式 |

```
GET /api/cli/playlist
```

Response:
| Param Name | Param Type | Description |
|------------|------------|-------------|
| data | Song[] | 播放列表 |
| currentIndex | number | 当前索引 |

#### 推荐歌曲
```
GET /api/cli/recommend/songs
```

Response:
| Param Name | Param Type | Description |
|------------|------------|-------------|
| data | Song[] | 推荐歌曲列表 |
| message | string | 提示信息 |

#### 音量与模式
```
POST /api/cli/volume
```

Request:
| Param Name | Param Type | Description |
|------------|------------|-------------|
| volume | number | 音量值 0-100 |

```
POST /api/cli/mode
```

Request:
| Param Name | Param Type | Description |
|------------|------------|-------------|
| mode | string | sequence/random/loop |

#### 日志与调试
```
GET /api/cli/logs?lines={lines}
```

Response:
| Param Name | Param Type | Description |
|------------|------------|-------------|
| logs | string | ncm-cli日志 |
| errors | array | 分析后的错误列表 |

### 4.2 TTS API

#### 获取音色列表
```
GET /api/tts/voices
```

Response:
| Param Name | Param Type | Description |
|------------|------------|-------------|
| data | VoiceCategories | 分类音色列表 |

#### 语音合成
```
POST /api/tts/doubao
```

Request:
| Param Name | Param Type | isRequired | Description |
|------------|------------|------------|-------------|
| text | string | true | 要合成的文本 |
| voice_type | string | false | 音色类型 |
| speed | number | false | 语速 |
| vol | number | false | 音量 |
| pitch | number | false | 音调 |

Response:
| Param Name | Param Type | Description |
|------------|------------|-------------|
| data.audio | string | Base64编码的音频 |
| data.format | string | 音频格式 |

#### TTS状态检查
```
GET /api/tts/status
```

Response:
| Param Name | Param Type | Description |
|------------|------------|-------------|
| configured | boolean | 是否已配置 |
| has_api_key | boolean | 是否有API Key |

### 4.3 TypeScript 类型定义

```typescript
// 歌曲类型
interface Song {
  id: string;
  originalId: number;
  name: string;
  artist: string;
  album: string;
  duration: number;
  canPlay: boolean;
  coverImgUrl?: string;
}

// 用户偏好类型
interface UserPreferences {
  favoriteArtists: Map<string, number>;
  favoriteGenres: Map<string, number>;
  favoriteEras: Map<string, number>;
  likedSongs: Set<string>;
  skippedSongs: Set<string>;
  playHistory: PlayRecord[];
  importedPlaylists: Playlist[];
}

interface PlayRecord {
  song: string;
  artist: string;
  timestamp: number;
}

interface Playlist {
  id: string;
  name: string;
  songCount: number;
  importTime: number;
}

// AI DJ 状态
interface DJState {
  weather: string | null;
  temperature: number | null;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  mood: string | null;
  consecutiveSkips: number;
  userPreferences: UserPreferences;
}

// TTS 配置
interface TTSConfig {
  enabled: boolean;
  currentVoice: string;
  speed: number;
  vol: number;
  pitch: number;
  availableVoices: {
    male: VoiceOption[];
    female: VoiceOption[];
  };
}

interface VoiceOption {
  id: string;
  name: string;
  desc: string;
  tags: string[];
}
```

## 5. 服务器架构图

```mermaid
graph TD
    A[Client / Browser] --> B[Express Router]
    B --> C[CLI Controller]
    B --> D[TTS Controller]
    B --> E[Static Files]
    C --> F[ncm-cli Process]
    D --> G[MiniMax API]
    F --> H[Netease Music Service]

    subgraph "Frontend"
        A
    end

    subgraph "Express Server"
        B
        C
        D
        E
    end

    subgraph "External Services"
        G
        H
    end
```

## 6. 数据模型

### 6.1 本地存储数据结构

由于本项目使用本地存储（localStorage）保存用户数据，无后端数据库。

```typescript
// localStorage Keys
const STORAGE_KEYS = {
  HERMUDIO_USER_PREFERENCES: 'hermudio_user_preferences',
  HERMUDIO_USER_PROFILE: 'hermudio_user_profile'
};

// 用户偏好存储结构
interface StoredPreferences {
  favoriteArtists: [string, number][];
  favoriteGenres: [string, number][];
  favoriteEras: [string, number][];
  likedSongs: string[];
  skippedSongs: string[];
  playHistory: PlayRecord[];
  importedPlaylists: Playlist[];
}
```

### 6.2 核心类设计

#### DJController (dj-controller.js)
```javascript
class DJController {
  mode: 'music' | 'dj';
  isPlaying: boolean;
  currentTrack: Song | null;
  playlist: Song[];
  currentIndex: number;
  playHistory: PlayRecord[];
  djState: DJState;
  ttsConfig: TTSConfig;
  artistRelations: object;
  styleKeywords: object;
  scripts: object;
  
  // 核心方法
  async startDJMode(): Promise<DJResult>;
  stopDJMode(): void;
  async speak(text: string): Promise<TTSResult>;
  async playSong(song: Song): Promise<PlayResult>;
  recordPlayBehavior(song: Song, behavior: string): void;
  calculatePreferenceScore(song: Song): number;
  async getRealWeather(): Promise<WeatherResult>;
  generateDynamicIntro(): Promise<IntroResult>;
  generateSmartSongIntro(songName: string, artistName: string): string;
}
```

#### DJView (dj-view.js)
```javascript
class DJView {
  isActive: boolean;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  audioData: number[];
  waveOffset: number;
  currentTranscript: string;
  isSpeaking: boolean;
  currentSong: Song | null;
  progress: number;
  volume: number;
  isPlaying: boolean;
  
  // 核心方法
  create(): void;
  show(): void;
  hide(): void;
  initVisualizer(): void;
  drawVisualizer(): void;
  updateTranscript(text: string, speaking: boolean): void;
  updateSongInfo(song: Song): void;
  updatePlayState(isPlaying: boolean): void;
  updateProgress(current: number, total: number): void;
  updateVolume(volume: number): void;
  updateWeather(weather: string, icon: string): void;
}
```

#### HermesBridge (hermes-bridge.js)
```javascript
class HermesBridge {
  config: HermesConfig;
  conversationHistory: Message[];
  conversationId: string | null;
  systemPrompt: string;
  currentRequestController: AbortController | null;
  
  // 核心方法
  async checkAvailability(): Promise<AvailabilityResult>;
  async sendMessage(userMessage: string, context: object): Promise<MessageResult>;
  async sendMessageStream(userMessage: string, context: object, onChunk: Function): Promise<MessageResult>;
  buildContextualPrompt(userMessage: string, context: object): string;
  updateHistory(userMessage: string, assistantMessage: string): void;
  clearHistory(): void;
  cancelCurrentRequest(): void;
}
```

#### PlaylistImporter (playlist-importer.js)
```javascript
class PlaylistImporter {
  API_BASE: string;
  userProfile: UserProfile;
  recommendConfig: RecommendConfig;
  
  // 核心方法
  async importNeteasePlaylist(url: string): Promise<ImportResult>;
  async importFromText(text: string, source: string): Promise<ImportResult>;
  parseSongLine(line: string): ParsedSong | null;
  async enrichSongs(songs: Song[]): Promise<Song[]>;
  updateProfileFromSongs(songs: Song[], source: string): void;
  recordPlayBehavior(song: Song, behavior: string): void;
  async getPersonalizedRecommendations(options: object): Promise<RecommendResult>;
  calculateRecommendationScore(song: Song, mood: string | null, timeOfDay: string | null): number;
  getTopArtists(count: number): string[];
  getUserProfileSummary(): ProfileSummary;
}
```

## 7. 组件清单

### 7.1 前端组件

| 组件名 | 用途 | 文件位置 |
|--------|------|----------|
| AppState | 全局状态管理 | index.html (inline) |
| DJController | DJ逻辑控制器 | dj-controller.js |
| DJView | DJ全屏视图 | dj-view.js |
| HermesBridge | AI聊天桥接 | hermes-bridge.js |
| PlaylistImporter | 歌单导入与推荐 | playlist-importer.js |

### 7.2 后端模块

| 模块名 | 用途 | 文件位置 |
|--------|------|----------|
| Server | Express服务器主入口 | server.js |
| CLI API | 网易云CLI接口封装 | server.js (CLI routes) |
| TTS API | 语音合成接口 | server.js (TTS routes) |

## 8. 项目结构

```
Hermudio/
├── server.js                 # Express服务器主文件
├── dj-controller.js          # AI DJ控制器
├── dj-view.js               # DJ全屏视图组件
├── hermes-bridge.js          # Hermes AI桥接服务
├── playlist-importer.js      # 歌单导入与推荐系统
├── index.html               # 主页面（含电台和聊天模式）
├── test-tts.html            # TTS测试页面
├── .ncm-home/               # 网易云CLI配置目录
│   └── .config/ncm-cli/
├── package.json             # 项目依赖
└── .trae/documents/         # 文档目录
    ├── hermudio-prd.md      # PRD文档
    └── hermudio-tech-spec.md  # 技术文档
```

## 9. 开发规范

### 9.1 代码组织

- 前端代码：原生JavaScript，无框架依赖
- 后端代码：Express路由模块化组织
- 配置文件：环境变量管理敏感信息

### 9.2 命名规范

- 变量/函数：camelCase
- 类名：PascalCase
- 常量：UPPER_SNAKE_CASE
- 文件：kebab-case

### 9.3 API设计规范

- RESTful API设计
- 统一返回格式：`{ success: boolean, data?: any, message?: string, error?: string }`
- 错误处理：HTTP状态码 + 错误信息

## 10. 部署说明

### 10.1 环境要求

- Node.js >= 18.0.0
- npm >= 9.0.0
- macOS / Linux / Windows
- Hermes AI服务（本地运行，端口8642）

### 10.2 启动步骤

```bash
# 安装依赖
npm install

# 启动服务器
npm start

# 服务器运行在 http://localhost:6588
```

### 10.3 环境变量

```bash
# MiniMax TTS API配置（可选，有默认值）
MINIMAX_API_KEY=your_api_key
MINIMAX_GROUP_ID=your_group_id
```

## 11. 第三方服务集成

### 11.1 网易云音乐 CLI

- 包名：@music163/ncm-cli
- 功能：音乐搜索、播放、歌单管理
- 配置：自动在项目目录下创建.ncm-home配置

### 11.2 MiniMax TTS

- API版本：speech-2.8-hd
- 功能：文本转语音
- 音色：支持多种男女声、特色音色

### 11.3 Open-Meteo Weather

- 免费天气API
- 无需API Key
- 支持全球位置天气查询

### 11.4 Hermes AI

- 本地AI服务
- API端口：8642
- 功能：自然语言理解、对话生成、歌曲推荐
