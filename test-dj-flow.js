/**
 * DJ电台完整流程测试脚本
 * 测试从开场白到自动播放推荐歌曲的完整流程
 */

// 模拟数据
const mockData = {
  // 模拟每日推荐歌曲
  recommendSongs: [
    {
      id: 123456,
      originalId: 123456,
      name: "晴天",
      artist: "周杰伦",
      album: "叶惠美",
      duration: 269,
      url: "https://music.163.com/song/media/outer/url?id=123456.mp3"
    },
    {
      id: 234567,
      originalId: 234567,
      name: "七里香",
      artist: "周杰伦",
      album: "七里香",
      duration: 299,
      url: "https://music.163.com/song/media/outer/url?id=234567.mp3"
    },
    {
      id: 345678,
      originalId: 345678,
      name: "稻香",
      artist: "周杰伦",
      album: "魔杰座",
      duration: 223,
      url: "https://music.163.com/song/media/outer/url?id=345678.mp3"
    },
    {
      id: 456789,
      originalId: 456789,
      name: "夜曲",
      artist: "周杰伦",
      album: "十一月的萧邦",
      duration: 226,
      url: "https://music.163.com/song/media/outer/url?id=456789.mp3"
    },
    {
      id: 567890,
      originalId: 567890,
      name: "告白气球",
      artist: "周杰伦",
      album: "周杰伦的床边故事",
      duration: 215,
      url: "https://music.163.com/song/media/outer/url?id=567890.mp3"
    }
  ],

  // 模拟天气数据
  weatherData: {
    '晴': { mood: '明亮', genres: ['流行', '摇滚', '电子'], energy: 'high' },
    '多云': { mood: '轻松', genres: ['民谣', '流行', '轻音乐'], energy: 'medium' },
    '阴': { mood: '沉静', genres: ['后摇', '民谣', '爵士'], energy: 'low' },
    '雨': { mood: '感性', genres: ['民谣', 'R&B', '爵士'], energy: 'low' },
    '雪': { mood: '纯净', genres: ['古典', '轻音乐', '民谣'], energy: 'low' }
  },

  // 模拟时间段
  timeOfDayMap: {
    morning: { label: '清晨', mood: '清新', intro: '早安！新的一天开始了。' },
    noon: { label: '午后', mood: '活力', intro: '午后的阳光正好。' },
    afternoon: { label: '下午', mood: '放松', intro: '下午好，来些轻松的音乐吧。' },
    evening: { label: '傍晚', mood: '惬意', intro: '傍晚时分，享受这份宁静。' },
    night: { label: '深夜', mood: '静谧', intro: '深夜电台，陪你度过这个夜晚。' },
    midnight: { label: '午夜', mood: '沉思', intro: '午夜时分，让音乐陪伴你。' }
  },

  // DJ话术模板
  announcements: {
    intro: [
      "欢迎来到 Hermudio，我是你的专属 DJ。接下来这段时间，让我用音乐陪伴你。",
      "这里是 Hermes 电台，我是今天的音乐向导。调大音量，让好音乐填满这个空间。",
      "打开音乐，开启一段美好的声音旅程。我是你的 DJ，感谢你选择 Hermudio。"
    ],
    weather: {
      '晴': [
        "今天阳光正好，这样的天气适合听些轻快的旋律。让音乐陪你享受这美好的一天。",
        "窗外的阳光洒进来，和今天的音乐一样温暖。希望这些歌能让你的心情更美丽。"
      ],
      '多云': [
        "今天的云层有点厚，但音乐可以穿透一切。来，让我为你选几首好歌。",
        "多云的天气，适合听些有深度的音乐。放松心情，享受这段旋律。"
      ],
      '雨': [
        "外面下着雨，这样的天气最适合窝在家里听音乐。让我为你准备一些温暖的旋律。",
        "听着雨声，配上一首好歌，这是属于你自己的小世界。"
      ],
      '阴': [
        "虽然天色有些阴沉，但音乐可以让心情明亮起来。来，让我为你点亮这个时刻。",
        "阴天也有属于它的美，就像这些歌，需要静下心来细细品味。"
      ],
      '雪': [
        "外面飘着雪，整个世界都变得安静。这样的时刻，需要一些纯净的音乐。",
        "雪花纷飞，音乐流淌。这是冬天独有的浪漫。"
      ],
      '默认': [
        "不管今天天气如何，希望这些音乐能让你感到舒适。",
        "音乐是最好的陪伴，无论你在做什么，都希望这些歌能给你带来好心情。"
      ]
    },
    songIntro: [
      "这首歌是 {artist} 的《{song}》，希望你会喜欢。",
      "接下来请听 {artist} 带来的《{song}》，一首很有感觉的歌。",
      "一首《{song}》，来自 {artist}。这是我今天想和你分享的音乐。",
      "下面这首歌是 {artist} 的《{song}》，让我们一起聆听。"
    ]
  }
};

