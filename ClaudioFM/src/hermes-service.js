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
    
    // System prompt for DJ role
    this.systemPrompt = `你是Hermudio的AI DJ助手，一个专业、热情、懂音乐的主持人。

你的职责：
1. 与用户聊天互动，回答关于音乐、歌曲、艺人的问题
2. 根据用户心情推荐合适的音乐
3. 分享音乐知识和趣闻
4. 协助用户管理播放列表
5. 用温暖、专业的语气与用户交流

当前环境信息：
- 你正在主持Hermudio电台
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
- 当用户要求播放歌曲时，你只需要推荐歌曲并回复文字即可
- 当用户说"试试看"、"需要"、"播放这首"等确认词时，前端会自动播放你刚才推荐的歌曲
- 你不需要调用 ncm-cli 或执行任何系统命令，前端会自动处理播放逻辑
- 推荐歌曲时，使用**加粗**或《书名号》突出显示歌名，方便前端识别
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
      case 'play_request':
        response = await this.handlePlayRequest(userId, intent, context);
        break;
      case 'pause_request':
        response = await this.handlePauseRequest(userId);
        break;
      case 'skip_request':
        response = await this.handleSkipRequest(userId, context);
        break;
      case 'style_request':
        response = await this.handleStyleRequest(userId, intent, context);
        break;
      case 'mood_request':
        response = await this.handleMoodRequest(userId, intent, context);
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
   * Parse user intent from message
   */
  parseIntent(message) {
    // Play requests
    const playPatterns = [
      /^(播放|放|听|来首|来一首|给我放|我想听|我要听)/,
      /^(play|start)/
    ];
    for (const pattern of playPatterns) {
      if (pattern.test(message)) {
        const songMatch = message.match(/(?:《|"|'|])([^《"'》]+)[》"']/);
        const artistMatch = message.match(/(?:歌手|艺人|artist)[是:]?\s*(.+)/);
        return {
          type: 'play_request',
          songName: songMatch ? songMatch[1] : null,
          artist: artistMatch ? artistMatch[1].trim() : null
        };
      }
    }

    // Pause/Stop requests
    if (/^(暂停|停止|stop|pause)/.test(message)) {
      return { type: 'pause_request' };
    }

    // Skip requests
    if (/^(下一首|跳过|skip|next)/.test(message)) {
      return { type: 'skip_request' };
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
      '民谣': 'folk', 'folk': 'folk'
    };

    for (const [keyword, style] of Object.entries(styleKeywords)) {
      if (message.includes(keyword)) {
        return { type: 'style_request', style };
      }
    }

    // Mood requests
    const moodKeywords = {
      '开心': 'happy', '快乐': 'happy', '高兴': 'happy',
      '难过': 'sad', '伤心': 'sad', '悲伤': 'sad',
      '放松': 'relaxed', '轻松': 'relaxed',
      '专注': 'focused', '工作': 'focused', '学习': 'focused',
      '安静': 'quiet', '睡眠': 'sleep', '睡觉': 'sleep'
    };

    for (const [keyword, mood] of Object.entries(moodKeywords)) {
      if (message.includes(keyword)) {
        return { type: 'mood_request', mood };
      }
    }

    // Info requests
    if (/^(现在|当前)?.*(播放|歌|曲|什么)/.test(message) || /^(what|which).*playing/.test(message)) {
      return { type: 'info_request' };
    }

    // Like/Dislike
    if (/^(喜欢|好听|赞|love|like|good)/.test(message)) {
      return { type: 'like_request' };
    }
    if (/^(不喜欢|难听|跳过|bad|hate|dislike)/.test(message)) {
      return { type: 'dislike_request' };
    }

    // Greeting
    if (/^(你好|您好|嗨|hello|hi|hey)/.test(message)) {
      return { type: 'greeting' };
    }

    return { type: 'chat' };
  }

  /**
   * Handle play request
   */
  async handlePlayRequest(userId, intent, context) {
    let recommendation;

    if (intent.songName) {
      // Specific song request
      recommendation = await this.recommendationEngine.recommendSpecificSong(intent.songName);
    } else if (intent.artist) {
      // Artist request
      recommendation = await this.recommendationEngine.recommendByArtist(intent.artist);
    } else {
      // General recommendation
      recommendation = await this.recommendationEngine.getRecommendation(context);
    }

    if (!recommendation || !recommendation.song) {
      return {
        message: '抱歉，暂时没有找到合适的歌曲。要试试其他风格吗？',
        action: 'none'
      };
    }

    // Start playing
    await this.musicService.playSong(recommendation.song.id);
    
    // Record play
    await this.userProfile.recordPlay(userId, recommendation.song.id, recommendation.song);

    return {
      message: `🎵 ${recommendation.reason}\n\n正在播放：${recommendation.song.name} - ${recommendation.song.artist}`,
      action: 'play',
      song: recommendation.song,
      reason: recommendation.reason
    };
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
    const greetings = [
      '你好！我是 Hermudio 的 AI 助手。想听什么音乐？告诉我你的心情或喜欢的风格吧！',
      '嗨！今天想听点什么？我可以根据时间、天气和你的喜好来推荐歌曲 🎵',
      '你好呀！我是你的音乐助手。直接说想听什么，或者让我为你推荐！'
    ];

    return {
      message: greetings[Math.floor(Math.random() * greetings.length)],
      action: 'greeting'
    };
  }

  /**
   * Handle general chat
   */
  async handleGeneralChat(userId, message, context) {
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
