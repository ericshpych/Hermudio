/**
 * AI Recommendation Engine for Hermudio
 * 
 * Core responsibilities:
 * 1. Scene-based music recommendation (time, weather, mood)
 * 2. User preference learning and matching
 * 3. Multi-strategy song matching
 * 4. Fallback recommendation chains
 * 5. Diversity and novelty scoring
 */

const { getCurrentScene } = require('./scene-analyzer');
const { MusicService } = require('./music-service');

class RecommendationEngine {
  constructor(db, userProfile) {
    this.db = db;
    this.userProfile = userProfile;
    this.recommendationCache = new Map();
    this.lastRecommendation = null;
    this.musicService = new MusicService(db);
    this.playedSongs = new Set();
    this.recentRecommendations = []; // Track recent recs for diversity
    this.maxRecentRecs = 20;
    
    // Recommendation diversity settings
    this.diversityThreshold = 3; // Max similar songs in recent recs
    this.noveltyBoost = 0.3; // Boost for new/unplayed songs
  }

  /**
   * Mark a song as played
   */
  markSongAsPlayed(songId) {
    if (songId) {
      this.playedSongs.add(songId);
      console.log('[Recommendation] Marked song as played:', songId, 'Total played:', this.playedSongs.size);
      
      // If played songs exceed 50, clear half of them to allow rediscovery
      if (this.playedSongs.size > 50) {
        const songsArray = Array.from(this.playedSongs);
        const halfLength = Math.floor(songsArray.length / 2);
        this.playedSongs = new Set(songsArray.slice(halfLength));
        console.log('[Recommendation] Cleared old played songs, remaining:', this.playedSongs.size);
      }
    }
  }

  /**
   * Clear played songs history
   */
  clearPlayedSongs() {
    this.playedSongs.clear();
    this.recentRecommendations = [];
    console.log('[Recommendation] Cleared played songs history');
  }

  /**
   * Add to recent recommendations for diversity tracking
   */
  addToRecentRecs(song, score = 1) {
    this.recentRecommendations.push({
      id: song.id,
      artist: song.artist,
      name: song.name,
      score,
      timestamp: Date.now()
    });
    
    // Keep only recent recs
    if (this.recentRecommendations.length > this.maxRecentRecs) {
      this.recentRecommendations.shift();
    }
  }

  /**
   * Calculate diversity score for a song
   * Higher score = more diverse from recent recommendations
   */
  calculateDiversityScore(song) {
    if (this.recentRecommendations.length === 0) {
      return 1.0; // No history, give max diversity
    }

    // Count similar songs in recent recommendations
    let similarCount = 0;
    
    for (const recent of this.recentRecommendations) {
      // Same artist counts as similar
      if (recent.artist === song.artist) {
        similarCount += 2; // Weight artist similarity higher
      }
      // Same song counts as very similar
      if (recent.id === song.id) {
        similarCount += 5;
      }
    }

    // Calculate diversity score (0-1, higher = more diverse)
    const maxSimilar = this.recentRecommendations.length * 2;
    const diversityScore = 1 - Math.min(similarCount / maxSimilar, 1);
    
    return diversityScore;
  }

  /**
   * Calculate novelty score (new/unplayed songs get boost)
   */
  calculateNoveltyScore(song) {
    // Check if song was recently played
    const wasRecentlyPlayed = this.playedSongs.has(song.id);
    
    // Check if song is in recent recommendations
    const inRecentRecs = this.recentRecommendations.some(r => r.id === song.id);
    
    if (!wasRecentlyPlayed && !inRecentRecs) {
      return 1 + this.noveltyBoost; // New song gets novelty boost
    }
    
    return 1.0; // Existing song gets normal score
  }

  /**
   * Calculate combined recommendation score
   */
  calculateRecScore(song, scene, userPrefs) {
    let score = 100;
    
    // Diversity boost
    score += this.calculateDiversityScore(song) * 30;
    
    // Novelty boost
    score *= this.calculateNoveltyScore(song);
    
    // Scene matching bonus
    const sceneMatchBonus = this.calculateSceneMatchBonus(song, scene);
    score += sceneMatchBonus;
    
    // User preference match bonus
    const prefMatchBonus = this.calculatePreferenceMatchBonus(song, userPrefs);
    score += prefMatchBonus;
    
    return score;
  }

