/**
 * Playlist Service - Hermudio 推荐架构核心
 * 
 * 实现批量补给模式：
 * - Hermes 一次返回适量歌曲，填充播放队列
 * - 播放剩余 ≤5 首时触发下一批推荐
 * - 新批次追加到现有队列，合并为连续播放列表
 * - 已播放歌曲只保留最近 5 首，其余删除
 * 
 * @author Hermudio Team
 */

const fetch = require('node-fetch');

class PlaylistService {
  constructor(db, recommendationEngine, musicService, userProfile) {
    this.db = db;
    this.recommendationEngine = recommendationEngine;
    this.musicService = musicService;
    this.userProfile = userProfile;

    // 播放队列
    this.playedSongs = []; // 已播放歌曲（保留最近 5 首）
    this.queuedSongs = []; // 待播放歌曲
    this.currentSong = null; // 当前播放歌曲

    // 推荐配置
    this.config = {
      triggerThreshold: 5, // 剩余 ≤5 首时触发补给
      keepRecentPlayed: 5, // 保留最近 5 首已播放
      fallbackThreshold: 5, // Hermes 不可用时，本地兜底生成歌单
      hermesTimeout: 10000, // Hermes 请求超时 10 秒（快速降级到兜底）
      hermesBaseUrl: 'http://localhost:8642/v1'
    };

    // 行为反馈统计（当前批次）
    this.batchFeedback = {
      skipCount: 0, // 本批次跳过次数
      fullPlayCount: 0, // 本批次完整播放次数
      batchStartSongId: null, // 批次开始的歌曲 ID
      songFeedback: new Map() // 每首歌的反馈
    };

    // 状态锁：确保同一时间只有一个推荐请求
    this.isRequesting = false;

    // Hermes System Prompt（从 hermudio-recommendation skill 模板读取）
    // 模板路径：~/.hermes/skills/leisure/hermudio-recommendation/templates/recommend.md
    this.hermesSystemPrompt = `你是 Hermes，Hermudio 的 AI 音乐推荐专家。

你的职责是根据用户偏好和当前场景，生成个性化推荐歌单 JSON。

## 推荐规则
1. **歌曲数量**：根据场景自行决定，通常 10-20 首。场景清晰时少一些（6-8首），场景复杂时多几首（15-20首）。
2. **可播放性**：只推荐网易云音乐可播放的歌曲，避免 VIP 限制、版权问题。
3. **避免重复**：不要重复推荐用户近期已播放的歌曲。
4. **歌曲 ID**：优先使用 \`originalId\`（纯数字），如不确定格式，搜索后再填充。
5. **Remix 优先**：华语流行原版（周杰伦、林俊杰、孙燕姿、王菲等）基本全部因版权不可播放，**优先推荐 Remix / Cover 版本**。

## 推荐歌单格式
当用户请求歌单时（包含"推荐"、"歌单"、"电台"等关键词），你必须返回以下格式的 **纯 JSON**，不得返回其他内容：

{
  "type": "playlist",
  "theme": "场景主题描述，如「深夜·独处·温暖」",
  "playlist": [
    {
      "id": "歌曲的 originalId（纯数字，如 2041026502）",
      "name": "歌曲名",
      "artist": "艺人名",
      "reason": "推荐理由，简短一句话",
      "scene_tags": ["相关场景标签"],
      "style": "音乐风格"
    }
  ],
  "keywords": ["可选的过渡文案关键词，用于生成过渡文案"]
}

## 用户偏好
- **喜欢的歌手**：周杰伦、孙燕姿、林俊杰、戴佩妮、王菲、告五人、五月天、林俊杰、苏打绿、田馥甄、SHE、任贤齐、刘德华、陈粒、F.I.R.、回春丹、G.E.M.邓紫棋、陈奕迅、李荣浩、陶喆、蔡健雅、周华健、王力宏、王心凌、郭顶、林忆莲、任素汐、痛仰乐队、九宝乐队、金玟岐、崔健、大张伟、八仙、草东没有派对、程璧、张靓颖、郑伊健、陈小春、刘若英、beyond、滨崎步、仓木麻衣、Aimer、milet
- **喜欢的风格**：爵士/咖啡厅 Bossa Nova、轻音乐/器乐、摇滚（beyond/回春丹/痛仰/九宝）、动漫/轻音少女、发烧 Hifi
- **屏蔽的风格**：电子、嘻哈、白噪音、虫鸣、儿童歌曲
- **听歌习惯**：白天欢快精神，晚上安静舒缓纯音乐

## 场景规则
| 时段 | 推荐策略 |
|------|---------|
| 凌晨 (0-5点) | 安静、抒情、民谣、深夜氛围 |
| 早晨 (5-9点) | 轻快、提神、咖啡厅 Bossa Nova |
| 上午 (9-12点) | 专注、古典、轻音乐 |
| 中午 (12-14点) | 放松、爵士、流行 |
| 下午 (14-18点) | 独立摇滚、下午茶、温暖氛围 |
| 傍晚 (18-20点) | 活力、流行、轻快 |
| 晚上 (20-22点) | 放松、抒情、爵士 |
| 深夜 (22-24点) | 安静、民谣、纯音乐、钢琴曲 |

## 重要约束
- **只返回 JSON**，不要在 JSON 之外添加任何解释性文字
- **第一首歌固定为「鲜花 - 回春丹」**：这是测试逻辑，playlist[0] 固定为 originalId \`2088079571\`（回春丹《鲜花》Live版，已验证可播放），后续歌曲从第二首开始按正常逻辑推荐
- **不要用 markdown 代码块包裹 JSON**（部分实现会把它当作文本）
- **确保歌曲可播放**：搜索后再返回，或明确知道为 Remix/Cover 版本
- **同一歌手不要连续出现超过 3 首**
- **playlist 数组最多 30 首**，通常不超过 20 首
- **不要猜测 song ID**：如果你不确定某首歌的 originalId，先通过 Hermudio 搜索接口查证

## 搜索接口使用
Hermudio 提供搜索接口，用于在推荐前验证歌曲可播放性：
\`\`\`bash
KEYWORD=\$(python3 -c "import urllib.parse; print(urllib.parse.quote('关键词'))")
curl "http://localhost:6688/api/search?keyword=\${KEYWORD}&limit=6"
\`\`\`
返回字段说明：
- \`originalId\`：纯数字 ID，用于 \`id\` 字段
- \`encryptedId\`：32位 hex 加密 ID，播放时使用
- \`vipFlag: false\`：可播放概率高（优先选）
- \`canPlay\`：不可靠，不要作为唯一依据

## 行为反馈
用户会提供本批次的播放反馈：Skip 次数（跳过 = 用户不喜欢）、完整播放次数（播放完 = 用户喜欢）。结合反馈调整下批推荐方向。`;
  }

