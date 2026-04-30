// DJ 模式控制器
class DJController {
  constructor() {
    this.mode = 'music'; // 'music' 或 'dj'
    this.isPlaying = false;
    this.currentTrack = null;
    this.playlist = [];
    this.currentIndex = 0;
    this.playHistory = []; // 播放历史，用于学习用户喜好
    
    // API 基础地址
    this.API_BASE = 'http://localhost:6588';
    
    // DJ 状态
    this.djState = {
      weather: null,
      temperature: null,
      timeOfDay: null,
      mood: null,
      lastAnnouncement: null,
      announcementInterval: null,
      consecutiveSkips: 0, // 连续跳过次数，用于检测用户不喜欢
      userPreferences: {
        favoriteArtists: new Set(),
        favoriteGenres: new Set(),
        skippedSongs: new Set(),
        likedSongs: new Set(),
        playCount: {} // 歌曲播放次数
      }
    };
    
    // MiniMax 语音配置
    this.ttsConfig = {
      enabled: true,
      currentVoice: 'female-chengshu',
      speed: 1.0,
      vol: 1.0,
      pitch: 0,
      availableVoices: {
        male: [
          { id: 'male-qn-qingse', name: '青涩青年', desc: '青涩男声', tags: ['青涩', '年轻'] },
          { id: 'male-qn-jingying', name: '精英青年', desc: '精英男声', tags: ['精英', '成熟'] },
          { id: 'male-qn-badao', name: '霸道青年', desc: '霸道男声', tags: ['霸道', '强势'] },
          { id: 'presenter_male', name: '男性主持人', desc: '主持人男声', tags: ['主持', '专业'] },
          { id: 'audiobook_male_1', name: '男性有声书1', desc: '有声书男声', tags: ['有声书', '磁性'] },
          { id: 'audiobook_male_2', name: '男性有声书2', desc: '有声书男声2', tags: ['有声书', '温暖'] }
        ],
        female: [
          { id: 'female-shaonv', name: '少女', desc: '少女音色', tags: ['少女', '活泼'] },
          { id: 'female-yujie', name: '御姐', desc: '御姐音色', tags: ['御姐', '成熟'] },
          { id: 'female-chengshu', name: '成熟女性', desc: '成熟女声', tags: ['成熟', '稳重'] },
          { id: 'female-tianmei', name: '甜美少女', desc: '甜美音色', tags: ['甜美', '可爱'] },
          { id: 'presenter_female', name: '女性主持人', desc: '主持人女声', tags: ['主持', '专业'] },
          { id: 'audiobook_female_1', name: '女性有声书1', desc: '有声书女声', tags: ['有声书', '温柔'] },
          { id: 'audiobook_female_2', name: '女性有声书2', desc: '有声书女声2', tags: ['有声书', '知性'] }
        ]
      }
    };
    
    // 艺人关系图谱（用于推荐）
    this.artistRelations = {
      '周杰伦': ['林俊杰', '王力宏', '陶喆', '陈奕迅'],
      '陈奕迅': ['杨千嬅', '谢安琪', '张敬轩', '林宥嘉'],
      '林俊杰': ['周杰伦', '王力宏', '潘玮柏', '蔡依林'],
      'Taylor Swift': ['Ed Sheeran', 'Adele', 'Katy Perry', 'Selena Gomez'],
      'Ed Sheeran': ['Taylor Swift', 'James Blunt', 'Sam Smith', 'Shawn Mendes'],
      'Adele': ['Sam Smith', 'Amy Winehouse', 'Dua Lipa', 'Sia'],
      '五月天': ['苏打绿', '告五人', '八三夭', '宇宙人'],
      '苏打绿': ['五月天', '陈绮贞', '张悬', 'Tizzy Bac'],
      '告五人': ['五月天', '茄子蛋', '老王乐队', '椅子乐团']
    };
    
    // 歌曲风格关键词
    this.styleKeywords = {
      pop: ['流行', 'pop', '主流', '热门'],
      rock: ['摇滚', 'rock', '乐队', '吉他'],
      folk: ['民谣', 'folk', '吉他', '清新'],
      rnb: ['R&B', '节奏布鲁斯', 'soul', '灵魂乐'],
      jazz: ['爵士', 'jazz', '蓝调', 'blues'],
      electronic: ['电子', 'electronic', 'EDM', '电音'],
      classical: ['古典', 'classical', '钢琴', '小提琴'],
      hiphop: ['说唱', 'hiphop', 'rap', '嘻哈'],
      indie: ['独立', 'indie', '小众', '原创']
    };
    
    // 话术库
    this.scripts = {
      morning: {
        intro: [
          '早上好！新的一天从好音乐开始。',
          '早安！让音乐唤醒你的一天。',
          '清晨好！今天的阳光和音乐一样温暖。'
        ],
        weather: {
          sunny: '今天天气不错，阳光明媚，适合听些轻快的歌。',
          rainy: '外面下着雨，来听些温暖的音乐吧。',
          cloudy: '今天云层有点厚，但音乐可以让心情明亮起来。'
        }
      },
      afternoon: {
        intro: [
          '下午好！工作学习累了吗？来听听音乐放松一下。',
          '午后的时光，让音乐陪伴你。',
          '下午好！一杯咖啡，一首歌，享受这片刻宁静。'
        ]
      },
      evening: {
        intro: [
          '晚上好！今天过得怎么样？',
          '夜幕降临，让音乐陪你度过这个夜晚。',
          '晚上好！忙碌了一天，现在该放松了。'
        ]
      },
      night: {
        intro: [
          '深夜了，还在听歌吗？',
          '夜深人静，音乐是最好的陪伴。',
          '这么晚了还没睡？来听些安静的歌吧。'
        ]
      },
      transitions: {
        next: [
          '接下来这首歌...',
          '下面请听...',
          '换首歌，换个心情...',
          '下一首歌是...'
        ],
        mood: {
          happy: '听起来你心情不错，这首歌很适合你。',
          calm: '平静的时刻，需要一首安静的歌。',
          energetic: '来点有能量的音乐！'
        }
      },
      reactions: {
        skip: [
          '这首不喜欢？我换一首。',
          '每个人口味不同，来听听下一首。'
        ],
        longListen: [
          '听了这么久，看来这首歌很打动你。',
          '完整听完了，这首歌确实值得细细品味。',
          '能听完一首歌，说明它触动了你。'
        ]
      }
    };
    
    this.init();
  }
  