  /**
   * Calculate how well a song matches the current scene
   */
  calculateSceneMatchBonus(song, scene) {
    let bonus = 0;
    const { timeOfDay, weather, mood } = scene;
    
    // Time-based matching
    const isNight = timeOfDay === 'night';
    const songText = `${song.name} ${song.artist} ${song.album || ''}`.toLowerCase();
    
    // Night time prefers calm music
    if (isNight) {
      if (/爵士|jazz|古典|钢琴|piano|轻音乐|纯音乐|安静|舒缓/.test(songText)) {
        bonus += 20;
      }
      if (/摇滚|rock|电子|hiphop|hip-hop/.test(songText)) {
        bonus -= 10;
      }
    }
    
    // Daytime prefers energetic music
    if (!isNight) {
      if (/流行|pop|摇滚|rock|轻快|欢快|happy/.test(songText)) {
        bonus += 15;
      }
    }
    
    // Weather-based matching
    if (weather === 'rainy') {
      if (/雨天|雨|钢琴|爵士|治愈|安静/.test(songText)) {
        bonus += 15;
      }
    }
    
    if (weather === 'sunny') {
      if (/阳光|晴天|欢快|happy|流行|pop/.test(songText)) {
        bonus += 10;
      }
    }
    
    return bonus;
  }

  /**
   * Calculate user preference match bonus
   */
  calculatePreferenceMatchBonus(song, userPrefs) {
    let bonus = 0;
    
    if (!userPrefs) return bonus;
    
    const songText = `${song.name} ${song.artist} ${song.album || ''}`.toLowerCase();
    
    // Preferred artists bonus
    if (userPrefs.preferredArtists && userPrefs.preferredArtists.length > 0) {
      for (const artist of userPrefs.preferredArtists) {
        if (song.artist && song.artist.includes(artist)) {
          bonus += 25;
          break;
        }
      }
    }
    
    // Preferred styles bonus
    if (userPrefs.preferredStyles && userPrefs.preferredStyles.length > 0) {
      for (const style of userPrefs.preferredStyles) {
        if (songText.includes(style.toLowerCase())) {
          bonus += 15;
        }
      }
    }
    
    // Disliked styles penalty
    if (userPrefs.dislikedStyles && userPrefs.dislikedStyles.length > 0) {
      for (const style of userPrefs.dislikedStyles) {
        if (songText.includes(style.toLowerCase())) {
          bonus -= 30;
        }
      }
    }
    
    return bonus;
  }

  /**
   * Get multiple unique recommendations for a playlist
   */
  async getRecommendations(count = 5, context = {}) {
    const recommendations = [];
    const maxAttempts = count * 5;
    let attempts = 0;
    let allowPlayedSongs = false;
    
    const scene = await getCurrentScene();
    const userPrefs = await this.userProfile.getPreferences();

    while (recommendations.length < count && attempts < maxAttempts) {
      attempts++;
      const rec = await this.getRecommendation(context);
      
      if (rec && rec.song) {
        const isInCurrentPlaylist = recommendations.some(r => r.song.id === rec.song.id);
        const isPlayed = !allowPlayedSongs && this.playedSongs.has(rec.song.id);
        
        if (!isInCurrentPlaylist && !isPlayed) {
          // Calculate and add diversity score
          rec.diversityScore = this.calculateDiversityScore(rec.song);
          rec.noveltyScore = this.calculateNoveltyScore(rec.song);
          rec.totalScore = this.calculateRecScore(rec.song, scene, userPrefs);
          
          recommendations.push(rec);
          this.addToRecentRecs(rec.song, rec.totalScore);
          console.log('[Recommendation] Added unique song:', rec.song.name, '-', rec.song.artist, 'Score:', rec.totalScore.toFixed(1));
        } else {
          if (isInCurrentPlaylist) {
            console.log('[Recommendation] Skipped duplicate in playlist:', rec.song.name);
          } else if (isPlayed) {
            console.log('[Recommendation] Skipped played song:', rec.song.name);
          }
        }
        
        if (attempts > count * 3 && recommendations.length < count) {
          if (!allowPlayedSongs) {
            allowPlayedSongs = true;
            console.log('[Recommendation] Allowing played songs after', attempts, 'attempts');
          }
        }
      }
    }

    // Sort by total score (highest first)
    recommendations.sort((a, b) => b.totalScore - a.totalScore);
    
    console.log('[Recommendation] Generated', recommendations.length, 'unique recommendations after', attempts, 'attempts');
    return recommendations;
  }

