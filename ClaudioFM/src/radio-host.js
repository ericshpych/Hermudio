/**
 * Radio Host Service for Hermudio
 * 
 * Generates radio host narration scripts and manages TTS playback
 * with synchronized text display
 */

const { getCurrentScene, getSceneDescription } = require('./scene-analyzer');

class RadioHost {
  constructor(hermesService, ttsService) {
    this.hermes = hermesService;
    this.tts = ttsService;
    this.currentPlaylist = [];
    this.currentTrackIndex = 0;
    this.isOnAir = false;
    this.onScriptUpdate = null; // Callback for script updates
    this.onWordHighlight = null; // Callback for word highlighting
  }

  /**
   * Generate welcome script based on time and scene
   */
  async generateWelcomeScript() {
    const scene = await getCurrentScene();
    const sceneDesc = getSceneDescription(scene);
    const hour = new Date().getHours();
    
    let greeting = '';
    if (hour < 6) greeting = '凌晨好';
    else if (hour < 9) greeting = '早上好';
    else if (hour < 12) greeting = '上午好';
    else if (hour < 14) greeting = '中午好';
    else if (hour < 18) greeting = '下午好';
    else greeting = '晚上好';

    const welcomeScripts = [
      `${greeting}，欢迎收听 Hermudio。我是你的专属音乐 DJ，Hermes。现在是${sceneDesc}，让我为你挑选一些适合此刻的音乐。`,
      `${greeting}，欢迎来到 Hermudio。我是 Hermes，你的私人音乐电台主持人。${sceneDesc}，让我用音乐陪伴你度过这段时光。`,
      `欢迎来到 Hermudio，${greeting}。我是 Hermes，今天由我来为你挑选音乐。${sceneDesc}，希望接下来的歌曲能让你感到放松。`
    ];

    // Randomly select a welcome script
    return welcomeScripts[Math.floor(Math.random() * welcomeScripts.length)];
  }

  /**
   * Generate song introduction script
   */
  async generateSongIntro(song, scene) {
    const intros = [
      `接下来这首是${song.artist}的《${song.name}》，${this.getMoodDescription(scene.mood)}。`,
      `现在为你播放${song.artist}的《${song.name}》，${this.getTimeContext(scene.timeOfDay)}。`,
      `下一首是来自${song.artist}的《${song.name}》，${this.getWeatherContext(scene.weather)}。`,
      `这首《${song.name}》由${song.artist}演唱，${this.getStyleDescription(song.style || scene.mood)}。`
    ];

    return intros[Math.floor(Math.random() * intros.length)];
  }

  /**
   * Generate song outro/transition script
   */
  async generateSongOutro(song, nextSong) {
    if (nextSong) {
      const transitions = [
        `刚才这首《${song.name}》怎么样？接下来让我们继续聆听${nextSong.artist}的《${nextSong.name}》。`,
        `${song.artist}的《${song.name}》就到这里。下一首是${nextSong.artist}的《${nextSong.name}》，请欣赏。`,
        `感谢收听《${song.name}》。准备好了吗？接下来是${nextSong.artist}的《${nextSong.name}》。`
      ];
      return transitions[Math.floor(Math.random() * transitions.length)];
    } else {
      const outros = [
        `刚才这首《${song.name}》来自${song.artist}。今天的音乐时光就到这里，感谢收听。`,
        `感谢聆听${song.artist}的《${song.name}》。希望这些音乐能给你带来美好的一天。`,
        `《${song.name}》播放完毕。我是 Hermes，感谢你选择 Hermudio。`
      ];
      return outros[Math.floor(Math.random() * outros.length)];
    }
  }

  /**
   * Generate scene-based commentary
   */
  async generateSceneCommentary(scene) {
    const commentaries = [
      `这样的${scene.weather === 'sunny' ? '阳光' : scene.weather === 'rainy' ? '雨天' : '天气'}，配上这样的音乐，感觉如何呢？`,
      `${scene.timeOfDay === 'morning' ? '清晨' : scene.timeOfDay === 'night' ? '深夜' : '此刻'}的时光，总是让人思绪万千。`,
      `不知道你现在在做什么呢？希望这些音乐能成为你${scene.timeOfDay === 'work' ? '工作' : '生活'}中的美好背景。`
    ];

    return commentaries[Math.floor(Math.random() * commentaries.length)];
  }

  /**
   * Get mood description
   */
  getMoodDescription(mood) {
    const descriptions = {
      'energetic': '