  init() {
    this.updateTimeOfDay();
    // 每小时更新一次时间段
    setInterval(() => this.updateTimeOfDay(), 60 * 60 * 1000);
    
    // 检查豆包语音配置
    this.checkTTSStatus();
    
    // 加载用户偏好
    this.loadUserPreferences();
  }
  
  // 加载用户偏好
  loadUserPreferences() {
    try {
      const saved = localStorage.getItem('hermudio_user_preferences');
      if (saved) {
        const prefs = JSON.parse(saved);
        this.djState.userPreferences.favoriteArtists = new Set(prefs.favoriteArtists || []);
        this.djState.userPreferences.favoriteGenres = new Set(prefs.favoriteGenres || []);
        this.djState.userPreferences.skippedSongs = new Set(prefs.skippedSongs || []);
        this.djState.userPreferences.likedSongs = new Set(prefs.likedSongs || []);
        this.djState.userPreferences.playCount = prefs.playCount || {};
        console.log('[DJ] 已加载用户偏好');
      }
    } catch (e) {
      console.error('[DJ] 加载用户偏好失败:', e);
    }
  }
  
  // 保存用户偏好
  saveUserPreferences() {
    try {
      const prefs = {
        favoriteArtists: Array.from(this.djState.userPreferences.favoriteArtists),
        favoriteGenres: Array.from(this.djState.userPreferences.favoriteGenres),
        skippedSongs: Array.from(this.djState.userPreferences.skippedSongs),
        likedSongs: Array.from(this.djState.userPreferences.likedSongs),
        playCount: this.djState.userPreferences.playCount
      };
      localStorage.setItem('hermudio_user_preferences', JSON.stringify(prefs));
    } catch (e) {
      console.error('[DJ] 保存用户偏好失败:', e);
    }
  }
  