  /**
   * Get personalized recommendation based on current context
   */
  async getRecommendation(context = {}) {
    const scene = await getCurrentScene();
    const userPrefs = await this.userProfile.getPreferences();
    
    console.log('[Recommendation] Current scene:', scene);
    console.log('[Recommendation] User preferences:', userPrefs);

    // Try multiple strategies in order
    // Note: External search is prioritized to ensure we get real songs with encryptedId
    const strategies = [
      // Strategy 1: AI-generated search queries based on scene (external search)
      () => this.recommendBySceneKeywords(scene, userPrefs),
      
      // Strategy 2: Popular songs in preferred styles (external search)
      () => this.recommendPopularInStyles(userPrefs),
      
      // Strategy 3: Match from local library based on scene
      () => this.recommendFromLibrary(scene, userPrefs),
      
      // Strategy 4: Fallback to time-based defaults
      () => this.recommendDefaults(scene)
    ];

    for (const strategy of strategies) {
      try {
        const result = await strategy();
        if (result && result.song) {
          this.lastRecommendation = result;
          return result;
        }
      } catch (error) {
        console.error('[Recommendation] Strategy failed:', error);
      }
    }

    return null;
  }

  /**
   * Recommend from local library (songs with play permission)
   * Falls back to external search if local library is empty
   */
  async recommendFromLibrary(scene, userPrefs) {
    return new Promise((resolve, reject) => {
      // Build query based on scene and preferences
      let query = 'SELECT * FROM local_library WHERE can_play = 1';
      const params = [];

      // Filter by preferred styles if available
      if (userPrefs.preferredStyles && userPrefs.preferredStyles.length > 0) {
        const styleConditions = userPrefs.preferredStyles.map(() => 'styles LIKE ?').join(' OR ');
        query += ` AND (${styleConditions})`;
        userPrefs.preferredStyles.forEach(style => {
          params.push(`%${style}%`);
        });
      }

      // Order by play count (favorites first) and random
      query += ' ORDER BY play_count DESC, RANDOM() LIMIT 5';

      this.db.all(query, params, async (err, rows) => {
        if (err) {
          reject(err);
          return;
        }

        if (rows && rows.length > 0) {
          const song = rows[0];
          resolve({
            song: {
              id: song.song_id,
              name: song.song_name,
              artist: song.artist,
              album: song.album
            },
            reason: this.generateReason(scene, song, 'library'),
            source: 'local_library'
          });
        } else {
          // Local library is empty, fall back to external search
          console.log('[Recommendation] Local library empty, falling back to external search');
          try {
            const searchQueries = this.generateSearchQueries(scene, userPrefs);
            for (const query of searchQueries) {
              const songs = await this.musicService.searchSongs(query, 3);
              if (songs.length > 0) {
                const song = songs[0];
                resolve({
                  song: {
                    id: song.id,
                    encryptedId: song.encryptedId,
                    originalId: song.originalId,
                    name: song.name,
                    artist: song.artist,
                    album: song.album
                  },
                  reason: this.generateReason(scene, song, 'scene'),
                  source: 'search'
                });
                return;
              }
            }
            resolve(null);
          } catch (error) {
            console.error('[Recommendation] External search failed:', error);
            resolve(null);
          }
        }
      });
    });
  }

  /**
   * Generate scene-based search keywords and recommend
   */
  async recommendBySceneKeywords(scene, userPrefs) {
    // Generate search queries based on scene
    const searchQueries = this.generateSearchQueries(scene, userPrefs);
    
    // Try each query until we find a playable song
    for (const query of searchQueries) {
      try {
        const songs = await this.searchAndFilter(query);
        if (songs.length > 0) {
          const song = songs[0];
          return {
            song,
            reason: this.generateReason(scene, song, 'scene'),
            source: 'search',
            searchQuery: query
          };
        }
      } catch (error) {
        console.error('[Recommendation] Search failed for query:', query, error);
      }
    }

    return null;
  }

