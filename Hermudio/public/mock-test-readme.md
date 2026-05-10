# Hermudio Mock 测试说明

## 📁 文件说明

- `mock-test.html` - 本地测试页面，包含完整的 Mock 数据和测试用例
- `index.html` - 原始应用（已修复 Bug）

## 🚀 快速开始

### 1. 启动本地服务器

在 `Hermudio/public` 目录下运行：

```bash
# 使用 Python 3
python -m http.server 6688

# 或使用 Node.js
npx serve . -p 6688

# 或使用 PHP
php -S localhost:6688
```

### 2. 打开测试页面

浏览器访问：`http://localhost:6688/mock-test.html`

## 🧪 测试功能

### 1. 服务器连接状态
- **测试连接** - 验证 Mock API 是否正常工作
- **模拟服务器错误** - 测试错误处理逻辑

### 2. TTS 语音合成测试
- **测试 TTS 基础功能** - 验证 Web Speech API 基础播放
- **测试长文本分段** - 验证修复后的 `speakLongText` 不重复调用 `onStart`
- **测试 Web Speech API** - 检查浏览器支持的语音列表
- **模拟 TTS 错误** - 验证错误回调处理

### 3. RadioHost 测试
- **测试 RadioHost 播报** - 模拟 Hermes 语音播报
- **测试文字同步高亮** - 验证 `Utils.splitTextForHighlight` 和文字高亮效果

### 4. 播放控制测试
- 播放/暂停/下一首按钮
- 歌曲列表点击切换
- 进度条动画
- 模拟播放失败

### 5. 修复验证测试

#### ✅ 修复 1: isConnected → isReady
验证 `updateHermesStatusIndicator` 方法现在正确使用 `ServerConnection.isReady`

#### ✅ 修复 2: onStart 不重复调用
验证 `speakLongText` 方法中 `onStart` 只被调用一次（使用 `hasCalledOnStart` 标志）

#### ✅ 修复 3: consecutiveFailures 重置
验证 `moveToNextSongAfterOutro` 方法正确重置连续失败计数器

#### ✅ 修复 4: Utils.splitTextForHighlight
验证公共工具函数正常工作，替代原来重复的代码

#### ✅ 修复 5: updateHermesProgress 边界
验证进度计算使用 `Math.min` 和 `Math.ceil`，确保边界情况正确处理

## 📊 Mock 数据结构

### 歌曲数据
```javascript
{
  id: 1,
  name: "晴天",
  artist: "周杰伦",
  album: "叶惠美",
  duration: 269000,
  encryptedId: "mock_enc_1"
}
```

### API 响应
- `GET /api/health` - 服务器健康检查
- `GET /api/status` - 播放状态
- `GET /api/radio/welcome` - 欢迎语
- `GET /api/radio/playlist` - 歌单列表
- `POST /api/radio/playlist-intro` - 歌单介绍
- `POST /api/radio/song-intro` - 歌曲介绍
- `POST /api/play` - 播放歌曲
- `POST /api/stop` - 停止播放
- `POST /api/chat` - 聊天响应

## 🔧 测试原应用

如果想测试修复后的 `index.html`，需要启动后端服务器。Mock 测试页面可以独立运行，无需后端。

## 📝 日志说明

测试页面底部有日志区域，显示：
- 🟢 绿色 - 成功信息
- 🔴 红色 - 错误信息
- 🟡 黄色 - 警告信息
- 🔵 蓝色 - 普通信息

## 🐛 故障排除

### Web Speech API 不可用
- 确保使用现代浏览器（Chrome、Edge、Safari）
- 检查浏览器权限设置
- 某些浏览器需要用户交互后才能播放语音

### Mock 服务器连接失败
- 检查端口 6688 是否被占用
- 确保在正确的目录启动服务器
- 尝试使用其他端口

## 📌 注意事项

1. Mock 数据仅用于测试，不包含真实音频
2. TTS 功能依赖浏览器的 Web Speech API
3. 播放进度是模拟的，不是真实音频播放
4. 所有 API 调用都有随机延迟（300-800ms）模拟网络请求
