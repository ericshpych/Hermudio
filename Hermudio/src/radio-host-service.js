/**
 * Radio Host Service for Hermudio
 * 
 * Generates AI-powered radio host narration scripts
 * Manages the flow: Welcome -> Song Intro -> Song Play -> Outro
 * Enhanced with more emotional and scenario-specific expressions
 */

const { getCurrentScene, getSceneDescription } = require('./scene-analyzer');

class RadioHostService {
  constructor(db, hermesService) {
    this.db = db;
    this.hermes = hermesService;
    this.currentPlaylist = [];
    this.currentSongIndex = 0;
    this.isPlaying = false;
    
    // Emotional expression templates
    this.emotionalExpressions = {
      warm: ['温暖的', '温馨的', '亲切的', '柔和的'],
      excited: ['欢快的', '热情的', '活力的', '激情的'],
      calm: ['安静的', '宁静的', '舒缓的', '平静的'],
      melancholic: ['温柔的', '略带忧伤的', '深沉的', '内敛的']
    };
    
    // Time-specific greetings
    this.timeGreetings = {
      dawn: '凌晨好',
      earlyMorning: '清晨好',
      morning: '早上好',
      lateMorning: '上午好',
      midday: '中午好',
      afternoon: '下午好',
      lateAfternoon: '傍晚好',
      evening: '傍晚好',
      night: '晚上好',
      lateNight: '深夜好'
    };
    
    // Season and event-based themes
    this.seasonalThemes = this.getSeasonalThemes();
  }

  /**
   * Get current season and relevant themes
   */
  getSeasonalThemes() {
    const month = new Date().getMonth() + 1;
    
    if (month >= 3 && month <= 5) {
      return {
        season: 'spring',
        theme: '春天',
        keywords: ['春暖花开', '万物复苏', '新生的', '希望的'],
        colors: ['粉色', '绿色', '浅色']
      };
    } else if (month >= 6 && month <= 8) {
      return {
        season: 'summer',
        theme: '夏天',
        keywords: ['阳光', '热情', '活力', '清凉'],
        colors: ['蓝色', '黄色', '明亮']
      };
    } else if (month >= 9 && month <= 11) {
      return {
        season: 'autumn',
        theme: '秋天',
        keywords: ['秋意', '收获', '金黄', '沉静'],
        colors: ['橙色', '棕色', '暖色']
      };
    } else {
      return {
        season: 'winter',
        theme: '冬天',
        keywords: ['温暖', '宁静', '沉淀', '希望'],
        colors: ['白色', '暖色', '柔和']
      };
    }
  }

  /**
   * Get time-specific greeting based on hour
   */
  getTimeGreeting() {
    const hour = new Date().getHours();
    
    if (hour >= 4 && hour < 6) return this.timeGreetings.dawn;
    if (hour >= 6 && hour < 8) return this.timeGreetings.earlyMorning;
    if (hour >= 8 && hour < 10) return this.timeGreetings.morning;
    if (hour >= 10 && hour < 12) return this.timeGreetings.lateMorning;
    if (hour >= 12 && hour < 14) return this.timeGreetings.midday;
    if (hour >= 14 && hour < 17) return this.timeGreetings.afternoon;
    if (hour >= 17 && hour < 19) return this.timeGreetings.lateAfternoon;
    if (hour >= 19 && hour < 21) return this.timeGreetings.evening;
    if (hour >= 21 && hour < 24) return this.timeGreetings.night;
    return this.timeGreetings.lateNight;
  }

  /**
   * Pick random item from array
   */
  pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /**
   * Generate emotional expression based on context
   */
  generateEmotionalExpression(emotion = 'warm') {
    const expressions = this.emotionalExpressions[emotion] || this.emotionalExpressions.warm;
    return this.pickRandom(expressions);
  }