  // 记录播放行为
  recordPlayBehavior(song, behavior) {
    const songKey = `${song.name}-${song.artist}`;
    
    if (behavior === 'play') {
      // 增加播放次数
      this.djState.userPreferences.playCount[songKey] = 
        (this.djState.userPreferences.playCount[songKey] || 0) + 1;
      
      // 记录播放历史
      this.playHistory.push({
        song: song,
        timestamp: Date.now(),
        timeOfDay: this.djState.timeOfDay
      });
      
      // 限制历史记录长度
      if (this.playHistory.length > 100) {
        this.playHistory.shift();
      }
    } else if (behavior === 'like') {
      this.djState.userPreferences.likedSongs.add(songKey);
      this.djState.userPreferences.favoriteArtists.add(song.artist);
      this.djState.consecutiveSkips = 0;
    } else if (behavior === 'skip') {
      this.djState.userPreferences.skippedSongs.add(songKey);
      this.djState.consecutiveSkips++;
    }
    
    this.saveUserPreferences();
  }
  
  // 获取歌曲播放次数
  getPlayCount(song) {
    const songKey = `${song.name}-${song.artist}`;
    return this.djState.userPreferences.playCount[songKey] || 0;
  }
  
  // 检查是否是用户喜欢的歌曲
  isUserFavorite(song) {
    const songKey = `${song.name}-${song.artist}`;
    return this.djState.userPreferences.likedSongs.has(songKey) ||
           this.djState.userPreferences.favoriteArtists.has(song.artist);
  }
  
  // 获取相似艺人推荐
  getSimilarArtists(artist) {
    return this.artistRelations[artist] || [];
  }
  
  // 检查豆包语音配置
  async checkTTSStatus() {
    try {
      const response = await fetch(`${this.API_BASE}/api/tts/status`);
      const data = await response.json();
      this.ttsConfig.enabled = data.enabled || false;
      console.log('[DJ] TTS状态:', data.enabled ? '已启用' : '未启用');
    } catch (e) {
      console.log('[DJ] TTS服务未配置');
      this.ttsConfig.enabled = false;
    }
  }
  