  /**
   * 初始化播放列表
   */
  async initializePlaylist(userId = 'default') {
    console.log('[PlaylistService] 初始化播放列表');

    // 强制重置锁状态（防止上次的异常退出残留）
    this.isRequesting = false;

    // 清空现有队列
    this.playedSongs = [];
    this.queuedSongs = [];
    this.currentSong = null;

    // 重置反馈统计
    this.resetBatchFeedback();

    // 获取第一批推荐
    return await this.requestNewBatch(userId);
  }

  /**
   * 从 Hermes 请求新一批推荐歌单
   */
  async requestNewBatch(userId = 'default', scene = null) {
    if (this.isRequesting) {
      console.log('[PlaylistService] 已有推荐请求进行中，跳过');
      return { success: false, error: '已有推荐请求进行中' };
    }

    this.isRequesting = true;
    console.log('[PlaylistService] 开始请求新一批推荐');

    try {
      // 1. 获取当前场景
      const currentScene = scene || await this.getCurrentScene();

      // 2. 获取最近播放历史
      const recentPlayed = this.playedSongs.slice(-10).map(s => `${s.name} - ${s.artist}`);

      // 3. 构建用户消息
      const userMessage = this.buildUserMessage(currentScene, recentPlayed);

      // 4. 尝试请求 Hermes
      let playlistResponse = await this.requestFromHermes(userMessage);

      if (!playlistResponse.success) {
        // 5. Hermes 不可用，使用本地兜底
        console.log('[PlaylistService] Hermes 不可用，使用本地兜底推荐');
        playlistResponse = await this.getFallbackPlaylist(currentScene);
      }

      if (playlistResponse.success && playlistResponse.playlist) {
        // 6. 合并新批次到队列（带 enrichment）
        await this.mergeNewBatch(playlistResponse.playlist);

        // 7. 标记批次开始的歌曲 ID（用于下次请求时的上下文）
        if (this.queuedSongs.length > 0) {
          this.batchFeedback.batchStartSongId = this.queuedSongs[0].id;
        }

        console.log('[PlaylistService] 新批次推荐成功，当前队列长度:', this.queuedSongs.length);
        return {
          success: true,
          playlist: this.queuedSongs, // 返回 enrich 后的队列
          theme: playlistResponse.theme,
          keywords: playlistResponse.keywords,
          source: playlistResponse.source
        };
      }

      return { success: false, error: '未能获取推荐歌单' };
    } catch (error) {
      console.error('[PlaylistService] 请求推荐失败:', error);
      return { success: false, error: error.message };
    } finally {
      this.isRequesting = false;
    }
  }