  /**
   * Generate search queries based on current scene and user preferences
   * 
   * User preferences:
   * - 白天 → 欢快、提神的歌（摇滚、流行）
   * - 晚上 → 安静、舒缓，纯音乐优先（爵士、古典）
   * - 语言 → 中文为主
   * - 绝对不听 → 虫子叫、白噪音、电子音乐、嘻哈
   */
  generateSearchQueries(scene, userPrefs) {
    const queries = [];
    const { timeOfDay, weather, mood } = scene;
    const hour = new Date().getHours();
    
    // 判断是白天还是晚上 (6:00-18:00 为白天)
    const isDaytime = hour >= 6 && hour < 18;

    if (isDaytime) {
      // 白天 → 欢快、提神的歌（摇滚、流行）
      const daytimeQueries = [
        '中文 摇滚',
        '中文 流行',
        '华语 摇滚',
        '华语 流行',
        '摇滚 中文',
        '流行 中文',
        '提神 音乐',
        '活力 中文歌',
        ' upbeat 中文',
        'happy chinese',
        '华语 经典摇滚',
        '华语 经典流行',
        '中文 励志',
        '华语 动感',
        '中文 轻快'
      ];
      queries.push(...daytimeQueries);
    } else {
      // 晚上 → 安静、舒缓，纯音乐优先（爵士、古典）
      const nighttimeQueries = [
        '中文 爵士',
        '中文 古典',
        '华语 爵士',
        '华语 古典',
        '爵士 钢琴',
        '古典 钢琴',
        '纯音乐 爵士',
        '纯音乐 古典',
        '轻音乐 中文',
        '安静 钢琴',
        '舒缓 纯音乐',
        '治愈 钢琴',
        'night jazz',
        'classical piano',
        '华语 轻音乐'
      ];
      queries.push(...nighttimeQueries);
    }

    // Weather-based queries (避免使用白噪音相关)
    const weatherQueries = {
      rainy: ['雨天 钢琴', '雨天 爵士', '下雨 音乐'],
      sunny: isDaytime ? ['晴天 流行', '阳光 摇滚'] : ['晴天 轻音乐', '阳光 爵士'],
      cloudy: isDaytime ? ['阴天 流行', '阴天 摇滚'] : ['阴天 爵士', '阴天 古典']
    };

    if (weatherQueries[weather]) {
      queries.push(...weatherQueries[weather]);
    }

    // Mood-based queries
    const moodQueries = {
      happy: isDaytime ? ['开心 摇滚', 'happy 流行'] : ['开心 爵士', 'happy 轻音乐'],
      relaxed: isDaytime ? ['放松 流行', 'relax 摇滚'] : ['放松 古典', 'relax 爵士'],
      focused: isDaytime ? ['专注 摇滚', 'focus 流行'] : ['专注 古典', 'focus 爵士'],
      melancholy: isDaytime ? ['治愈 流行', 'healing 摇滚'] : ['治愈 钢琴', 'healing 古典']
    };

    if (moodQueries[mood]) {
      queries.push(...moodQueries[mood]);
    }

    // Add user preferred styles (过滤掉电子、嘻哈)
    if (userPrefs.preferredStyles) {
      const excludedStyles = ['电子', 'electronic', '嘻哈', 'hiphop', 'hip-hop', '说唱', 'rap'];
      userPrefs.preferredStyles.forEach(style => {
        const isExcluded = excludedStyles.some(excluded => 
          style.toLowerCase().includes(excluded.toLowerCase())
        );
        if (!isExcluded) {
          queries.push(style);
          queries.push(`中文 ${style}`);
        }
      });
    }

    // Shuffle and return unique queries
    return [...new Set(queries)].sort(() => Math.random() - 0.5);
  }

  /**
   * Filter out songs that match excluded keywords
   * 绝对不听: 虫子叫、白噪音、电子音乐、嘻哈
   */
  filterExcludedSongs(songs) {
    const excludedKeywords = [
      '虫', '昆虫', '虫子', '虫鸣', '虫叫',
      '白噪音', '白噪声', 'white noise', 'noise',
      '电子', 'electronic', 'edm', '电音',
      '嘻哈', 'hiphop', 'hip-hop', '说唱', 'rap', '饶舌'
    ];

    return songs.filter(song => {
      const searchText = `${song.name} ${song.artist} ${song.album || ''}`.toLowerCase();
      const isExcluded = excludedKeywords.some(keyword => 
        searchText.includes(keyword.toLowerCase())
      );
      
      if (isExcluded) {
        console.log('[Recommendation] Filtered out excluded song:', song.name, '-', song.artist);
      }
      
      return !isExcluded;
    });
  }