  /**
   * Generate welcome message for the radio show
   */
  async generateWelcomeMessage() {
    const scene = await getCurrentScene();
    const sceneDesc = getSceneDescription(scene);
    const hour = new Date().getHours();
    
    let timeGreeting = '';
    if (hour < 6) timeGreeting = '凌晨好';
    else if (hour < 9) timeGreeting = '早上好';
    else if (hour < 12) timeGreeting = '上午好';
    else if (hour < 14) timeGreeting = '中午好';
    else if (hour < 18) timeGreeting = '下午好';
    else timeGreeting = '晚上好';

    const prompts = [
      `你是Hermudio的电台主持人Hermes。现在是${sceneDesc}，请用温暖、亲切的中文生成一段20-30秒的欢迎语，包含：
1. ${timeGreeting}的问候
2. 当前场景的描述（${scene.timeOfDay}，${scene.weather}）
3. 介绍今天的音乐主题
4. 邀请听众放松心情，享受音乐

要求：口语化、自然、有感染力，像真实的电台DJ一样。`,

      `作为Hermudio的主持人，现在是${sceneDesc}。请生成一段简短的开场白（中文）：
- 问候听众${timeGreeting}
- 简单描述现在的氛围
- 预告接下来会播放什么类型的音乐
- 让听众感到舒适和期待`,

      `你是Hermes，一个温暖的AI电台主持人。${sceneDesc}，请用中文说一段欢迎词：
- 亲切地问候
- 提及当前时间氛围
- 简单介绍电台理念
- 邀请听众一起享受音乐时光`
    ];

    const prompt = prompts[Math.floor(Math.random() * prompts.length)];
    
    try {
      const response = await this.hermes.chat(prompt);
      return this.cleanScript(response);
    } catch (error) {
      console.error('[RadioHost] Failed to generate welcome:', error);
      // Fallback welcome message
      return `${timeGreeting}，欢迎来到Hermudio。我是你的音乐伙伴Hermes。现在是${sceneDesc}，我为你准备了一些适合这个时刻的音乐，希望能让你的心情更加美好。让我们一起享受这段音乐时光吧。`;
    }
  }

  /**
   * Generate song introduction
   */
  async generateSongIntro(song, scene) {
    const sceneDesc = getSceneDescription(scene);
    
    const prompts = [
      `你是Hermudio的主持人Hermes。现在${sceneDesc}，即将播放歌曲《${song.name}》由${song.artist}演唱。

请用中文生成一段15-20秒的歌曲介绍，包含：
1. 歌曲名称和歌手的自然引入
2. 这首歌适合当前场景的原因
3. 简单描述歌曲风格或情感
4. 邀请听众欣赏

要求：像电台DJ一样自然、有感染力，不要机械地罗列信息。`,

      `作为电台主持人Hermes，请为即将播放的《${song.name}》-${song.artist}生成一段简短的intro（中文）：
- 自然地提到歌名和歌手
- 为什么现在播放这首歌很合适（${sceneDesc}）
- 用一句话描述这首歌给人的感觉
- 引导听众进入音乐`,

      `你是Hermes，正在主持Hermudio。下一首歌是${song.artist}的《${song.name}》。
请用温暖的中文生成一段歌曲介绍：
- 轻松自然地介绍这首歌
- 结合当前氛围（${scene.timeOfDay}）
- 让听众对这首歌产生期待`
    ];

    const prompt = prompts[Math.floor(Math.random() * prompts.length)];
    
    try {
      const response = await this.hermes.chat(prompt);
      return this.cleanScript(response);
    } catch (error) {
      console.error('[RadioHost] Failed to generate song intro:', error);
      // Fallback intro
      return `接下来这首歌是${song.artist}的《${song.name}》。在这个${scene.timeOfDay}，希望这首歌能带给你一些特别的感受。`;
    }
  }

  /**
   * Generate outro after song finishes
   */
  async generateSongOutro(song, userReaction = null) {
    const prompts = [
      `你是Hermudio的主持人Hermes。刚刚播放完${song.artist}的《${song.name}》。

请用中文生成一段简短的outro（10-15秒）：
1. 简单回应刚才这首歌
2. 如果听众喜欢，可以预告下一首风格相似的歌
3. 保持温暖、轻松的语气

要求：自然、简短，像真实的电台DJ。`,

      `作为Hermes，请为刚刚播放完的《${song.name}》生成一段简短的结束语（中文）：
- 简单分享对这首歌的感受
- 自然过渡到下一首歌
- 保持轻松的氛围`,

      `你是电台主持人Hermes。刚刚那首歌是${song.artist}的《${song.name}》。
请用中文说几句：
- 对这首歌的简单感受
- 预告接下来还有更多好音乐
- 保持听众的期待感`
    ];

    const prompt = prompts[Math.floor(Math.random() * prompts.length)];
    
    try {
      const response = await this.hermes.chat(prompt);
      return this.cleanScript(response);
    } catch (error) {
      console.error('[RadioHost] Failed to generate outro:', error);
      // Fallback outro
      return `刚才那首歌怎么样？如果你喜欢这种风格，接下来还有更多类似的音乐等着你。`;
    }
  }