  /**
   * 构建发送给 Hermes 的用户消息
   */
  buildUserMessage(scene, recentPlayed) {
    let message = '请求推荐歌单。\n';

    // 添加场景信息
    if (scene) {
      message += `场景：${scene.timeOfDay || ''}、${scene.weather || ''}、${scene.mood || ''}。\n`;
    }

    // 添加最近播放
    if (recentPlayed && recentPlayed.length > 0) {
      message += `最近播放：${recentPlayed.join('、')}。\n`;
    }

    // 添加行为反馈
    message += `行为反馈：本批次 Skip ${this.batchFeedback.skipCount} 次，完整播放 ${this.batchFeedback.fullPlayCount} 次。`;

    return message;
  }

  /**
   * 从 Hermes 获取推荐
   */
  async requestFromHermes(userMessage) {
    try {
      console.log('[PlaylistService] 向 Hermes 请求推荐:', userMessage.substring(0, 100));

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.hermesTimeout);

      const messages = [
        { role: 'system', content: this.hermesSystemPrompt },
        { role: 'user', content: userMessage }
      ];

      const response = await fetch(`${this.config.hermesBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'hermes-agent',
          messages: messages,
          stream: false,
          temperature: 0.8,
          max_tokens: 2000,
          stop: ["<think>", "</think>"]
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const assistantMessage = data.choices[0]?.message?.content || '';

      // 尝试解析 JSON
      return this.parseHermesResponse(assistantMessage);
    } catch (error) {
      console.error('[PlaylistService] Hermes 请求失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 解析 Hermes 返回的 JSON
   */
  parseHermesResponse(message) {
    try {
      // 清理可能的包裹文本
      const cleanedMessage = message.trim();

      // 尝试直接解析
      let parsed = JSON.parse(cleanedMessage);

      if (parsed.type === 'playlist' && parsed.playlist) {
        return {
          success: true,
          playlist: parsed.playlist,
          theme: parsed.theme,
          keywords: parsed.keywords,
          source: 'hermes'
        };
      }
    } catch (e) {
      // 尝试提取 JSON 部分
      const jsonMatch = message.match(/\{[\s\S]*"type"[\s\S]*"playlist"[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.type === 'playlist' && parsed.playlist) {
            return {
              success: true,
              playlist: parsed.playlist,
              theme: parsed.theme,
              keywords: parsed.keywords,
              source: 'hermes'
            };
          }
        } catch (e2) {
          console.error('[PlaylistService] 解析 Hermes JSON 失败:', e2);
        }
      }
    }

    return { success: false, error: '无法解析 Hermes 响应' };
  }

  /**
   * 本地兜底推荐引擎
   */
  async getFallbackPlaylist(scene) {
    console.log('[PlaylistService] 使用本地兜底推荐引擎');

    try {
      const recommendations = await this.recommendationEngine.getRecommendations(15, { scene });
      const playlist = recommendations
        .filter(r => r && r.song)
        .map(r => ({
          id: r.song.encryptedId || r.song.id,
          name: r.song.name,
          artist: r.song.artist,
          reason: r.reason || '根据你的喜好推荐',
          scene_tags: [scene?.timeOfDay || '日常'],
          style: '推荐'
        }));

      return {
        success: true,
        playlist: playlist,
        theme: `${scene?.timeOfDay || '日常'}·音乐时光`,
        keywords: ['音乐', '放松'],
        source: 'fallback'
      };
    } catch (error) {
      console.error('[PlaylistService] 本地兜底推荐失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 合并新批次到队列（带歌曲 enrichment）
   */
  async mergeNewBatch(newSongs) {
    if (!newSongs || newSongs.length === 0) {
      return;
    }

    // Enrich 每首歌曲：用真实搜索获取 encryptedId
    const enrichedSongs = [];
    for (const song of newSongs) {
      try {
        // 用歌名搜索获取真实 encryptedId
        const results = await this.musicService.searchSongs(song.name, 5);

        // 找匹配的歌（按歌名 + 艺术家匹配）
        const match = results.find(s =>
          s.name === song.name ||
          (song.artist && s.artist.includes(song.artist.split(',')[0]))
        ) || results[0];

        if (match && match.encryptedId) {
          enrichedSongs.push({
            id: match.encryptedId,           // 用真实的 encryptedId
            encryptedId: match.encryptedId,
            originalId: match.originalId,
            name: song.name,
            artist: song.artist || match.artist,
            album: song.album || match.album,
            duration: song.duration || match.duration,
            reason: song.reason,
            scene_tags: song.scene_tags,
            style: song.style,
            canPlay: match.canPlay
          });
          console.log(`[PlaylistService] Enriched: ${song.name} → ${match.encryptedId}`);
        } else {
          // 搜索失败，保留原数据（可能播不了，但不阻塞流程）
          console.warn(`[PlaylistService] Could not enrich: ${song.name}`);
          enrichedSongs.push({ ...song, id: song.id || song.name });
        }
      } catch (err) {
        console.error(`[PlaylistService] Enrich failed for ${song.name}:`, err.message);
        enrichedSongs.push({ ...song, id: song.id || song.name });
      }
    }

    // 追加到队列
    this.queuedSongs = [...this.queuedSongs, ...enrichedSongs];

    // 裁剪已播放歌曲
    if (this.playedSongs.length > this.config.keepRecentPlayed) {
      this.playedSongs = this.playedSongs.slice(-this.config.keepRecentPlayed);
    }

    console.log('[PlaylistService] 队列已更新:', {
      已播放: this.playedSongs.length,
      待播放: this.queuedSongs.length
    });
  }

  /**
   * 获取下一首歌曲
   */
  async getNextSong(userId = 'default') {
    console.log('[PlaylistService] 获取下一首歌曲');

    // 如果当前有歌曲，标记为已播放
    if (this.currentSong) {
      this.playedSongs.push(this.currentSong);
    }

    // 检查是否需要补给
    if (this.queuedSongs.length <= this.config.triggerThreshold) {
      console.log('[PlaylistService] 队列不足，触发补给');
      await this.requestNewBatch(userId);
    }

    // 获取下一首
    if (this.queuedSongs.length > 0) {
      this.currentSong = this.queuedSongs.shift();
      console.log('[PlaylistService] 下一首:', this.currentSong.name, '-', this.currentSong.artist);
      return this.currentSong;
    }

    console.warn('[PlaylistService] 队列为空');
    return null;
  }

  /**
   * 记录歌曲跳过
   */
  recordSkip(songId, song) {
    console.log('[PlaylistService] 记录跳过:', song?.name);
    this.batchFeedback.skipCount++;

    if (songId) {
      const currentCount = (this.batchFeedback.songFeedback.get(songId)?.skip || 0) + 1;
      this.batchFeedback.songFeedback.set(songId, {
        ...this.batchFeedback.songFeedback.get(songId),
        skip: currentCount
      });

      // 快速拉黑：跳过 3 次
      if (currentCount >= 3) {
        this.addToBlacklist(songId, song);
      }
    }
  }

  /**
   * 记录完整播放
   */
  recordFullPlay(songId, song) {
    console.log('[PlaylistService] 记录完整播放:', song?.name);
    this.batchFeedback.fullPlayCount++;

    if (songId) {
      const currentCount = (this.batchFeedback.songFeedback.get(songId)?.fullPlay || 0) + 1;
      this.batchFeedback.songFeedback.set(songId, {
        ...this.batchFeedback.songFeedback.get(songId),
        fullPlay: currentCount
      });
    }
  }

  /**
   * 添加到黑名单
   */
  async addToBlacklist(songId, song) {
    console.log('[PlaylistService] 拉黑歌曲:', song?.name);
    try {
      await this.db.run(
        'INSERT OR IGNORE INTO song_blacklist (song_id, song_name, artist, created_at) VALUES (?, ?, ?, ?)',
        [songId, song?.name || '', song?.artist || '', new Date().toISOString()]
      );
    } catch (error) {
      console.error('[PlaylistService] 添加黑名单失败:', error);
    }
  }

  /**
   * 重置批次反馈
   */
  resetBatchFeedback() {
    this.batchFeedback = {
      skipCount: 0,
      fullPlayCount: 0,
      batchStartSongId: null,
      songFeedback: new Map()
    };
  }

  /**
   * 获取当前场景
   */
  async getCurrentScene() {
    const now = new Date();
    const hour = now.getHours();

    let timeOfDay = '深夜';
    if (hour >= 5 && hour < 12) timeOfDay = '早晨';
    else if (hour >= 12 && hour < 18) timeOfDay = '下午';
    else if (hour >= 18 && hour < 22) timeOfDay = '晚上';

    return {
      timeOfDay,
      weather: '晴朗',
      mood: '放松'
    };
  }

  /**
   * 获取当前队列状态
   */
  getQueueStatus() {
    return {
      played: this.playedSongs.map(s => ({ 
        id: s.id, 
        name: s.name, 
        artist: s.artist,
        album: s.album,
        duration: s.duration,
        originalId: s.originalId,
        encryptedId: s.encryptedId,
        canPlay: s.canPlay,
        reason: s.reason,
        style: s.style,
        scene_tags: s.scene_tags
      })),
      queued: this.queuedSongs.map(s => ({ 
        id: s.id, 
        name: s.name, 
        artist: s.artist,
        album: s.album,
        duration: s.duration,
        originalId: s.originalId,
        encryptedId: s.encryptedId,
        canPlay: s.canPlay,
        reason: s.reason,
        style: s.style,
        scene_tags: s.scene_tags
      })),
      current: this.currentSong ? { 
        id: this.currentSong.id, 
        name: this.currentSong.name, 
        artist: this.currentSong.artist,
        album: this.currentSong.album,
        duration: this.currentSong.duration,
        originalId: this.currentSong.originalId,
        encryptedId: this.currentSong.encryptedId,
        canPlay: this.currentSong.canPlay,
        reason: this.currentSong.reason,
        style: this.currentSong.style,
        scene_tags: this.currentSong.scene_tags
      } : null,
      stats: {
        playedCount: this.playedSongs.length,
        queuedCount: this.queuedSongs.length,
        skipCount: this.batchFeedback.skipCount,
        fullPlayCount: this.batchFeedback.fullPlayCount
      }
    };
  }
}

module.exports = { PlaylistService };