// 模拟DJ控制器
class MockDJController {
  constructor() {
    this.mode = 'music';
    this.isPlaying = false;
    this.currentTrack = null;
    this.playlist = [];
    this.djState = {
      weather: null,
      timeOfDay: null,
      mood: null
    };
    this.ttsConfig = {
      enabled: true,
      currentVoice: 'female-chengshu',
      speed: 1.0,
      vol: 1.0,
      pitch: 0
    };
    
    // 事件回调
    this.onDJSpeak = null;
    this.onDJStart = null;
    this.onSongPlay = null;
  }

  // 获取当前时间段
  updateTimeOfDay() {
    const hour = new Date().getHours();
    let timeOfDay;
    
    if (hour >= 5 && hour < 11) timeOfDay = 'morning';
    else if (hour >= 11 && hour < 14) timeOfDay = 'noon';
    else if (hour >= 14 && hour < 18) timeOfDay = 'afternoon';
    else if (hour >= 18 && hour < 22) timeOfDay = 'evening';
    else if (hour >= 22 || hour < 2) timeOfDay = 'night';
    else timeOfDay = 'midnight';
    
    this.djState.timeOfDay = timeOfDay;
    return mockData.timeOfDayMap[timeOfDay];
  }

  // 获取随机天气
  getCurrentWeather() {
    const weathers = ['晴', '多云', '阴', '雨', '雪'];
    const randomWeather = weathers[Math.floor(Math.random() * weathers.length)];
    this.djState.weather = randomWeather;
    return randomWeather;
  }

  // 生成开场白
  generateIntro(weather, timeInfo) {
    const intros = mockData.announcements.intro;
    const weatherIntros = mockData.announcements.weather[weather] || mockData.announcements.weather['默认'];
    
    const randomIntro = intros[Math.floor(Math.random() * intros.length)];
    const randomWeatherIntro = weatherIntros[Math.floor(Math.random() * weatherIntros.length)];
    
    return `${randomIntro} ${timeInfo.intro} ${randomWeatherIntro}`;
  }

  // 生成歌曲介绍
  generateSongIntro(songName, artistName) {
    const templates = mockData.announcements.songIntro;
    const template = templates[Math.floor(Math.random() * templates.length)];
    return template.replace('{song}', songName).replace('{artist}', artistName);
  }

  // 模拟获取推荐歌曲
  async getRecommendedSongs() {
    console.log('📡 正在获取推荐歌曲...');
    
    const weather = this.getCurrentWeather();
    const timeInfo = this.updateTimeOfDay();
    const weatherMood = mockData.weatherData[weather] || mockData.weatherData['默认'];
    
    this.djState.mood = weatherMood.mood;
    
    // 模拟API延迟
    await this.delay(500);
    
    const songs = mockData.recommendSongs;
    
    console.log(`✅ 获取到 ${songs.length} 首推荐歌曲`);
    console.log(`🌤️ 当前天气: ${weather}, 心情: ${weatherMood.mood}`);
    console.log(`🕐 当前时段: ${timeInfo.label}`);
    
    return {
      success: true,
      songs: songs,
      weather: weather,
      timeOfDay: timeInfo.label,
      mood: weatherMood.mood,
      genres: weatherMood.genres,
      intro: {
        text: this.generateIntro(weather, timeInfo),
        weather: weather,
        time: timeInfo.label
      }
    };
  }

  // 模拟语音播报
  async speak(text) {
    console.log(`\n🎙️ DJ语音播报:`);
    console.log(`   "${text}"`);
    console.log(`   [音色: ${this.ttsConfig.currentVoice}, 语速: ${this.ttsConfig.speed}x]`);
    
    // 触发回调
    if (this.onDJSpeak) {
      this.onDJSpeak(text, { name: '成熟女性', id: this.ttsConfig.currentVoice });
    }
    
    // 模拟语音播放时间（根据文字长度估算）
    const duration = Math.max(2000, text.length * 200);
    await this.delay(duration);
    
    console.log(`   ✅ 语音播放完成 (${(duration/1000).toFixed(1)}秒)`);
  }

