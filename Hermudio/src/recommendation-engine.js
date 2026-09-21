/**
 * AI Recommendation Engine for Hermudio
 * 
 * Hardcoded playlist for stability
 */

const { getCurrentScene } = require('./scene-analyzer');
const { MusicService } = require('./music-service');
const { getSongsForScene } = require('./verified-catalog');

class RecommendationEngine {
  constructor(db, userProfile, musicService = null) {
    this.db = db;
    this.userProfile = userProfile;
    this.playedSongs = new Set();
    this.dailyPlayedSongs = new Set();
    this.todayDate = this.getTodayDate();
    this.dailyPlaysLoaded = false;
    this.musicService = musicService || new MusicService(db);
    
    this.loadDailyPlayedSongs().then(() => {
      this.dailyPlaysLoaded = true;
    });
  }

  getTodayDate() {
    return new Date().toISOString().split('T')[0];
  }

  getDetailedTimePeriod() {
    const hour = new Date().getHours();
    if (hour >= 0 && hour < 5) return 'night';
    if (hour >= 5 && hour < 7) return 'early_morning';
    if (hour >= 7 && hour < 9) return 'morning';
    if (hour >= 9 && hour < 12) return 'forenoon';
    if (hour >= 12 && hour < 14) return 'noon';
    if (hour >= 14 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 19) return 'evening';
    if (hour >= 19 && hour < 22) return 'night';
    return 'late_night';
  }

  inferMood(scene) {
    const { timeOfDay } = scene;
    const moodMap = {
      'early_morning': ['peaceful', 'relaxed'],
      'morning': ['energetic', 'happy'],
      'forenoon': ['focused', 'energetic'],
      'noon': ['relaxed', 'peaceful'],
      'afternoon': ['focused', 'relaxed'],
      'evening': ['happy', 'relaxed'],
      'night': ['peaceful', 'melancholy'],
      'late_night': ['melancholy', 'peaceful']
    };
    const possibleMoods = moodMap[timeOfDay] || ['relaxed'];
    return possibleMoods[Math.floor(Math.random() * possibleMoods.length)];
  }

  loadDailyPlayedSongs() {
    return new Promise((resolve) => {
      this.dailyPlayedSongs = new Set();
      resolve();
    });
  }

  markSongAsPlayed(songId) {
    if (!songId) return;
    this.playedSongs.add(songId);
    this.dailyPlayedSongs.add(songId);
  }

  async isSongPlayedToday(songId) {
    return this.dailyPlayedSongs.has(songId) || this.playedSongs.has(songId);
  }

  clearPlayedSongs() {
    this.playedSongs.clear();
    this.dailyPlayedSongs.clear();
  }

  async getRecommendations(count = 5, context = {}) {
    console.log('[Recommendation] getRecommendations called');
    
    const recommendations = [];
    const maxAttempts = count * 10;
    let attempts = 0;
    let allowPlayedSongs = false;

    // 已验证可播歌单（真实 ID，按场景筛选）
    const realSongs = getSongsForScene(context?.scene?.timeOfDay);

    while (recommendations.length < count && attempts < maxAttempts) {
      attempts++;
      
      const rec = await this.getRecommendation(context, realSongs);
      
      if (rec && rec.song) {
        const isInCurrentPlaylist = recommendations.some(r => r.song.id === rec.song.id);
        let isPlayedToday = false;
        try {
          isPlayedToday = !allowPlayedSongs && await this.isSongPlayedToday(rec.song.id);
        } catch (error) {
          isPlayedToday = false;
        }
        
        if (!isInCurrentPlaylist && !isPlayedToday) {
          recommendations.push(rec);
          console.log('[Recommendation] Added unique song:', rec.song.name, '-', rec.song.artist);
        }
        
        if (attempts > count * 3 && recommendations.length < count) {
          if (!allowPlayedSongs) {
            allowPlayedSongs = true;
            console.log('[Recommendation] Allowing played songs');
          }
        }
      }
    }

    console.log('[Recommendation] Generated', recommendations.length, 'recommendations');
    return recommendations;
  }

  async getRecommendation(context = {}, songPool = null) {
    let scene = context.scene;
    if (!scene) {
      scene = await getCurrentScene();
    }

    // 已验证可播歌单（真实 ID，按场景筛选）
    const realSongs = songPool || getSongsForScene(scene?.timeOfDay);

    const selected = realSongs[Math.floor(Math.random() * realSongs.length)];
    console.log('[Recommendation] Selected song:', selected.name, '-', selected.artist);
    
    return {
      song: selected,
      reason: this.generateReason(scene, selected),
      source: 'hardcoded'
    };
  }

  generateReason(scene, song) {
    const { timeOfDay } = scene;
    const timeDescriptions = {
      morning: '清晨',
      afternoon: '午后',
      evening: '傍晚',
      night: '深夜'
    };
    const reasons = [
      `${timeDescriptions[timeOfDay] || timeOfDay}时分，这首${song.name}很适合现在的氛围`,
      `来一首${song.name}放松一下`,
      `推荐这首${song.name}`,
      `这首${song.name}很适合现在听`
    ];
    return reasons[Math.floor(Math.random() * reasons.length)];
  }

  async getChatRecommendation(userInput, context = {}) {
    return this.getRecommendation(context);
  }

  async searchAndFilter() {
    return [];
  }
}

module.exports = { RecommendationEngine };