  /**
   * Check if a song should be excluded based on user preferences
   */
  shouldExcludeSong(song) {
    const excludedKeywords = [
      '虫', '昆虫', '虫子', '虫鸣', '虫叫',
      '白噪音', '白噪声', 'white noise', 'noise',
      '电子', 'electronic', 'edm', '电音',
      '嘻哈', 'hiphop', 'hip-hop', '说唱', 'rap', '饶舌'
    ];

    const searchText = `${song.name} ${song.artist} ${song.album || ''}`.toLowerCase();
    return excludedKeywords.some(keyword => 
      searchText.includes(keyword.toLowerCase())
    );
  }

  /**
   * Search songs and filter by play permission and user preferences
   * Prioritize external search to get real songs with encryptedId
   * Filters out: 虫子叫、白噪音、电子音乐、嘻哈
   */
  async searchAndFilter(keyword, limit = 5) {
    // First, try external music service to get real songs with encryptedId
    try {
      const results = await this.musicService.searchSongs(keyword, limit * 2); // Request more to account for filtering
      let playableResults = results.filter(song => song.canPlay !== false);
      
      // Apply user preference filtering
      playableResults = this.filterExcludedSongs(playableResults);
      
      if (playableResults.length > 0) {
        return playableResults.slice(0, limit);
      }
    } catch (error) {
      console.log('[Recommendation] External search failed, falling back to local library');
    }

    // If no external results, search in local library
    const localResults = await this.searchLocalLibrary(keyword, limit * 2);
    if (localResults.length > 0) {
      // Apply user preference filtering
      const filteredResults = this.filterExcludedSongs(localResults);
      return filteredResults.slice(0, limit);
    }

    return [];
  }