  // 更新时间段
  updateTimeOfDay() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) {
      this.djState.timeOfDay = 'morning';
    } else if (hour >= 12 && hour < 18) {
      this.djState.timeOfDay = 'afternoon';
    } else if (hour >= 18 && hour < 22) {
      this.djState.timeOfDay = 'evening';
    } else {
      this.djState.timeOfDay = 'night';
    }
  }
  
  // 获取真实天气
  async getRealWeather() {
    try {
      // 使用浏览器的地理位置API
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
      });
      
      const { latitude, longitude } = position.coords;
      
      // 使用 Open-Meteo API (免费，无需API Key)
      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&timezone=auto`
      );
      
      if (!response.ok) throw new Error('天气API请求失败');
      
      const data = await response.json();
      const weatherCode = data.current_weather.weathercode;
      const temp = data.current_weather.temperature;
      
      // 解析天气代码
      let weather = 'sunny';
      if (weatherCode >= 51) weather = 'rainy';
      else if (weatherCode >= 1) weather = 'cloudy';
      
      this.djState.weather = weather;
      this.djState.temperature = temp;
      
      return { weather, temp };
    } catch (e) {
      console.log('[DJ] 获取天气失败:', e.message);
      // 使用默认天气
      this.djState.weather = 'sunny';
      this.djState.temperature = 22;
      return { weather: 'sunny', temp: 22 };
    }
  }
  
  // 分析歌曲风格
  analyzeSongStyle(song) {
    const text = `${song.name} ${song.artist} ${song.album || ''}`.toLowerCase();
    const styles = [];
    
    for (const [style, keywords] of Object.entries(this.styleKeywords)) {
      if (keywords.some(kw => text.includes(kw.toLowerCase()))) {
        styles.push(style);
      }
    }
    
    return styles.length > 0 ? styles : ['pop'];
  }
  
  // 生成动态开场白
  async generateDynamicIntro() {
    // 获取实时天气
    const { weather, temp } = await this.getRealWeather();
    
    const timeOfDay = this.djState.timeOfDay;
    const scripts = this.scripts[timeOfDay];
    
    let intro = '';
    
    // 根据时间段选择开场白
    if (scripts && scripts.intro) {
      intro = scripts.intro[Math.floor(Math.random() * scripts.intro.length)];
    }
    
    // 添加天气相关话术
    if (scripts && scripts.weather && scripts.weather[weather]) {
      intro += scripts.weather[weather];
    }
    
    // 添加温度信息
    if (temp !== null) {
      intro += ` 当前气温${Math.round(temp)}度。`;
    }
    
    return {
      text: intro,
      weather,
      temp,
      timeOfDay
    };
  }
  
  // 生成智能歌曲介绍
  generateSmartSongIntro(songName, artistName) {
    const timeOfDay = this.djState.timeOfDay;
    let intro = '';
    
    // 根据时间段调整语气
    if (timeOfDay === 'night') {
      intro = '深夜时分，来一首安静的歌。';
    } else if (timeOfDay === 'morning') {
      intro = '新的一天，用这首歌开启。';
    }
    
    // 歌曲介绍
    const songIntros = [
      `这首歌是${artistName}的《${songName}》。`,
      `接下来请听${artistName}带来的《${songName}》。`,
      `一首《${songName}》，来自${artistName}。`,
      `下面这首歌是${artistName}的《${songName}》。`
    ];
    intro += songIntros[Math.floor(Math.random() * songIntros.length)];
    
    return intro;
  }
  
  // 生成智能过渡话术
  generateSmartTransition(playCount, totalSongs) {
    const progress = playCount / totalSongs;
    
    if (progress < 0.3) {
      // 开场阶段
      const intros = [
        '音乐之旅刚刚开始，还有更多精彩等着你。',
        '这只是开始，接下来还有更多好歌。',
        '让我们继续这段音乐旅程。'
      ];
      return intros[Math.floor(Math.random() * intros.length)];
    } else if (progress > 0.7) {
      // 尾声阶段
      const outros = [
        `已经播了${playCount}首歌了，音乐时光总是过得很快。`,
        '接近尾声了，希望这些音乐给你带来了好心情。',
        '时间过得真快，让我们再听几首好歌。'
      ];
      return outros[Math.floor(Math.random() * outros.length)];
    } else {
      // 中间阶段
      const mids = [
        `这是第${playCount}首歌，音乐继续。`,
        '好音乐不停，精彩继续。',
        '让我们继续聆听。'
      ];
      return mids[Math.floor(Math.random() * mids.length)];
    }
  }
  
  // 生成结束话术
  generateOutro(playCount, totalDuration) {
    const duration = Math.round(totalDuration / 60);
    const outros = [
      `感谢收听Hermudio，这${duration}分钟里我们听了${playCount}首歌。我是你的DJ，期待下次与你相遇。`,
      `今天的音乐之旅就到这里，总共${playCount}首歌，${duration}分钟的音乐时光。愿你带着这些旋律，度过美好的一天。`,
      `感谢你选择Hermudio电台，这${duration}分钟的音乐陪伴希望你喜欢。记住，好音乐永远在这里等你。`
    ];
    return outros[Math.floor(Math.random() * outros.length)];
  }
  
  // 保留旧方法以兼容
  generateIntro(weather, timeInfo) {
    return this.generateDynamicIntro();
  }
  
  generateSongIntro(songName, artistName) {
    return this.generateSmartSongIntro(songName, artistName);
  }
  
  generateTransition() {
    return this.generateSmartTransition(1, 10);
  }
  
  // 启动DJ模式
  async startDJMode() {
    console.log('[DJ] ========== 启动DJ模式 ==========');
    this.mode = 'dj';

    try {
      // 步骤1: 获取每日推荐
      console.log('[DJ] 步骤1: 开始获取每日推荐歌曲...');
      console.log('[DJ] 请求URL:', `${this.API_BASE}/api/cli/recommend/songs`);

      const response = await fetch(`${this.API_BASE}/api/cli/recommend/songs`);
      console.log('[DJ] 步骤1完成: 收到响应, status:', response.status);

      const data = await response.json();
      console.log('[DJ] 获取推荐歌曲原始数据:', JSON.stringify(data, null, 2));

      if (data.success && data.data && data.data.length > 0) {
        console.log('[DJ] 步骤2: 成功获取', data.data.length, '首歌曲');
        this.playlist = data.data;
        this.currentIndex = 0;

        const firstSong = this.playlist[0];
        console.log('[DJ] 步骤2详情: 第一首歌信息:');
        console.log('  - name:', firstSong.name);
        console.log('  - artist:', firstSong.artist);
        console.log('  - id:', firstSong.id);
        console.log('  - 完整对象:', firstSong);

        // 步骤3: 生成开场白
        console.log('[DJ] 步骤3: 生成开场白...');
        const intro = await this.generateDynamicIntro();
        console.log('[DJ] 步骤3完成: 开场白内容:', intro.text);

        // 步骤4: 播放开场白语音
        console.log('[DJ] 步骤4: 播放开场白语音...');
        await this.speak(intro.text);
        console.log('[DJ] 步骤4完成: 开场白播放完毕');

        // 步骤5: 自动播放第一首歌
        console.log('[DJ] 步骤5: 准备自动播放第一首歌...');
        if (this.playlist.length > 0) {
          const songToPlay = this.playlist[0];
          console.log('[DJ] 步骤5详情: 待播放歌曲:');
          console.log('  - name:', songToPlay.name);
          console.log('  - artist:', songToPlay.artist);
          console.log('  - id:', songToPlay.id);
          console.log('  - id类型:', typeof songToPlay.id);
          console.log('  - id是否存在:', !!songToPlay.id);

          if (!songToPlay.id) {
            console.error('[DJ] 步骤5错误: 第一首歌缺少ID!');
            console.error('[DJ] 完整歌曲对象:', songToPlay);
            // 通知前端播放失败
            this.onDJSpeak?.('抱歉，第一首歌信息不完整，无法播放。请尝试手动播放。', null);
          } else {
            console.log('[DJ] 步骤5: 1秒后调用playSong...');
            // 使用 Promise 包装 setTimeout 确保异步正确执行
            await new Promise(resolve => setTimeout(resolve, 1000));
            console.log('[DJ] 步骤5: 开始调用playSong, 歌曲ID:', songToPlay.id);
            const playResult = await this.playSong(songToPlay);
            console.log('[DJ] 步骤5完成: playSong返回结果:', playResult);
            
            // 如果播放失败，通知用户
            if (!playResult.success) {
              console.error('[DJ] 步骤5警告: 自动播放失败:', playResult.message);
              this.onDJSpeak?.(`自动播放失败了：${playResult.message}。你可以点击播放按钮手动开始。`, null);
            } else {
              console.log('[DJ] 步骤5成功: 歌曲已开始播放!');
            }
          }
        } else {
          console.warn('[DJ] 步骤5跳过: 播放列表为空');
          this.onDJSpeak?.('播放列表为空，请先登录网易云音乐账号。', null);
        }

        console.log('[DJ] ========== DJ模式启动完成 ==========');
        return {
          success: true,
          songs: this.playlist,
          intro: intro
        };
      } else {
        console.error('[DJ] 步骤2错误: 无法获取推荐歌曲');
        console.error('[DJ] data.success:', data.success);
        console.error('[DJ] data.data:', data.data);
        return {
          success: false,
          message: '无法获取推荐歌曲'
        };
      }
    } catch (e) {
      console.error('[DJ] ========== 启动失败 ==========');
      console.error('[DJ] 错误信息:', e.message);
      console.error('[DJ] 错误堆栈:', e.stack);
      return {
        success: false,
        message: e.message
      };
    }
  }
  
  // 停止DJ模式
  stopDJMode() {
    console.log('[DJ] 停止DJ模式');
    this.mode = 'music';
    this.stopAnnouncementLoop();
  }
  
  // 播放语音
  async speak(text) {
    if (!this.ttsConfig.enabled) {
      console.log('[DJ] TTS未启用，跳过语音:', text);
      // 仍然触发回调显示文字
      this.onDJSpeak?.(text, null);
      return { success: false, message: 'TTS未启用' };
    }
    
    try {
      const response = await fetch(`${this.API_BASE}/api/tts/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voice: this.ttsConfig.currentVoice,
          speed: this.ttsConfig.speed,
          vol: this.ttsConfig.vol,
          pitch: this.ttsConfig.pitch
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        console.log('[DJ] 语音播放:', text);
        this.onDJSpeak?.(text, this.ttsConfig.currentVoice);
        return { success: true };
      } else {
        throw new Error(data.message);
      }
    } catch (e) {
      console.error('[DJ] 语音播放失败:', e);
      // 即使语音失败，也显示文字
      this.onDJSpeak?.(text, null);
      return { success: false, message: e.message };
    }
  }
  
  // 播放指定歌曲
  async playSong(song) {
    console.log('[DJ] ---------- playSong 开始 ----------');
    console.log('[DJ] playSong 接收到的歌曲对象:', song);

    try {
      // 检查歌曲对象是否有效
      console.log('[DJ] playSong 步骤1: 检查歌曲对象有效性...');
      if (!song) {
        console.error('[DJ] playSong 错误: song 为 null/undefined');
        throw new Error('缺少歌曲对象，无法播放');
      }
      if (!song.id) {
        console.error('[DJ] playSong 错误: song.id 不存在');
        console.error('[DJ] song 对象内容:', JSON.stringify(song, null, 2));
        throw new Error('缺少歌曲ID，无法播放');
      }

      console.log('[DJ] playSong 步骤1通过: 歌曲ID =', song.id, '(类型:', typeof song.id + ')');
      console.log('[DJ] playSong 步骤2: 准备调用播放API...');
      console.log('[DJ] playSong 请求URL:', `${this.API_BASE}/api/cli/play`);
      console.log('[DJ] playSong 请求体:', { songId: song.id });

      const response = await fetch(`${this.API_BASE}/api/cli/play`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songId: song.id })
      });

      console.log('[DJ] playSong 步骤2完成: 收到响应, status:', response.status);

      const data = await response.json();
      console.log('[DJ] playSong 响应数据:', JSON.stringify(data, null, 2));

      if (data.success) {
        console.log('[DJ] playSong 步骤3: 播放成功!');
        this.currentTrack = song;
        this.recordPlayBehavior(song, 'play');

        // 播放歌曲介绍
        console.log('[DJ] playSong 步骤4: 生成并播放歌曲介绍...');
        const intro = this.generateSmartSongIntro(song.name, song.artist);
        await this.speak(intro);
        console.log('[DJ] playSong 步骤4完成: 歌曲介绍播放完毕');

        console.log('[DJ] ---------- playSong 完成 ----------');
        return { success: true };
      } else {
        console.error('[DJ] playSong 错误: 后端返回失败');
        console.error('[DJ] 后端错误信息:', data.message);
        throw new Error(data.message || '播放失败');
      }
    } catch (e) {
      console.error('[DJ] ---------- playSong 失败 ----------');
      console.error('[DJ] 错误类型:', e.name);
      console.error('[DJ] 错误信息:', e.message);
      console.error('[DJ] 错误堆栈:', e.stack);
      return { success: false, message: e.message };
    }
  }
  
  // 获取推荐歌曲（用于智能推荐）
  async getRecommendedSongs() {
    try {
      // 获取每日推荐
      const response = await fetch(`${this.API_BASE}/api/cli/recommend/songs`);
      const data = await response.json();

      console.log('[DJ] 获取推荐歌曲原始数据:', data);

      if (data.success && data.data && data.data.length > 0) {
        // 检查第一首歌的数据结构
        console.log('[DJ] 第一首歌原始数据:', data.data[0]);

        // 根据用户偏好排序
        const sorted = this.sortByUserPreference(data.data);

        console.log('[DJ] 排序后的第一首歌:', sorted[0]);

        // 生成开场白
        const intro = await this.generateDynamicIntro();

        return {
          success: true,
          songs: sorted,
          intro: intro
        };
      }

      return { success: false, message: '无法获取推荐' };
    } catch (e) {
      console.error('[DJ] 获取推荐失败:', e);
      return { success: false, message: e.message };
    }
  }
  
  // 根据用户偏好排序歌曲
  sortByUserPreference(songs) {
    return songs.sort((a, b) => {
      const scoreA = this.calculatePreferenceScore(a);
      const scoreB = this.calculatePreferenceScore(b);
      return scoreB - scoreA;
    });
  }
  
  // 计算歌曲偏好分数
  calculatePreferenceScore(song) {
    let score = 0;
    const songKey = `${song.name}-${song.artist}`;
    
    // 喜欢的歌曲加分
    if (this.djState.userPreferences.likedSongs.has(songKey)) score += 10;
    
    // 喜欢的艺人加分
    if (this.djState.userPreferences.favoriteArtists.has(song.artist)) score += 5;
    
    // 播放次数加分
    const playCount = this.djState.userPreferences.playCount[songKey] || 0;
    score += Math.min(playCount, 5); // 最多加5分
    
    // 跳过的歌曲减分
    if (this.djState.userPreferences.skippedSongs.has(songKey)) score -= 10;
    
    return score;
  }
  
  // 启动定时播报
  startAnnouncementLoop() {
    // 每15-25分钟播报一次
    const interval = (15 + Math.random() * 10) * 60 * 1000;
    
    this.djState.announcementInterval = setInterval(() => {
      this.makePeriodicAnnouncement();
    }, interval);
    
    console.log('[DJ] 定时播报已启动，间隔:', Math.round(interval / 60000), '分钟');
  }
  
  // 停止定时播报
  stopAnnouncementLoop() {
    if (this.djState.announcementInterval) {
      clearInterval(this.djState.announcementInterval);
      this.djState.announcementInterval = null;
      console.log('[DJ] 定时播报已停止');
    }
  }
  
  // 定时播报
  async makePeriodicAnnouncement() {
    const announcements = [
      '音乐继续，好歌不断。',
      '希望这些音乐能让你心情愉快。',
      'Hermudio，你的专属音乐电台。',
      '好音乐，值得细细品味。'
    ];
    
    const text = announcements[Math.floor(Math.random() * announcements.length)];
    await this.speak(text);
  }
  
  // 回调函数：当DJ说话时触发
  onDJSpeak(text, voice) {
    // 由外部设置
  }
}

// 创建全局实例
const djController = new DJController();
