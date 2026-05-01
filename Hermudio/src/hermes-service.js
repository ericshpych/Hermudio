/**
 * Hermes AI Service for Hermudio
 * 
 * Handles natural language conversation and music recommendations
 * Integrates with local Hermes AI service
 */

const fetch = require('node-fetch');

class HermesService {
  constructor(recommendationEngine, musicService, userProfile) {
    this.recommendationEngine = recommendationEngine;
    this.musicService = musicService;
    this.userProfile = userProfile;
    this.conversationHistory = new Map();
    
    // Hermes AI configuration
    this.hermesConfig = {
      baseUrl: 'http://localhost:8642/v1',
      model: 'hermes-agent',
      maxContextLength: 10
    };
    
    // System prompt for Hermes
    this.systemPrompt = `你是Hermes，Hermudio的AI音乐助手。你是一个专业、热情、懂音乐的音乐推荐专家。

你的职责：
1. 与用户聊天互动，回答关于音乐、歌曲、艺人的问题
2. 根据用户心情、场景、喜好推荐合适的音乐
3. 分享音乐知识和趣闻
4. 协助用户管理播放列表
5. 用温暖、专业的语气与用户交流

当前环境信息：
- 你正在Hermudio音乐平台为用户服务
- Hermudio 已经集成了完整的音乐播放功能（基于 ncm-cli）
- 你可以获取实时天气和时间信息
- 用户当前播放的歌曲信息会在上下文中提供

【极其重要 - 必须遵守】
1. 你只允许输出给用户看的最终回复内容
2. 严禁输出任何思考过程、分析步骤、内心独白
3. 严禁复述系统指令、规则或任何元信息
4. 严禁输出"根据系统提示"、"我需要"、"我应该"等自我指涉语句
5. 严禁输出"操作规则:"、"绝对禁止:"等标签或标题
6. 直接开始你的回复，不要有任何前置说明

操作规则：
- 当用户要求播放特定歌曲时，请认真理解用户的请求，推荐用户想要的歌曲
- 当用户说"推荐几首"、"推荐3首"等时，请提供3首歌曲供用户选择
- 推荐歌曲时，使用**加粗**或《书名号》突出显示歌名，方便前端识别
- 格式示例：1. **《歌名》** — 艺人名
- 不要假设歌曲已经开始播放，推荐后询问用户是否想听
- 重要提醒：部分歌曲可能因版权问题没有播放权限，如果用户反馈播放的不是推荐歌曲，请建议用户尝试搜索其他版本或其他歌曲

回复风格：
- 热情友好，像朋友一样交流
- 专业但不失亲切
- 简洁明了，避免过长回复
- 适当使用emoji增加亲和力
- 直接开始回复，不要有任何前缀或说明`;
  }
  
