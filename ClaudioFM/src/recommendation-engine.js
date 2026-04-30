/**
 * AI Recommendation Engine for Hermudio
 * 
 * Core responsibilities:
 * 1. Scene-based music recommendation (time, weather, mood)
 * 2. User preference learning and matching
 * 3. Multi-strategy song matching
 * 4. Fallback recommendation chains
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
   * Generate search queries based on current scene
   */
  generateSearchQueries(scene, userPrefs) {
    const queries = [];
    const { timeOfDay, weather, mood } = scene;

    // Time-based queries
    const timeQueries = {
      morning: ['早安 轻快', '早晨 活力', 'morning upbeat', '早餐音乐'],
      afternoon: ['午后 放松', '下午茶 音乐', 'afternoon chill'],
      evening: ['傍晚 温柔', '晚餐 爵士', 'evening jazz'],
      night: ['深夜 安静', 'night piano', '午夜 治愈', 'sleep music']
    };

    if (timeQueries[timeOfDay]) {
      queries.push(...timeQueries[timeOfDay]);
    }

    // Weather-based queries
    const weatherQueries = {
      rainy: ['雨天 钢琴', 'rainy jazz', '雨声 治愈', '下雨 安静'],
      sunny: ['晴天 轻快', 'sunny pop', '阳光 活力'],
      cloudy: ['阴天 慵懒', 'cloudy lofi', '多云 舒缓']
    };

    if (weatherQueries[weather]) {
      queries.push(...weatherQueries[weather]);
    }

    // Mood-based queries
    const moodQueries = {
      happy: ['开心 流行', 'happy pop', ' upbeat'],
      relaxed: ['放松 轻音乐', 'relax piano', 'chill'],
      focused: ['专注 纯音乐', 'focus ambient', 'work music'],
      melancholy: ['治愈 安静', 'healing music', 'sad piano']
    };

    if (moodQueries[mood]) {
      queries.push(...moodQueries[mood]);
    }

    // Add user preferred styles
    if (userPrefs.preferredStyles) {
      userPrefs.preferredStyles.forEach(style => {
        queries.push(style);
        queries.push(`${style} ${timeOfDay === 'night' ? '安静' : '推荐'}`);
      });
    }

    // Shuffle and return unique queries
    return [...new Set(queries)].sort(() => Math.random() - 0.5);
  }

  /**
   * Search songs and filter by play permission
   * Prioritize external search to get real songs with encryptedId
   */
  async searchAndFilter(keyword, limit = 5) {
    // First, try external music service to get real songs with encryptedId
    try {
      const results = await this.musicService.searchSongs(keyword, limit);
      const playableResults = results.filter(song => song.canPlay !== false);
      if (playableResults.length > 0) {
        return playableResults;
      }
    } catch (error) {
      console.log('[Recommendation] External search failed, falling back to local library');
    }

    // If no external results, search in local library
    const localResults = await this.searchLocalLibrary(keyword, limit);
    if (localResults.length > 0) {
      return localResults;
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
   */
  async recommendDefaults(scene) {
    const defaults = {
      morning: { name: '早安', artist: '轻音乐', keyword: '早安 轻音乐' },
      afternoon: { name: '午后', artist: '钢琴曲', keyword: '午后 钢琴' },
      evening: { name: '傍晚', artist: '爵士乐', keyword: 'evening jazz' },
      night: { name: '夜曲', artist: '纯音乐', keyword: 'night piano' }
    };

    const defaultSong = defaults[scene.timeOfDay] || defaults.night;
    
    try {
      const songs = await this.searchAndFilter(defaultSong.keyword, 1);
      if (songs.length > 0) {
        return {
          song: songs[0],
          reason: `深夜时分，一首${defaultSong.artist}很适合现在的氛围`,
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
      const songs = await this.searchLocalLibrary(chineseStyle, 5);
      if (songs.length > 0) {
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
        const songs = await this.searchAndFilter(query, 3);
        if (songs.length > 0) {
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
}

module.exports = { RecommendationEngine };