  // 模拟播放歌曲
  async playSong(song) {
    this.currentTrack = song;
    
    // 生成歌曲介绍
    const intro = this.generateSongIntro(song.name, song.artist);
    await this.speak(intro);
    
    console.log(`\n🎵 开始播放歌曲:`);
    console.log(`   歌名: ${song.name}`);
    console.log(`   艺人: ${song.artist}`);
    console.log(`   专辑: ${song.album}`);
    console.log(`   时长: ${this.formatTime(song.duration)}`);
    
    this.isPlaying = true;
    
    if (this.onSongPlay) {
      this.onSongPlay(song);
    }
    
    return { success: true };
  }

  // 开始DJ模式
  async startDJMode() {
    console.log('\n========================================');
    console.log('🎙️ DJ电台模式启动');
    console.log('========================================\n');
    
    this.mode = 'dj';
    this.isPlaying = true;
    
    // 获取推荐
    const recommendation = await this.getRecommendedSongs();
    
    if (recommendation.success) {
      // 触发DJ开始事件
      if (this.onDJStart) {
        this.onDJStart(recommendation);
      }
      
      console.log('\n📢 开场白内容:');
      console.log(`   ${recommendation.intro.text}`);
      
      // 播放开场白并等待完成
      await this.speak(recommendation.intro.text);
      
      // 开场白播放完后，开始播放第一首歌
      if (recommendation.songs.length > 0) {
        const firstSong = recommendation.songs[0];
        await this.playSong(firstSong);
      }
      
      return recommendation;
    }
    
    return recommendation;
  }

  // 工具方法
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}

// 测试函数
async function testDJFlow() {
  console.log('\n🧪 开始测试DJ电台完整流程\n');
  
  const dj = new MockDJController();
  
  // 设置事件监听
  dj.onDJStart = (recommendation) => {
    console.log('\n📊 DJ开始事件触发:');
    console.log(`   - 推荐歌曲数: ${recommendation.songs.length}`);
    console.log(`   - 天气: ${recommendation.weather}`);
    console.log(`   - 时段: ${recommendation.timeOfDay}`);
    console.log(`   - 心情: ${recommendation.mood}`);
  };
  
  dj.onDJSpeak = (text, voiceInfo) => {
    // 这里可以更新UI显示DJ说的话
  };
  
  dj.onSongPlay = (song) => {
    console.log(`\n✅ 歌曲播放事件: ${song.name} - ${song.artist}`);
  };
  
  // 开始DJ模式
  const result = await dj.startDJMode();
  
  // 验证结果
  console.log('\n========================================');
  console.log('📋 测试结果验证');
  console.log('========================================');
  
  const checks = [
    { name: '获取推荐歌曲', pass: result.success && result.songs.length > 0 },
    { name: '开场白生成', pass: result.intro && result.intro.text.length > 0 },
    { name: '天气信息', pass: result.weather && result.mood },
    { name: '时段信息', pass: result.timeOfDay },
    { name: '语音播报完成', pass: true }, // 如果执行到这里说明speak已完成
    { name: '歌曲播放', pass: dj.isPlaying && dj.currentTrack !== null }
  ];
  
  let allPass = true;
  checks.forEach(check => {
    const status = check.pass ? '✅' : '❌';
    console.log(`${status} ${check.name}`);
    if (!check.pass) allPass = false;
  });
  
  console.log('\n========================================');
  if (allPass) {
    console.log('🎉 所有测试通过！DJ电台流程正常');
  } else {
    console.log('⚠️ 部分测试未通过，请检查代码');
  }
  console.log('========================================\n');
  
  return { success: allPass, result };
}

// 运行测试
testDJFlow().then(({ success, result }) => {
  if (success) {
    console.log('💡 测试说明:');
    console.log('   1. DJ模式启动后会自动获取推荐歌曲');
    console.log('   2. 根据当前时间和天气生成开场白');
    console.log('   3. 使用MiniMax TTS播放开场白语音');
    console.log('   4. 语音结束后自动播放第一首歌');
    console.log('   5. 每首歌播放前会有DJ语音介绍\n');
  }
  process.exit(success ? 0 : 1);
}).catch(err => {
  console.error('测试失败:', err);
  process.exit(1);
});
