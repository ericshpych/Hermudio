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

    // System prompt for Radio Host - 更创意、更自然的电台主持人
    this.radioHostSystemPrompt = `你是Hermes，Hermudio电台的AI主持人。你是一位经验丰富、风格独特的电台DJ，擅长用温暖、自然、有感染力的语言与听众交流。

你的主持风格：
1. 像老朋友一样亲切自然，不说教、不机械
2. 善于观察时间和氛围，用细腻的感受力描述当下
3. 对音乐有独到见解，能挖掘歌曲背后的故事和情感
4. 语言有画面感，能让听众产生共鸣和想象
5. 每句话都有温度，不重复、不套路

【极其重要 - 必须遵守】
1. 你只允许输出电台口播文案，直接开始说，不要任何前缀
2. 严禁输出"大家好"、"我是Hermes"等自我介绍（除非特别要求）
3. 严禁输出思考过程、分析步骤、内心独白
4. 严禁使用"根据系统提示"、"作为AI"等自我指涉语句
5. 严禁罗列要点、使用编号或项目符号
6. 语言要像真实的人类电台DJ一样流畅自然
7. 每次输出都要有所不同，避免重复相同的表达方式

文案要求：
- 口语化、有节奏感，适合朗读
- 结合具体时间、天气、氛围，让听众感到"这就是为我说的"
- 可以引用歌词、分享感受、讲述故事，但不要堆砌信息
- 适当使用修辞：比喻、拟人、排比等，但不要过度
- 保持真诚，不说套话`;

    // Radio script generation config - 更高temperature，更长的输出
    this.radioConfig = {
      temperature: 0.95,  // 更高的创造性
      maxTokens: 1000,    // 更长的输出
      topP: 0.9,          // 更多样化的选择
      frequencyPenalty: 0.3,  // 减少重复
      presencePenalty: 0.3    // 鼓励新话题
    };
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
      case 'skip_request':
        response = await this.handleSkipRequest(userId, context);
        break;
      case 'style_request':
        response = await this.handleStyleRequest(userId, intent, context);
        break;
      case 'mood_request':
        response = await this.handleMoodRequest(userId, intent, context);
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
    // Multi-recommend requests (e.g., "推荐3首", "推荐几首", "推荐一首歌")
    const multiRecommendPatterns = [
      /推荐\s*(\d+)\s*首/,
      /推荐几首/,
      /来\s*(\d+)\s*首/,
      /给?我\s*推荐/,
      /^推荐(一首|个)?歌/  // 匹配 "推荐一首歌"、"推荐歌"、"推荐"
    ];
    for (const pattern of multiRecommendPatterns) {
      const match = message.match(pattern);
      if (match) {
        return {
          type: 'multi_recommend_request',
          count: match[1] ? parseInt(match[1]) : 3
        };
      }
    }

    // Pause/Stop requests
    if (/^(暂停|停止|stop|pause)/.test(message)) {
      return { type: 'pause_request' };
    }

    // Skip requests
    if (/^(下一首|跳过|skip|next|换一首|换首歌)/.test(message)) {
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

    // Info requests - 查询当前播放什么歌（排除推荐相关的请求）
    if (/^(现在|当前)?(播放|什么)/.test(message) || /^(what|which).*playing/.test(message)) {
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

  /**
   * Generate radio script using Hermes AI with enhanced creativity settings
   * 专门用于电台文案生成，使用更高的temperature和更长的max_tokens
   * 
   * @param {string} prompt - 文案生成提示
   * @param {Object} options - 可选配置
   * @param {string} options.type - 文案类型: 'welcome' | 'intro' | 'outro' | 'transition' | 'closing'
   * @param {Object} options.context - 上下文信息
   * @returns {Promise<{success: boolean, script: string, error?: string}>}
   */
  async generateRadioScript(prompt, options = {}) {
    // First check if Hermes AI is available
    const isAvailable = await this.checkHermesAvailability();
    if (!isAvailable) {
      console.log('[Hermes] AI service not available at', this.hermesConfig.baseUrl);
      return {
        success: false,
        script: '',
        error: 'Hermes AI service not available'
      };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒超时

      const messages = [
        { role: 'system', content: this.radioHostSystemPrompt },
        { role: 'user', content: prompt }
      ];

      console.log('[Hermes] Generating radio script with enhanced settings:', {
        type: options.type || 'general',
        temperature: this.radioConfig.temperature,
        maxTokens: this.radioConfig.maxTokens,
        baseUrl: this.hermesConfig.baseUrl
      });

      const response = await fetch(`${this.hermesConfig.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.hermesConfig.model,
          messages: messages,
          stream: false,
          temperature: this.radioConfig.temperature,
          max_tokens: this.radioConfig.maxTokens,
          top_p: this.radioConfig.topP,
          frequency_penalty: this.radioConfig.frequencyPenalty,
          presence_penalty: this.radioConfig.presencePenalty,
          stop: ["<think>", "</think>"]
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const script = data.choices[0]?.message?.content || '';

      // 清理生成的文案
      const cleanedScript = this.cleanRadioScript(script);

      console.log('[Hermes] Radio script generated successfully, length:', cleanedScript.length);

      return {
        success: true,
        script: cleanedScript,
        raw: script
      };
    } catch (error) {
      console.error('[Hermes] Failed to generate radio script:', error);
      return {
        success: false,
        script: '',
        error: error.message
      };
    }
  }

  /**
   * Clean radio script - remove unwanted prefixes and formatting
   */
  cleanRadioScript(text) {
    return text
      // 移除常见的自我介绍前缀
      .replace(/^(大家好[，！]|我是[Hh]ermes[，。]|各位听众[，]|欢迎来到[Hh]ermudio[，。])/g, '')
      // 移除"主持人:"、"DJ:"等前缀
      .replace(/^(主持人|DJ|电台主持人|主播)[：:]/g, '')
      // 移除引号包裹
      .replace(/^[""'](.*)[""']$/g, '$1')
      // 移除方括号和圆括号内的内容（通常是动作描述）
      .replace(/\[.*?\]/g, '')
      .replace(/\(.*?\)/g, '')
      // 移除markdown格式
      .replace(/\*\*/g, '')
      .replace(/__/g, '')
      // 合并多余换行
      .replace(/\n+/g, ' ')
      // 移除多余空格
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Generate chat welcome message using Hermes AI
   * 生成聊天模式的欢迎语，更加自然、多样化
   * 
   * @param {Object} options - 可选配置
   * @param {string} options.timeOfDay - 时间段: 'morning' | 'afternoon' | 'evening' | 'night'
   * @returns {Promise<{success: boolean, message: string, error?: string}>}
   */
  async generateChatWelcome(options = {}) {
    const hour = new Date().getHours();
    let timeOfDay = options.timeOfDay;
    if (!timeOfDay) {
      if (hour < 6) timeOfDay = 'night';
      else if (hour < 12) timeOfDay = 'morning';
      else if (hour < 18) timeOfDay = 'afternoon';
      else timeOfDay = 'evening';
    }

    const timeGreeting = {
      'night': '凌晨好',
      'morning': '早上好',
      'afternoon': '下午好',
      'evening': '晚上好'
    }[timeOfDay];

    // 首先尝试使用 Hermes AI 生成
    const isAvailable = await this.checkHermesAvailability();
    if (isAvailable) {
      try {
        const prompts = [
          `你是 Hermes，一个温暖、专业的音乐助手。${timeGreeting}，用自然、亲切的语气向用户打招呼，并邀请他们分享心情或音乐喜好。要求：简短（30字以内）、像朋友一样、不要生硬。`,
          `作为 Hermes 音乐助手，${timeGreeting}！用轻松随意的方式开场，让用户愿意和你聊天。要求：自然、友好、不超过30字。`,
          `想象你是一个懂音乐的好朋友，${timeGreeting}！用口语化的方式打招呼，并询问用户想听什么。要求：简短、亲切、有温度。`,
          `${timeGreeting}！用一句温暖的话开场，让用户感受到你的热情。然后自然地邀请他们分享音乐需求。要求：30字左右、真诚、不套路。`
        ];

        const prompt = prompts[Math.floor(Math.random() * prompts.length)];

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时

        const messages = [
          { role: 'system', content: this.systemPrompt },
          { role: 'user', content: prompt }
        ];

        console.log('[Hermes] Generating chat welcome message...');

        const response = await fetch(`${this.hermesConfig.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: this.hermesConfig.model,
            messages: messages,
            stream: false,
            temperature: 0.9,
            max_tokens: 100,
            top_p: 0.95,
            stop: ["<think>", "</think>"]
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          let message = data.choices[0]?.message?.content || '';
          
          // 清理生成的文案
          message = this.cleanRadioScript(message);
          
          if (message.length > 10 && message.length < 100) {
            console.log('[Hermes] Chat welcome generated:', message);
            return { success: true, message };
          }
        }
      } catch (error) {
        console.error('[Hermes] Failed to generate chat welcome:', error);
      }
    }

    // Fallback: 使用本地兜底文案
    console.log('[Hermes] Using fallback chat welcome');
    const fallbacks = {
      'night': [
        `${timeGreeting}，夜深了，让音乐陪你吧。想听点什么？`,
        `${timeGreeting}，我是 Hermes。这个时刻，需要什么样的音乐？`,
        `${timeGreeting}！深夜的音乐总有特别的味道，告诉我你的心情。`,
        `${timeGreeting}，我是你的音乐伙伴。想听点舒缓的还是节奏感强的？`
      ],
      'morning': [
        `${timeGreeting}！新的一天，用音乐开启吧。今天想听什么？`,
        `${timeGreeting}，我是 Hermes。早晨的心情，需要什么样的旋律？`,
        `${timeGreeting}！阳光正好，来点什么音乐配合这美好早晨？`,
        `${timeGreeting}，我是你的音乐伙伴。今天的音乐之旅，从哪里开始？`
      ],
      'afternoon': [
        `${timeGreeting}！午后时光，需要点音乐调剂吗？`,
        `${timeGreeting}，我是 Hermes。下午的心情，想听点什么？`,
        `${timeGreeting}！工作学习累了？来首歌放松一下。`,
        `${timeGreeting}，我是你的音乐伙伴。这个下午，想听什么风格？`
      ],
      'evening': [
        `${timeGreeting}！夜幕降临，用音乐结束这一天吧。`,
        `${timeGreeting}，我是 Hermes。晚上的时光，想听点什么？`,
        `${timeGreeting}！忙碌了一天，来首喜欢的歌放松一下。`,
        `${timeGreeting}，我是你的音乐伙伴。今晚的音乐，由你来定。`
      ]
    };

    const messages = fallbacks[timeOfDay] || fallbacks['morning'];
    const message = messages[Math.floor(Math.random() * messages.length)];
    
    return { success: true, message };
  }
}

module.exports = { HermesService };