  /**
   * Generate daily playlist introduction
   */
  async generatePlaylistIntro(songs, scene) {
    const songList = songs.slice(0, 5).map((s, i) => `${i + 1}. ${s.name} - ${s.artist}`).join('\n');
    const sceneDesc = getSceneDescription(scene);
    
    const prompt = `你是Hermudio的主持人Hermes。现在${sceneDesc}，今天为你准备了以下歌单：

${songList}

请用中文生成一段30-40秒的playlist介绍，包含：
1. 整体介绍今天歌单的主题和氛围
2. 简单提及其中2-3首歌的亮点
3. 邀请听众放松心情，享受这段音乐旅程

要求：像专业的电台DJ一样，有感染力，让听众对歌单产生期待。`;

    try {
      const response = await this.hermes.chat(prompt);
      return this.cleanScript(response);
    } catch (error) {
      console.error('[RadioHost] Failed to generate playlist intro:', error);
      return `今天为你准备了${songs.length}首精选歌曲，希望这些音乐能陪伴你度过美好的${scene.timeOfDay}。让我们开始吧。`;
    }
  }

  /**
   * Generate transition between songs
   */
  async generateTransition(prevSong, nextSong, scene) {
    const prompt = `你是Hermudio的主持人Hermes。刚刚播放完${prevSong.artist}的《${prevSong.name}》，接下来要播放${nextSong.artist}的《${nextSong.name}》。

请用中文生成一段简短的过渡语（5-10秒）：
- 简单回应上一首歌
- 自然引入下一首歌
- 保持流畅的过渡

要求：简短、自然。`;

    try {
      const response = await this.hermes.chat(prompt);
      return this.cleanScript(response);
    } catch (error) {
      return `接下来是${nextSong.artist}的《${nextSong.name}》。`;
    }
  }

  /**
   * Generate show closing message
   */
  async generateClosingMessage() {
    const hour = new Date().getHours();
    let closing = '';
    if (hour < 6) closing = '夜深了，记得早点休息';
    else if (hour < 12) closing = '祝你今天有个好心情';
    else if (hour < 18) closing = '下午继续加油';
    else closing = '祝你有个美好的夜晚';

    const prompt = `你是Hermudio的主持人Hermes。今天的音乐时光即将结束。

请用中文生成一段简短的结束语（15-20秒）：
1. 感谢听众的陪伴
2. "${closing}"
3. 邀请听众下次再来
4. 温暖的道别

要求：真诚、温暖，像朋友一样道别。`;

    try {
      const response = await this.hermes.chat(prompt);
      return this.cleanScript(response);
    } catch (error) {
      return `感谢你的陪伴，希望今天的音乐让你感到愉悦。${closing}，我们下次再见。`;
    }
  }

  /**
   * Clean up AI-generated script
   */
  cleanScript(text) {
    return text
      .replace(/^(主持人|Hermes|电台主持人)[:：]/g, '')
      .replace(/^[""'](.*)[""']$/g, '$1')
      .replace(/\[.*?\]/g, '')
      .replace(/\(.*?\)/g, '')
      .replace(/\n+/g, ' ')
      .trim();
  }

  /**
   * Set current playlist
   */
  setPlaylist(songs) {
    this.currentPlaylist = songs;
    this.currentSongIndex = 0;
  }

  /**
   * Get current song
   */
  getCurrentSong() {
    return this.currentPlaylist[this.currentSongIndex];
  }

  /**
   * Move to next song
   */
  nextSong() {
    this.currentSongIndex++;
    if (this.currentSongIndex >= this.currentPlaylist.length) {
      this.currentSongIndex = 0;
    }
    return this.getCurrentSong();
  }

  /**
   * Check if there are more songs
   */
  hasMoreSongs() {
    return this.currentSongIndex < this.currentPlaylist.length - 1;
  }
}

module.exports = { RadioHostService };
