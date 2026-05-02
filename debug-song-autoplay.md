# Debug Session: Song Autoplay Issue

**Status:** [IN-PROGRESS]  
**Session ID:** song-autoplay  
**Created:** 2025-01-30

## Problem Description

第一首歌播放完之后，没有自动播放第二首歌。歌曲总结(outro)和下一首歌的介绍(intro)没有被触发。

## Hypotheses

1. **H1:** `monitorSongProgress` 没有正确检测到歌曲结束（progress > 95% 或 isPlayingStatus = false）
2. **H2:** `onSongFinished` 被调用了，但 `API.post('/api/radio/song-outro')` 请求失败或卡住
3. **H3:** `RadioHost.speakWithSync` 的 `onEnd` 回调没有被触发
4. **H4:** `playCurrentSongWithIntro` 被调用了，但 `API.post('/api/radio/song-intro')` 请求失败
5. **H5:** `actuallyPlaySong` 被调用了，但 `API.play` 请求失败或没有正确启动歌曲播放

## Fixes Applied

### Fix 1: Improved Song End Detection Logic
**File:** `public/index.html`  
**Changes:**
- 添加了 `hasStartedPlaying` 标志，确保只有在歌曲真正开始播放后才检测停止状态
- 添加了 `consecutiveStoppedCount` 计数器，需要连续 2 次检测到停止状态才触发 outro
- 改进了日志输出，显示更多调试信息

**Reason:** 防止在歌曲刚开始播放时（ncm-cli 可能还未准备好）就误判为歌曲结束

### Fix 2: Error Recovery in actuallyPlaySong
**File:** `public/index.html`  
**Changes:**
- 当 `API.play` 返回失败或抛出异常时，等待 3 秒后自动尝试播放下一首歌

**Reason:** 防止因单首歌曲播放失败而导致整个流程卡住

### Fix 3: Backend Progress Support
**File:** `src/music-service.js`  
**Changes:**
- 在 `getStatus` 方法中添加了 `progress` 字段，根据 `position / duration` 计算播放进度
- 当 ncm-cli 报告 stopped/paused 状态时，正确更新 `isPlaying` 状态

**Reason:** 前端需要准确的进度信息来检测歌曲结束

## Test Checklist

请按以下步骤测试：

1. **刷新页面** - 确保加载最新代码
2. **打开浏览器开发者工具** - 切换到 Console 面板
3. **等待第一首歌播放** - 观察日志输出
4. **检查关键日志** - 你应该能看到：
   - `[RadioFlow] Song has started playing, progress: x.x%` - 歌曲开始播放
   - `[RadioFlow] Song progress: x.x%, isPlaying: true/false, hasStarted: true` - 进度更新
   - `[RadioFlow] Detected stopped state (1/2) or (2/2)` - 检测到停止状态
   - `[RadioFlow] Song finished detected` - 歌曲结束检测
   - `[RadioFlow] onSongFinished called` - 开始生成 outro
   - `[RadioFlow] Moving to next song` - 切换到下一首歌
   - `[RadioFlow] playCurrentSongWithIntro called` - 开始播放下一首

## Expected Behavior

1. 第一首歌播放完成（或 ncm-cli 报告 stopped 状态连续 2 次）
2. 触发 `[RadioFlow] Song finished detected`
3. 调用 `onSongFinished`，生成并播放歌曲总结 (outro)
4. Outro 播放完成后，自动切换到下一首歌
5. 生成并播放歌曲介绍 (intro)
6. 开始播放第二首歌

## If Issue Persists

如果问题仍然存在，请在浏览器 Console 中查找以下日志：

1. **如果没有看到 `Song finished detected`**
   - 检查 `progress` 是否正确更新
   - 检查 `isPlaying` 状态变化

2. **如果看到 `onSongFinished called` 但没有后续日志**
   - 检查 `API.post('/api/radio/song-outro')` 是否成功
   - 检查 TTS 是否正常工作

3. **如果看到 `Moving to next song` 但没有播放**
   - 检查 `playCurrentSongWithIntro` 是否被调用
   - 检查 `API.post('/api/radio/song-intro')` 是否成功

## Root Cause

*To be determined after testing*

## Cleanup

*To be done after confirmation*