  /**
   * Search in local library
   */
  async searchLocalLibrary(keyword, limit = 5) {
    return new Promise((resolve, reject) => {
      const searchPattern = `%${keyword}%`;
      const query = `
        SELECT * FROM local_library 
        WHERE can_play = 1 
        AND (song_name LIKE ? OR artist LIKE ? OR styles LIKE ?)
        ORDER BY play_count DESC 
        LIMIT ?
      `;

      this.db.all(query, [searchPattern, searchPattern, searchPattern, limit], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }

        const songs = rows.map(row => ({
          id: row.song_id,
          name: row.song_name,
          artist: row.artist,
          album: row.album,
          canPlay: row.can_play === 1
        }));

        resolve(songs);
      });
    });
  }

  /**
   * Recommend popular songs in user's preferred styles
   */
  async recommendPopularInStyles(userPrefs) {
    if (!userPrefs.preferredStyles || userPrefs.preferredStyles.length === 0) {
      return null;
    }

    // Pick a random preferred style
    const style = userPrefs.preferredStyles[Math.floor(Math.random() * userPrefs.preferredStyles.length)];
    
    try {
      const songs = await this.searchAndFilter(`${style} 热门`, 3);
      if (songs.length > 0) {
        const song = songs[0];
        return {
          song,
          reason: `一首热门的${style}风格歌曲，希望你会喜欢`,
          source: 'popular'
        };
      }
    } catch (error) {
      console.error('[Recommendation] Popular search failed:', error);
    }

    return null;
  }

  /**
   * Fallback default recommendations
   * Based on user preferences:
   * - 白天 → 欢快、提神的歌（摇滚、流行）
   * - 晚上 → 安静、舒缓，纯音乐优先（爵士、古典）
   */
  async recommendDefaults(scene) {
    const hour = new Date().getHours();
    const isDaytime = hour >= 6 && hour < 18;
    
    // 根据时间段选择不同的兜底关键词
    const defaults = isDaytime ? {
      // 白天 - 摇滚、流行
      morning: { keyword: '华语 摇滚', reason: '清晨来一首华语摇滚，开启活力的一天' },
      afternoon: { keyword: '华语 流行', reason: '午后时光，一首华语流行歌很适合' },
      evening: { keyword: '中文 流行', reason: '傍晚时分，来首中文流行歌放松一下' },
      night: { keyword: '华语 摇滚', reason: '深夜的摇滚，释放内心的激情' }
    } : {
      // 晚上 - 爵士、古典
      morning: { keyword: '华语 爵士', reason: '清晨的爵士，温柔地唤醒你' },
      afternoon: { keyword: '古典 钢琴', reason: '午后的古典钢琴，让思绪沉淀' },
      evening: { keyword: '中文 爵士', reason: '傍晚的爵士，享受悠闲时光' },
      night: { keyword: '华语 古典', reason: '深夜的古典音乐，伴你入眠' }
    };

    const defaultConfig = defaults[scene.timeOfDay] || (isDaytime ? defaults.morning : defaults.night);
    
    try {
      const songs = await this.searchAndFilter(defaultConfig.keyword, 3);
      if (songs.length > 0) {
        const song = songs[Math.floor(Math.random() * songs.length)];
        return {
          song,
          reason: defaultConfig.reason,
          source: 'default'
        };
      }
    } catch (error) {
      console.error('[Recommendation] Default recommendation failed:', error);
    }

    return null;
  }

  /**
   * Generate human-readable recommendation reason
   */
  generateReason(scene, song, source) {
    const { timeOfDay, weather, mood } = scene;
    
    const timeDescriptions = {
      morning: '清晨',
      afternoon: '午后',
      evening: '傍晚',
      night: '深夜'
    };

    const weatherDescriptions = {
      rainy: '雨天',
      sunny: '阳光明媚',
      cloudy: '阴天',
      snowy: '雪天'
    };

    const reasons = [
      `${timeDescriptions[timeOfDay] || timeOfDay}时分，这首${song.name}很适合现在的氛围`,
      `${weatherDescriptions[weather] || ''}的${timeDescriptions[timeOfDay] || ''}，来一首${song.name}放松一下`,
      `根据你${timeOfDay === 'night' ? '深夜' : '现在'}的心情，推荐这首${song.name}`,
      `这首${song.name}的${song.artist}风格，很适合${timeDescriptions[timeOfDay] || '现在'}听`
    ];

    // Return random reason
    return reasons[Math.floor(Math.random() * reasons.length)];
  }

  /**
   * Get recommendation based on user chat input
   */
  async getChatRecommendation(userInput, context = {}) {
    // Parse user intent
    const intent = this.parseUserIntent(userInput);
    
    if (intent.type === 'specific_song') {
      // User requested specific song
      return this.recommendSpecificSong(intent.songName);
    } else if (intent.type === 'style_request') {
      // User requested style/mood
      return this.recommendByStyle(intent.style, context);
    } else if (intent.type === 'artist_request') {
      // User requested artist
      return this.recommendByArtist(intent.artist);
    } else {
      // General chat - use scene-based recommendation
      return this.getRecommendation(context);
    }
  }

  /**
   * Parse user intent from chat input
   */
  parseUserIntent(input) {
    const lowerInput = input.toLowerCase();

    // Check for specific song request
    const songPatterns = [
      /(?:播放|放|听|来首|来一首)\s*[《"]?(.*?)[》"]?$/,
      /(?:想听|要听)\s*[《"]?(.*?)[》"]?$/
    ];

    for (const pattern of songPatterns) {
      const match = input.match(pattern);
      if (match && match[1]) {
        return { type: 'specific_song', songName: match[1].trim() };
      }
    }

    // Check for style/mood request
    const styleKeywords = {
      '爵士': 'jazz', 'jazz': 'jazz',
      '钢琴': 'piano', 'piano': 'piano',
      '轻音乐': 'light', '轻': 'light',
      '流行': 'pop', 'pop': 'pop',
      '摇滚': 'rock', 'rock': 'rock',
      '古典': 'classical', 'classical': 'classical',
      '电子': 'electronic', 'electronic': 'electronic'
    };

    for (const [keyword, style] of Object.entries(styleKeywords)) {
      if (lowerInput.includes(keyword)) {
        return { type: 'style_request', style };
      }
    }

    // Check for artist request
    const artistPattern = /(?:歌手|艺人|artist)\s*[是:]?\s*(.+)/;
    const artistMatch = input.match(artistPattern);
    if (artistMatch) {
      return { type: 'artist_request', artist: artistMatch[1].trim() };
    }

    return { type: 'general' };
  }

  /**
   * Recommend specific song by name
   */
  async recommendSpecificSong(songName) {
    try {
      const songs = await this.searchAndFilter(songName, 3);
      if (songs.length > 0) {
        return {
          song: songs[0],
          reason: `为你找到 ${songName}`,
          source: 'specific_request'
        };
      }
    } catch (error) {
      console.error('[Recommendation] Specific song search failed:', error);
    }

    return null;
  }

  /**
   * Recommend by style
   */
  async recommendByStyle(style, context = {}) {
    // Map English style names to Chinese for local library search
    const styleMapping = {
      'jazz': '爵士',
      'piano': '钢琴',
      'light': '轻音乐',
      'pop': '流行',
      'folk': '民谣',
      'rock': '摇滚',
      'classical': '古典',
      'electronic': '电子'
    };

    const chineseStyle = styleMapping[style] || style;
    
    // First try searching by Chinese style name in local library
    try {
      const songs = await this.searchLocalLibrary(chineseStyle, 10);
      // Filter out played songs
      const unplayedSongs = songs.filter(song => !this.playedSongs.has(song.id));
      if (unplayedSongs.length > 0) {
        const song = unplayedSongs[Math.floor(Math.random() * unplayedSongs.length)];
        return {
          song,
          reason: `一首${chineseStyle}风格的歌曲，希望符合你的口味`,
          source: 'style_match'
        };
      } else if (songs.length > 0) {
        // All songs played, pick random one
        const song = songs[Math.floor(Math.random() * songs.length)];
        return {
          song,
          reason: `一首${chineseStyle}风格的歌曲，希望符合你的口味`,
          source: 'style_match'
        };
      }
    } catch (error) {
      console.error('[Recommendation] Style search failed:', error);
    }

    // Fallback to external search with multiple queries
    const styleQueries = {
      'jazz': ['爵士', 'jazz'],
      'piano': ['钢琴', 'piano'],
      'light': ['轻音乐', '纯音乐'],
      'pop': ['流行', 'pop'],
      'folk': ['民谣', 'folk']
    };

    const queries = styleQueries[style] || [style];
    
    for (const query of queries) {
      try {
        const songs = await this.searchAndFilter(query, 5);
        // Filter out played songs
        const unplayedSongs = songs.filter(song => !this.playedSongs.has(song.id));
        if (unplayedSongs.length > 0) {
          return {
            song: unplayedSongs[0],
            reason: `一首${chineseStyle}风格的歌曲，希望符合你的口味`,
            source: 'style_match'
          };
        } else if (songs.length > 0) {
          return {
            song: songs[0],
            reason: `一首${chineseStyle}风格的歌曲，希望符合你的口味`,
            source: 'style_match'
          };
        }
      } catch (error) {
        console.error('[Recommendation] Style search failed:', error);
      }
    }

    return null;
  }

  /**
   * Recommend by artist
   */
  async recommendByArtist(artist) {
    try {
      const songs = await this.searchAndFilter(artist, 5);
      if (songs.length > 0) {
        // Pick a random song from this artist
        const song = songs[Math.floor(Math.random() * songs.length)];
        return {
          song,
          reason: `来自 ${artist} 的 ${song.name}`,
          source: 'artist_match'
        };
      }
    } catch (error) {
      console.error('[Recommendation] Artist search failed:', error);
    }

    return null;
  }

  /**
   * Exploration mode: Recommend songs from new/unexplored styles
   * Helps users discover new music types
   */
  async recommendExploration(context = {}) {
    const userPrefs = await this.userProfile.getPreferences();
    
    // Define style categories for exploration
    const allStyles = [
      '爵士', '古典', '钢琴', '轻音乐', '民谣', '摇滚', '流行', '电子'
    ];
    
    // Filter out styles user already prefers (to encourage exploration)
    const unexploredStyles = allStyles.filter(style => 
      !userPrefs.preferredStyles?.includes(style)
    );
    
    // If all styles explored, pick a random one
    const targetStyles = unexploredStyles.length > 0 
      ? unexploredStyles 
      : allStyles;
    
    const targetStyle = targetStyles[Math.floor(Math.random() * targetStyles.length)];
    
    // Try to find songs from this style
    try {
      const songs = await this.searchAndFilter(`${targetStyle} 中文`, 5);
      if (songs.length > 0) {
        const song = songs[0];
        return {
          song,
          reason: `探索一下${targetStyle}音乐，发现新的音乐世界`,
          source: 'exploration',
          styleExplored: targetStyle
        };
      }
    } catch (error) {
      console.error('[Recommendation] Exploration search failed:', error);
    }
    
    return null;
  }

  /**
   * Similar songs recommendation based on a seed song
   */
  async recommendSimilarTo(seedSong, count = 3) {
    const songs = [];
    
    // Try to find songs by the same artist
    if (seedSong.artist) {
      try {
        const artistSongs = await this.searchAndFilter(seedSong.artist, count + 1);
        const filtered = artistSongs.filter(s => s.id !== seedSong.id);
        songs.push(...filtered.slice(0, count));
      } catch (error) {
        console.error('[Recommendation] Artist search failed:', error);
      }
    }
    
    // Try to find songs from the same style/album
    if (seedSong.album && songs.length < count) {
      try {
        const albumSongs = await this.searchAndFilter(seedSong.album, count);
        albumSongs
          .filter(s => s.id !== seedSong.id && !songs.some(existing => existing.id === s.id))
          .slice(0, count - songs.length)
          .forEach(s => songs.push(s));
      } catch (error) {
        console.error('[Recommendation] Album search failed:', error);
      }
    }
    
    if (songs.length > 0) {
      return songs.map(song => ({
        song,
        reason: `和${seedSong.name}风格相似的歌曲`,
        source: 'similar'
      }));
    }
    
    return [];
  }

  /**
   * Time-based contextual recommendation
   * Special recommendations for different time contexts (work breaks, meals, commute, etc.)
   */
  async recommendByTimeContext(context = {}) {
    const hour = new Date().getHours();
    const dayOfWeek = new Date().getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    
    // Define time contexts
    const timeContexts = {
      earlyMorning: { start: 5, end: 7, keywords: ['清晨', '轻快', '提神'], description: '清晨' },
      morning: { start: 7, end: 10, keywords: ['上班', '工作', '专注'], description: '上午' },
      midday: { start: 11, end: 13, keywords: ['午餐', '休息', '轻松'], description: '中午' },
      afternoon: { start: 13, end: 17, keywords: ['下午', '工作', '专注'], description: '下午' },
      lateAfternoon: { start: 17, end: 19, keywords: ['傍晚', '放松', '轻音乐'], description: '傍晚' },
      evening: { start: 19, end: 21, keywords: ['晚餐', '放松', '爵士'], description: '晚上' },
      night: { start: 21, end: 23, keywords: ['深夜', '安静', '钢琴'], description: '深夜' },
      lateNight: { start: 23, end: 5, keywords: ['深夜', '轻音乐', '助眠'], description: '深夜' }
    };
    
    // Find current time context
    let currentContext = null;
    for (const [name, ctx] of Object.entries(timeContexts)) {
      if (hour >= ctx.start && hour < ctx.end) {
        currentContext = ctx;
        break;
      }
    }
    
    if (!currentContext) {
      currentContext = timeContexts.evening;
    }
    
    // Weekend vs weekday adjustments
    const weekendBoost = isWeekend ? ['轻松', '度假', '旅行'] : [];
    const allKeywords = [...currentContext.keywords, ...weekendBoost];
    
    // Try each keyword
    for (const keyword of allKeywords) {
      try {
        const songs = await this.searchAndFilter(`${keyword} 中文`, 3);
        if (songs.length > 0) {
          return {
            song: songs[0],
            reason: `${currentContext.description}时分，一首${keyword}的音乐很适合`,
            source: 'time_context',
            context: currentContext.description
          };
        }
      } catch (error) {
        console.error('[Recommendation] Time context search failed:', error);
      }
    }
    
    return null;
  }

  /**
   * Get personalized daily mix recommendation
   * Creates a balanced playlist with variety
   */
  async getDailyMix(count = 5, context = {}) {
    const recommendations = [];
    
    // Define mix structure: [time_context, style_variety, exploration]
    const mixStructure = [
      { type: 'time_context', weight: 0.3 },
      { type: 'scene', weight: 0.4 },
      { type: 'exploration', weight: 0.3 }
    ];
    
    for (let i = 0; i < count; i++) {
      // Determine recommendation type based on position in mix
      const structureIndex = Math.min(i, mixStructure.length - 1);
      const recType = mixStructure[structureIndex].type;
      
      let rec = null;
      
      switch (recType) {
        case 'time_context':
          rec = await this.recommendByTimeContext(context);
          break;
        case 'exploration':
          rec = await this.recommendExploration(context);
          break;
        default:
          rec = await this.getRecommendation(context);
      }
      
      if (rec && rec.song) {
        recommendations.push(rec);
        this.addToRecentRecs(rec.song);
      }
    }
    
    return recommendations;
  }
}

module.exports = { RecommendationEngine };