  /**
   * Check if Hermes AI is available
   */
  async checkHermesAvailability() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      const response = await fetch('http://localhost:8642/health', {
        method: 'GET',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        return data.status === 'ok';
      }
    } catch (e) {
      console.log('[Hermes] AI service not available:', e.message);
    }
    return false;
  }
  
  /**
   * Send message to Hermes AI
   */
  async sendToHermes(userMessage, context = {}) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);
      
      // Build context info
      let contextualPrompt = userMessage;
      if (context.currentSong) {
        contextualPrompt = `[当前播放: ${context.currentSong.name} - ${context.currentSong.artist}]\n${contextualPrompt}`;
      }
      if (context.scene) {
        contextualPrompt = `[时间: ${context.scene.timeOfDay}, 天气: ${context.scene.weather}]\n${contextualPrompt}`;
      }
      
      // Get conversation history
      const userHistory = this.getConversationHistory(context.userId || 'default');
      const recentHistory = userHistory.slice(-6);
      
      const messages = [
        { role: 'system', content: this.systemPrompt },
        ...recentHistory,
        { role: 'user', content: contextualPrompt }
      ];
      
      const response = await fetch(`${this.hermesConfig.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.hermesConfig.model,
          messages: messages,
          stream: false,
          temperature: 0.7,
          max_tokens: 600,
          stop: ["<think>", "</think>"]
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      const assistantMessage = data.choices[0]?.message?.content || '抱歉，我没有理解你的问题。';
      
      return { success: true, message: assistantMessage };
    } catch (e) {
      console.error('[Hermes] Send message failed:', e);
      return { success: false, error: e.message };
    }
  }

  /**
   * Process user message and generate response
   */
  async chat(userId, message, context = {}) {
    const lowerMessage = message.toLowerCase().trim();
    
    // Parse intent
    const intent = this.parseIntent(lowerMessage);
    
    // Get conversation history
    const history = this.getConversationHistory(userId);
    
    let response;
    
    switch (intent.type) {
      case 'pause_request':
        response = await this.handlePauseRequest(userId);
        break;
      case 'resume_request':
        response = await this.handleResumeRequest(userId);
        break;
      case 'skip_request':
        response = await this.handleSkipRequest(userId, context);
        break;
      case 'previous_request':
        response = await this.handlePreviousRequest(userId);
        break;
      case 'volume_request':
        response = await this.handleVolumeRequest(userId, intent);
        break;
      case 'style_request':
        response = await this.handleStyleRequest(userId, intent, context);
        break;
      case 'mood_request':
        response = await this.handleMoodRequest(userId, intent, context);
        break;
      case 'weather_request':
        response = await this.handleWeatherRequest(userId, context);
        break;
      case 'artist_request':
        response = await this.handleArtistRequest(userId, intent, context);
        break;
      case 'album_request':
        response = await this.handleAlbumRequest(userId, intent, context);
        break;
      case 'search_request':
        response = await this.handleSearchRequest(userId, intent, context);
        break;
      case 'playlist_request':
        response = await this.handlePlaylistRequest(userId, context);
        break;
      case 'favorites_request':
        response = await this.handleFavoritesRequest(userId);
        break;
      case 'history_request':
        response = await this.handleHistoryRequest(userId);
        break;
      case 'multi_recommend_request':
        response = await this.handleMultiRecommendRequest(userId, intent, context);
        break;
      case 'info_request':
        response = await this.handleInfoRequest(userId);
        break;
      case 'like_request':
        response = await this.handleFeedback(userId, 'like', context);
        break;
      case 'dislike_request':
        response = await this.handleFeedback(userId, 'dislike', context);
        break;
      case 'help_request':
        response = this.handleHelpRequest();
        break;
      case 'thanks':
        response = this.handleThanks();
        break;
      case 'bye':
        response = this.handleBye();
        break;
      case 'greeting':
        response = this.handleGreeting(userId);
        break;
      case 'chat':
      default:
        response = await this.handleGeneralChat(userId, message, context);
        break;
    }

    // Save to history
    this.addToHistory(userId, { role: 'user', content: message });
    this.addToHistory(userId, { role: 'assistant', content: response.message });

    return response;
  }

  /**
   * Handle previous song request
   */
  async handlePreviousRequest(userId) {
    const status = this.musicService.getStatus();
    if (status.previousSong) {
      await this.musicService.playSong(status.previousSong.id);
      return {
        message: `回到上一首：${status.previousSong.name} - ${status.previousSong.artist}`,
        action: 'play',
        song: status.previousSong
      };
    }
    return {
      message: '没有上一首的播放记录哦~',
      action: 'none'
    };
  }

  /**
   * Parse user intent from message
   */
  parseIntent(message) {
    // Multi-recommend requests (e.g., "推荐3首", "推荐几首")
    const multiRecommendPatterns = [
      /推荐\s*(\d+)\s*首/,
      /推荐几首/,
      /来\s*(\d+)\s*首/,
      /给?我\s*推荐/,
      /想\s*听.*歌/
    ];
    for (const pattern of multiRecommendPatterns) {
      const match = message.match(pattern);
      if (match) {
        const countMatch = message.match(/(\d+)\s*首/);
        return {
          type: 'multi_recommend_request',
          count: countMatch ? parseInt(countMatch[1]) : 3
        };
      }
    }

    // Pause/Stop requests
    if (/^(暂停|停止|stop|pause|关掉)/.test(message)) {
      return { type: 'pause_request' };
    }

    // Resume/Play requests
    if (/^(继续|播放|开始|resume|play)/.test(message)) {
      return { type: 'resume_request' };
    }

    // Skip requests
    if (/^(下一首|跳过|skip|next|换一首|换首歌|切歌)/.test(message)) {
      return { type: 'skip_request' };
    }

    // Previous song requests
    if (/^(上一首|上一曲|上一首|previous|back)/.test(message)) {
      return { type: 'previous_request' };
    }

    // Volume control
    if (/^(音量|声音)[+\-＋－]/.test(message) || /^(大声点|小声点|大声一点|小点声)/.test(message)) {
      const isLouder = /[＋+大声]/.test(message);
      return { type: 'volume_request', direction: isLouder ? 'up' : 'down' };
    }

    // Weather-based recommendations
    if (/^(今天|现在|外面).*(天气|下雨|晴天|下雨|下雪)/.test(message) || /天气/.test(message)) {
      return { type: 'weather_request' };
    }

    // Artist-based recommendations
    const artistPatterns = [
      /(?:想听|放|播|点).*?([\u4e00-\u9fa5a-zA-Z0-9]{2,15})(?:的|的歌)/,
      /(?:歌手|艺人)[:：]?\s*([\u4e00-\u9fa5a-zA-Z0-9]{2,15})/,
      /([\u4e00-\u9fa5a-zA-Z0-9]{2,15})(?:的歌|的歌曲|的歌单)/
    ];
    for (const pattern of artistPatterns) {
      const match = message.match(pattern);
      if (match) {
        return { type: 'artist_request', artist: match[1] };
      }
    }

    // Album-based recommendations
    const albumPatterns = [
      /(?:专辑|专辑名)[:：]?\s*([\u4e00-\u9fa5a-zA-Z0-9]{2,30})/,
      /(?:这张|那张).*专辑/
    ];
    for (const pattern of albumPatterns) {
      const match = message.match(pattern);
      if (match) {
        return { type: 'album_request', album: match[1] };
      }
    }

    // Style requests
    const styleKeywords = {
      '爵士': 'jazz', 'jazz': 'jazz',
      '钢琴': 'piano', 'piano': 'piano',
      '轻音乐': 'light', '轻': 'light',
      '流行': 'pop', 'pop': 'pop',
      '摇滚': 'rock', 'rock': 'rock',
      '古典': 'classical', 'classical': 'classical',
      '电子': 'electronic', 'electronic': 'electronic',
      '民谣': 'folk', 'folk': 'folk',
      '说唱': 'rap', 'rap': 'rap', 'hiphop': 'hiphop',
      'R&B': 'rnb', 'rnb': 'rnb',
      '蓝调': 'blues', 'blues': 'blues',
      '古典': 'classical', '交响': 'symphony',
      '动漫': 'anime', '二次元': 'anime',
      '电影': 'soundtrack', 'ost': 'soundtrack',
      '游戏': 'game', 'bgm': 'game'
    };

    for (const [keyword, style] of Object.entries(styleKeywords)) {
      if (message.includes(keyword)) {
        return { type: 'style_request', style };
      }
    }

    // Mood requests
    const moodKeywords = {
      '开心': 'happy', '快乐': 'happy', '高兴': 'happy', '愉快': 'happy',
      '难过': 'sad', '伤心': 'sad', '悲伤': 'sad', '忧郁': 'sad',
      '放松': 'relaxed', '轻松': 'relaxed', '舒缓': 'relaxed', '休闲': 'relaxed',
      '专注': 'focused', '工作': 'focused', '学习': 'focused', '办公': 'focused',
      '安静': 'quiet', '睡觉': 'sleep', '睡眠': 'sleep', '困了': 'sleep',
      '浪漫': 'romantic', '约会': 'romantic', '情人节': 'romantic',
      '励志': 'motivational', '加油': 'motivational', '燃': 'motivational',
      '怀旧': 'nostalgic', '回忆': 'nostalgic', '经典': 'nostalgic',
      '跑步': 'workout', '运动': 'workout', '健身': 'workout',
      '开车': 'driving', '车载': 'driving'
    };

    for (const [keyword, mood] of Object.entries(moodKeywords)) {
      if (message.includes(keyword)) {
        return { type: 'mood_request', mood };
      }
    }

    // Info requests
    if (/^(现在|当前|这).*(播放|歌|曲|什么)/.test(message) || /^(what|which).*playing/.test(message)) {
      return { type: 'info_request' };
    }

    // Search requests
    if (/^(搜索|找|查).*/.test(message) || /^search\s*/.test(message)) {
      const searchTerm = message.replace(/^(搜索|找|查)\s*/, '').trim();
      return { type: 'search_request', query: searchTerm };
    }

    // Playlist requests
    if (/^(歌单|播放列表|playlist|歌列表)/.test(message)) {
      return { type: 'playlist_request' };
    }

    // Favorite requests
    if (/^(收藏|喜欢|我.*的.*歌|我的收藏)/.test(message)) {
      return { type: 'favorites_request' };
    }

    // History requests
    if (/^(播放记录|历史|最近.*听)/.test(message)) {
      return { type: 'history_request' };
    }

    // Like/Dislike
    if (/^(喜欢|好听|赞|love|like|good|不错|棒)/.test(message)) {
      return { type: 'like_request' };
    }
    if (/^(不喜欢|难听|跳过|bad|hate|dislike|无聊|一般)/.test(message)) {
      return { type: 'dislike_request' };
    }

    // Help requests
    if (/^(帮助|help|怎么|使用|命令|功能)/.test(message)) {
      return { type: 'help_request' };
    }

    // Greeting
    if (/^(你好|您好|嗨|hello|hi|hey|在|在吗|在嘛)/.test(message)) {
      return { type: 'greeting' };
    }

    // Thanks
    if (/^(谢谢|感谢|谢了|thanks)/.test(message)) {
      return { type: 'thanks' };
    }

    // Bye
    if (/^(再见|拜拜|bye|下次见|回头见)/.test(message)) {
      return { type: 'bye' };
    }

    return { type: 'chat' };
  }

  /**
   * Handle pause request
   */
  async handlePauseRequest(userId) {
    await this.musicService.stop();
    return {
      message: '已暂停播放。想继续听的时候随时告诉我！',
      action: 'pause'
    };
  }

  /**
   * Handle resume request
   */
  async handleResumeRequest(userId) {
    const status = this.musicService.getStatus();
    if (status.currentSong) {
      await this.musicService.playSong(status.currentSong.id);
      return {
        message: `继续播放：${status.currentSong.name} - ${status.currentSong.artist}`,
        action: 'resume'
      };
    }
    return {
      message: '没有正在播放的歌曲。让我为你推荐一首？',
      action: 'recommend'
    };
  }

  /**
   * Handle volume request
   */
  async handleVolumeRequest(userId, intent) {
    const direction = intent.direction === 'up' ? 'up' : 'down';
    return {
      message: direction === 'up' ? '音量已调大 🔊' : '音量已调小 🔉',
      action: 'volume',
      direction
    };
  }

  /**
   * Handle weather request
   */
  async handleWeatherRequest(userId, context) {
    const { getCurrentScene } = require('./scene-analyzer');
    const scene = await getCurrentScene();
    
    const weatherMessages = {
      rainy: '今天外面在下雨呢，很适合听一些安静、治愈的音乐。让我为你选一首...',
      sunny: '阳光明媚的好天气！来首轻快的音乐配合好心情吧~',
      cloudy: '多云的天气，让音乐为你点亮心情~',
      snowy: '下雪了呢，这种浪漫的氛围最适合听歌了~'
    };

    const baseMessage = weatherMessages[scene.weather] || '根据天气为你推荐音乐~';
    
    // Get a weather-appropriate recommendation
    const recommendation = await this.recommendationEngine.getRecommendation({
      ...context,
      weatherContext: scene.weather
    });

    if (recommendation && recommendation.song) {
      await this.musicService.playSong(recommendation.song.id);
      await this.userProfile.recordPlay(userId, recommendation.song.id, recommendation.song);
      return {
        message: `${baseMessage}\n\n🎵 ${recommendation.song.name} - ${recommendation.song.artist}`,
        action: 'play',
        song: recommendation.song
      };
    }

    return {
      message: baseMessage,
      action: 'weather_context'
    };
  }

  /**
   * Handle artist request
   */
  async handleArtistRequest(userId, intent, context) {
    const songs = await this.musicService.searchSongs(intent.artist, 5);
    
    if (songs.length === 0) {
      return {
        message: `抱歉，没有找到 ${intent.artist} 的歌曲。可能需要登录才能播放完整功能。`,
        action: 'none'
      };
    }

    const song = songs[0];
    await this.musicService.playSong(song.id, song.encryptedId);
    await this.userProfile.recordPlay(userId, song.id, song);

    return {
      message: `为你播放 ${intent.artist} 的歌曲：\n🎵 ${song.name} - ${song.artist}`,
      action: 'play',
      song
    };
  }

  /**
   * Handle album request
   */
  async handleAlbumRequest(userId, intent, context) {
    const songs = await this.musicService.searchSongs(intent.album, 5);
    
    if (songs.length === 0) {
      return {
        message: `抱歉，没有找到专辑 "${intent.album}" 的歌曲。`,
        action: 'none'
      };
    }

    const song = songs[0];
    await this.musicService.playSong(song.id, song.encryptedId);
    await this.userProfile.recordPlay(userId, song.id, song);

    return {
      message: `为你播放专辑 "${intent.album}" 中的歌曲：\n🎵 ${song.name} - ${song.artist}`,
      action: 'play',
      song
    };
  }

  /**
   * Handle search request
   */
  async handleSearchRequest(userId, intent, context) {
    const songs = await this.musicService.searchSongs(intent.query, 5);
    
    if (songs.length === 0) {
      return {
        message: `没有找到 "${intent.query}" 相关的歌曲，试试其他关键词？`,
        action: 'none'
      };
    }

    return {
      message: `找到 "${intent.query}" 相关歌曲 ${songs.length} 首，点击选择：`,
      action: 'recommend',
      recommendedSongs: songs,
      autoPlayTimeout: 30000
    };
  }

  /**
   * Handle playlist request
   */
  async handlePlaylistRequest(userId, context) {
    const songs = await this.recommendationEngine.getRecommendations(5, context);
    
    if (songs.length === 0) {
      return {
        message: '暂时无法获取歌单，试试其他风格？',
        action: 'none'
      };
    }

    const songList = songs.map((r, i) => `${i + 1}. ${r.song.name} - ${r.song.artist}`).join('\n');
    return {
      message: `为你准备了歌单 🎵\n\n${songList}\n\n点击播放~`,
      action: 'recommend',
      recommendedSongs: songs.map(r => r.song),
      autoPlayTimeout: 30000
    };
  }

  /**
   * Handle favorites request
   */
  async handleFavoritesRequest(userId) {
    const favorites = await this.userProfile.getFavoriteArtists(userId, 5);
    
    if (favorites.length === 0) {
      return {
        message: '你还没有收藏任何歌曲。听到喜欢的歌时告诉我"喜欢"，我会记住它~',
        action: 'none'
      };
    }

    const favoriteList = favorites.slice(0, 5).join('、');
    return {
      message: `你喜欢的歌手有：${favoriteList}。想听哪位歌手的歌？`,
      action: 'favorites',
      favorites
    };
  }

  /**
   * Handle history request
   */
  async handleHistoryRequest(userId) {
    const prefs = await this.userProfile.getPreferences(userId);
    const history = prefs.playHistory || [];
    
    if (history.length === 0) {
      return {
        message: '还没有播放记录。开始听歌吧！',
        action: 'none'
      };
    }

    const recentSongs = history.slice(0, 5);
    const songList = recentSongs.map((h, i) => `${i + 1}. 歌曲 ${h.songId.substring(0, 8)}...`).join('\n');
    return {
      message: `最近听了 ${history.length} 首歌\n\n最近的播放：\n${songList}`,
      action: 'history'
    };
  }

  /**
   * Handle help request
   */
  handleHelpRequest() {
    const helpMessage = `🎵 **Hermudio 音乐助手使用指南**

**点歌方式：**
• "播放周杰伦的歌"
• "来首爵士乐"
• "播放钢琴曲"

**心情推荐：**
• "我想听开心的歌"
• "播放放松的音乐"
• "来首跑步时的歌"

**控制指令：**
• "暂停" / "继续播放"
• "下一首" / "上一首"
• "大声点" / "小声点"

**查询功能：**
• "现在播放什么"
• "我的收藏"
• "搜索：xxx"

**其他：**
• "今天天气" - 根据天气推荐
• "谢谢" - 感谢回复

试试说点什么？`;

    return {
      message: helpMessage,
      action: 'help'
    };
  }

  /**
   * Handle thanks
   */
  handleThanks() {
    const responses = [
      '不客气！有需要随时叫我 😊',
      '很高兴能帮到你！',
      '有什么想听的尽管说~',
      '随时为你服务！'
    ];
    return {
      message: responses[Math.floor(Math.random() * responses.length)],
      action: 'chat'
    };
  }

  /**
   * Handle bye
   */
  handleBye() {
    const responses = [
      '再见！有需要随时回来 🎵',
      '拜拜，下次见~',
      '祝你有美好的一天！',
      '再见，随时欢迎回来听歌~'
    ];
    return {
      message: responses[Math.floor(Math.random() * responses.length)],
      action: 'bye'
    };
  }

  /**
   * Handle skip request
   */
  async handleSkipRequest(userId, context) {
    // Record skip if there's a current song
    const status = this.musicService.getStatus();
    if (status.currentSong) {
      await this.userProfile.recordSkip(userId, status.currentSong.id, status.currentSong);
    }

    // Get next recommendation
    const recommendation = await this.recommendationEngine.getRecommendation(context);
    
    if (!recommendation || !recommendation.song) {
      return {
        message: '让我为你找下一首歌...',
        action: 'skip'
      };
    }

    await this.musicService.playSong(recommendation.song.id);
    await this.userProfile.recordPlay(userId, recommendation.song.id, recommendation.song);

    return {
      message: `下一首：${recommendation.song.name} - ${recommendation.song.artist}\n\n${recommendation.reason}`,
      action: 'play',
      song: recommendation.song
    };
  }

  /**
   * Handle style request
   */
  async handleStyleRequest(userId, intent, context) {
    const recommendation = await this.recommendationEngine.recommendByStyle(intent.style, context);
    
    if (!recommendation || !recommendation.song) {
      return {
        message: `抱歉，暂时没有找到${intent.style}风格的歌曲。试试其他风格？`,
        action: 'none'
      };
    }

    await this.musicService.playSong(recommendation.song.id);
    await this.userProfile.recordPlay(userId, recommendation.song.id, recommendation.song);

    return {
      message: `为你准备了一首${intent.style}风格的歌曲：\n🎵 ${recommendation.song.name} - ${recommendation.song.artist}`,
      action: 'play',
      song: recommendation.song
    };
  }

  /**
   * Handle mood request
   */
  async handleMoodRequest(userId, intent, context) {
    const moodQueries = {
      'happy': ['开心', '快乐', '欢快'],
      'sad': ['治愈', '安静', '舒缓'],
      'relaxed': ['放松', '轻音乐', 'chill'],
      'focused': ['专注', '纯音乐', 'ambient'],
      'quiet': ['安静', '钢琴', '深夜'],
      'sleep': ['睡眠', '催眠', '白噪音']
    };

    const queries = moodQueries[intent.mood] || [intent.mood];
    const query = queries[Math.floor(Math.random() * queries.length)];
    
    const songs = await this.musicService.searchSongs(query, 5);
    
    if (songs.length === 0) {
      return {
        message: '抱歉，没有找到符合心情的歌曲。换个说法试试？',
        action: 'none'
      };
    }

    const song = songs[0];
    await this.musicService.playSong(song.id);
    await this.userProfile.recordPlay(userId, song.id, song);

    const moodResponses = {
      'happy': '心情不错！来首欢快的歌助兴 🎉',
      'sad': '有时候需要一点安静的音乐来治愈 💙',
      'relaxed': '放松一下，享受这段音乐时光 🌿',
      'focused': '专注时刻，让音乐陪伴你 📚',
      'quiet': '安静的夜晚，适合静静地听歌 🌙',
      'sleep': '祝你有个好梦 🌟'
    };

    return {
      message: `${moodResponses[intent.mood] || '为你找到这首歌'}\n\n🎵 ${song.name} - ${song.artist}`,
      action: 'play',
      song
    };
  }

  /**
   * Handle multi-recommend request (recommend 3 songs)
   */
  async handleMultiRecommendRequest(userId, intent, context) {
    const count = intent.count || 3;
    
    // Get multiple recommendations
    const songs = [];
    const playedSongIds = new Set();
    
    for (let i = 0; i < count; i++) {
      const recommendation = await this.recommendationEngine.getRecommendation({
        ...context,
        excludeIds: Array.from(playedSongIds)
      });
      
      if (recommendation && recommendation.song) {
        songs.push(recommendation.song);
        playedSongIds.add(recommendation.song.id);
      }
    }
    
    if (songs.length === 0) {
      return {
        message: '抱歉，暂时没有找到合适的歌曲。试试其他风格？',
        action: 'none'
      };
    }

    // Build recommendation message with song list
    let message = `为你推荐了${songs.length}首歌曲，点击卡片选择你想听的：\n\n`;
    songs.forEach((song, index) => {
      message += `${index + 1}. **《${song.name}》** — ${song.artist}\n`;
    });
    message += '\n30秒后自动播放第一首~';

    return {
      message,
      action: 'recommend',
      recommendedSongs: songs,
      autoPlayTimeout: 30000
    };
  }

  /**
   * Handle info request
   */
  async handleInfoRequest(userId) {
    const status = this.musicService.getStatus();
    
    if (!status.currentSong) {
      return {
        message: '当前没有播放歌曲。想听点什么？',
        action: 'none'
      };
    }

    const details = await this.musicService.getSongDetails(status.currentSong.id);
    
    return {
      message: `正在播放：${details?.name || status.currentSong.name}\n歌手：${details?.artist || status.currentSong.artist}\n专辑：${details?.album || 'Unknown'}`,
      action: 'info',
      song: details || status.currentSong
    };
  }

  /**
   * Handle feedback (like/dislike)
   */
  async handleFeedback(userId, action, context) {
    const status = this.musicService.getStatus();
    
    if (!status.currentSong) {
      return {
        message: action === 'like' ? '喜欢什么呢？先播放一首歌吧！' : '没有正在播放的歌曲哦。',
        action: 'none'
      };
    }

    await this.userProfile.recordFeedback(userId, status.currentSong.id, status.currentSong, action);

    const messages = {
      like: ['收到！以后多给你推荐类似的歌曲 🎵', '喜欢就好！我会记住你的口味 💙', '好的，这首歌加入你的喜好列表了 ⭐'],
      dislike: ['了解了，下次少推荐这种风格 👌', '收到反馈，我会调整推荐策略 📝', '明白了，我们换一首试试 🔄']
    };

    const responses = messages[action];
    const message = responses[Math.floor(Math.random() * responses.length)];

    return {
      message,
      action: 'feedback',
      feedback: action
    };
  }

  /**
   * Handle greeting
   */
  handleGreeting(userId) {
    const hour = new Date().getHours();
    let greeting = '你好';
    if (hour >= 5 && hour < 12) {
      greeting = '早上好';
    } else if (hour >= 12 && hour < 18) {
      greeting = '下午好';
    } else {
      greeting = '晚上好';
    }

    return {
      message: `${greeting}！我是 Hermes，你的音乐助手。告诉我你现在的心情或者想听什么类型的音乐，我来为你推荐。`,
      action: 'greeting'
    };
  }

  /**
   * Handle general chat - Try Hermes AI first, fallback to recommendation engine
   */
  async handleGeneralChat(userId, message, context) {
    // Check if user explicitly requested a specific song to play immediately
    const specificSongMatch = message.match(/(?:我想听|我要听|播放|放|听)[:：]?\s*这?首?歌?[:：]?\s*《?([^》]+)》?/);
    const isExplicitPlayRequest = specificSongMatch && /(?:我想听|我要听|播放|放|听)/.test(message);
    
    // First, try to get Hermes AI response
    const hermesAvailable = await this.checkHermesAvailability();
    
    if (hermesAvailable) {
      console.log('[Hermes] AI available, sending message to Hermes:', message);
      const hermesResponse = await this.sendToHermes(message, {
        userId,
        currentSong: context.currentSong,
        scene: context.scene
      });
      
      if (hermesResponse.success) {
        console.log('[Hermes] Got AI response');
        
        // Parse song recommendations from Hermes response
        const recommendedSongs = await this.parseSongRecommendations(hermesResponse.message, message);
        
        if (recommendedSongs.length > 0) {
          // If user explicitly requested a specific song, play it immediately
          if (isExplicitPlayRequest && specificSongMatch) {
            const requestedSongName = specificSongMatch[1].trim();
            // Find the requested song in recommendations
            const requestedSong = recommendedSongs.find(s => 
              s.name.toLowerCase().includes(requestedSongName.toLowerCase()) ||
              requestedSongName.toLowerCase().includes(s.name.toLowerCase())
            ) || recommendedSongs[0]; // Fallback to first song if not found
            
            console.log('[Hermes] User explicitly requested song, playing immediately:', requestedSong.name);
            
            // Play the song immediately
            await this.musicService.playSong(requestedSong.id, requestedSong.encryptedId);
            await this.userProfile.recordPlay(userId, requestedSong.id, requestedSong);
            
            return {
              message: hermesResponse.message,
              action: 'play',
              song: requestedSong,
              ai: true
            };
          }
          
          // Return recommendations with cards for non-explicit requests
          return {
            message: hermesResponse.message,
            action: 'recommend',
            recommendedSongs: recommendedSongs,
            autoPlayTimeout: 30000,
            ai: true
          };
        }
        
        return {
          message: hermesResponse.message,
          action: 'chat',
          ai: true
        };
      }
      console.log('[Hermes] AI response failed, falling back to recommendation');
    } else {
      console.log('[Hermes] AI not available, using fallback');
    }
    
    // Fallback: If user explicitly requested a song, search and play it
    if (isExplicitPlayRequest && specificSongMatch) {
      const requestedSongName = specificSongMatch[1].trim();
      console.log('[Hermes] Searching for explicitly requested song:', requestedSongName);
      
      const searchResults = await this.musicService.searchSongs(requestedSongName, 5);
      if (searchResults.length > 0) {
        // Find best match
        const bestMatch = searchResults.find(s => 
          s.name.toLowerCase().includes(requestedSongName.toLowerCase()) ||
          requestedSongName.toLowerCase().includes(s.name.toLowerCase())
        ) || searchResults[0];
        
        await this.musicService.playSong(bestMatch.id, bestMatch.encryptedId);
        await this.userProfile.recordPlay(userId, bestMatch.id, bestMatch);
        
        return {
          message: `为你播放 **《${bestMatch.name}》** — ${bestMatch.artist} 🎵`,
          action: 'play',
          song: bestMatch
        };
      }
    }
    
    // Fallback: Try to get a recommendation based on the chat
    const recommendation = await this.recommendationEngine.getChatRecommendation(message, context);
    
    if (recommendation && recommendation.song) {
      await this.musicService.playSong(recommendation.song.id);
      await this.userProfile.recordPlay(userId, recommendation.song.id, recommendation.song);

      return {
        message: `听起来不错！试试这首歌：\n🎵 ${recommendation.song.name} - ${recommendation.song.artist}\n\n${recommendation.reason}`,
        action: 'play',
        song: recommendation.song
      };
    }

    // Fallback: Generic response
    const responses = [
      '我没太明白，你可以说"播放轻音乐"、"来首爵士"或者"我想听周杰伦"',
      '想听音乐的话，告诉我具体想听什么风格或歌手吧！',
      '我可以帮你播放音乐、推荐歌曲，或者根据你的心情来选择。试试说"播放钢琴曲"？'
    ];

    return {
      message: responses[Math.floor(Math.random() * responses.length)],
      action: 'none'
    };
  }

  /**
   * Parse song recommendations from Hermes AI response
   * Extracts song names and searches for them
   * @param {string} message - Hermes AI response message
   * @param {string} userMessage - Original user message for context
   */
  async parseSongRecommendations(message, userMessage = '') {
    const songs = [];
    
    // Match patterns like:
    // 1. **《夜的钢琴曲》** — 石进
    // 2. **City of Stars** — La La Land
    // 《歌名》- 艺人
    // **歌名** — 艺人
    
    const patterns = [
      // Numbered list with bold and book title
      /\d+\.\s*\*\*《?([^》*]+)》?\*\*\s*[—\-–]\s*([^\n]+)/g,
      // Bold song name with dash
      /\*\*《?([^》*]+)》?\*\*\s*[—\-–]\s*([^\n]+)/g,
      // Book title format
      /《([^》]+)》\s*[—\-–]\s*([^\n]+)/g,
      // Simple numbered list
      /\d+\.\s*([^—\-\n]+)[—\-–]\s*([^\n]+)/g
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(message)) !== null) {
        const songName = match[1].trim();
        const artist = match[2].trim().split(/[，,。.\n]/)[0]; // Take only first part before punctuation
        
        if (songName && !songs.some(s => s.name === songName)) {
          songs.push({
            name: songName,
            artist: artist,
            displayName: songName,
            displayArtist: artist
          });
        }
      }
    }
    
    // Check if user explicitly requested a specific song
    // If Hermes didn't recommend the requested song, add it as a fallback
    const specificSongMatch = userMessage.match(/(?:我想听|我要听|播放|放|听)[:：]?\s*这?首?歌?[:：]?\s*《?([^》]+)》?/);
    if (specificSongMatch && songs.length > 0) {
      const requestedSong = specificSongMatch[1].trim();
      // Check if the requested song is in the recommendations
      const isRequestedSongIncluded = songs.some(s => 
        s.name.toLowerCase().includes(requestedSong.toLowerCase()) ||
        requestedSong.toLowerCase().includes(s.name.toLowerCase())
      );
      
      if (!isRequestedSongIncluded) {
        console.log('[Hermes] Requested song not in recommendations, adding as fallback:', requestedSong);
        // Add the requested song as the first option
        songs.unshift({
          name: requestedSong,
          artist: '',
          displayName: requestedSong,
          displayArtist: ''
        });
      }
    }
    
    // Search for each song to get full details
    const enrichedSongs = [];
    for (const song of songs.slice(0, 3)) { // Max 3 songs
      try {
        const searchResults = await this.musicService.searchSongs(song.name, 3);
        if (searchResults.length > 0) {
          // Find best match
          const bestMatch = searchResults.find(r => 
            r.name.toLowerCase().includes(song.name.toLowerCase()) ||
            song.name.toLowerCase().includes(r.name.toLowerCase())
          ) || searchResults[0];
          
          enrichedSongs.push({
            id: bestMatch.id,
            encryptedId: bestMatch.encryptedId,
            name: bestMatch.name,
            artist: bestMatch.artist,
            album: bestMatch.album,
            displayName: song.name,
            displayArtist: song.artist
          });
        }
      } catch (error) {
        console.error('[Hermes] Failed to search for song:', song.name, error);
      }
    }
    
    console.log('[Hermes] Parsed recommendations:', enrichedSongs.length, 'songs');
    return enrichedSongs;
  }

  /**
   * Get conversation history
   */
  getConversationHistory(userId) {
    return this.conversationHistory.get(userId) || [];
  }

  /**
   * Add to conversation history
   */
  addToHistory(userId, message) {
    if (!this.conversationHistory.has(userId)) {
      this.conversationHistory.set(userId, []);
    }
    
    const history = this.conversationHistory.get(userId);
    history.push(message);
    
    // Keep last 20 messages
    if (history.length > 20) {
      history.shift();
    }
  }

  /**
   * Clear conversation history
   */
  clearHistory(userId) {
    this.conversationHistory.delete(userId);
  }
}

module.exports = { HermesService };
