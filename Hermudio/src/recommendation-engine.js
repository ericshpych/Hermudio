/**
 * AI Recommendation Engine for Hermudio
 * 
 * Core responsibilities:
 * 1. Scene-based music recommendation (time, weather, mood)
 * 2. User preference learning and matching
 * 3. Multi-strategy song matching
 * 4. Fallback recommendation chains
 * 5. Daily play tracking to avoid repeats
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
    this.playedSongs = new Set(); // Track played song IDs to avoid repeats in current session
    this.dailyPlayedSongs = new Set(); // Track daily played songs from database
    this.todayDate = this.getTodayDate();
    this.dailyPlaysLoaded = false;
    
    // 【优化】日志重复打印控制标志
    this._hasLoggedSceneInfo = false;
    this._hasLoggedUserPrefs = false;
    
    // Load today's played songs from database (async)
    this.loadDailyPlayedSongs().then(() => {
      this.dailyPlaysLoaded = true;
    });
  }

  /**
   * Get today's date string (YYYY-MM-DD)
   */
  getTodayDate() {
    return new Date().toISOString().split('T')[0];
  }

  /**
   * Get detailed time period for better scene matching
   */
  getDetailedTimePeriod() {
    const hour = new Date().getHours();

    if (hour >= 0 && hour < 5) return 'night';        // 凌晨
    if (hour >= 5 && hour < 7) return 'early_morning'; // 清晨
    if (hour >= 7 && hour < 9) return 'morning';     // 早晨
    if (hour >= 9 && hour < 12) return 'forenoon';    // 上午
    if (hour >= 12 && hour < 14) return 'noon';       // 中午
    if (hour >= 14 && hour < 17) return 'afternoon';  // 下午
    if (hour >= 17 && hour < 19) return 'evening';    // 傍晚
    if (hour >= 19 && hour < 22) return 'night';      // 晚上
    return 'late_night';                               // 深夜
  }

  /**
   * Infer mood from time and weather
   */
  inferMood(scene) {
    const { timeOfDay, weather, hour } = scene;

    // Base mood mapping
    const moodMap = {
      'early_morning': ['peaceful', 'relaxed', 'focused'],
      'morning': ['energetic', 'happy', 'focused'],
      'forenoon': ['focused', 'energetic'],
      'noon': ['relaxed', 'peaceful'],
      'afternoon': ['focused', 'relaxed'],
      'evening': ['happy', 'relaxed', 'peaceful'],
      'night': ['peaceful', 'melancholy', 'relaxed'],
      'late_night': ['melancholy', 'peaceful']
    };

    // Weather influence on mood
    if (weather === 'rainy' || weather === 'snowy') {
      moodMap['afternoon'] = ['relaxed', 'melancholy'];
      moodMap['evening'] = ['peaceful', 'melancholy'];
    }

    const possibleMoods = moodMap[timeOfDay] || ['relaxed'];
    return possibleMoods[Math.floor(Math.random() * possibleMoods.length)];
  }

  /**
   * Load today's played songs from database
   */
  loadDailyPlayedSongs() {
    return new Promise((resolve, reject) => {
      try {
        const today = this.getTodayDate();
        this.db.all('SELECT song_id FROM daily_plays WHERE play_date = ?', [today], (err, rows) => {
          if (err) {
            console.error('[Recommendation] Failed to load daily played songs:', err);
            this.dailyPlayedSongs = new Set();
            resolve();
            return;
          }
          this.dailyPlayedSongs = new Set(rows.map(row => row.song_id));
          console.log('[Recommendation] Loaded daily played songs:', this.dailyPlayedSongs.size);
          resolve();
        });
      } catch (error) {
        console.error('[Recommendation] Failed to load daily played songs:', error);
        this.dailyPlayedSongs = new Set();
        resolve();
      }
    });
  }

  /**
   * Mark a song as played (both in-memory and database)
   */
  markSongAsPlayed(songId) {
    if (!songId) return;
    
    // Check if date has changed
    const currentDate = this.getTodayDate();
    if (currentDate !== this.todayDate) {
      console.log('[Recommendation] Date changed, clearing daily played songs');
      this.todayDate = currentDate;
      this.dailyPlayedSongs.clear();
      this.playedSongs.clear();
    }
    
    // Add to in-memory set
    this.playedSongs.add(songId);
    
    // Add to daily set
    this.dailyPlayedSongs.add(songId);
    
    // Save to database using sqlite3 async API
    const sql = `
      INSERT INTO daily_plays (song_id, play_date, play_count)
      VALUES (?, ?, 1)
      ON CONFLICT(song_id, play_date) DO UPDATE SET
        play_count = play_count + 1,
        updated_at = CURRENT_TIMESTAMP
    `;
    
    this.db.run(sql, [songId, this.todayDate], (err) => {
      if (err) {
        console.error('[Recommendation] Failed to save daily play:', err);
      } else {
        console.log('[Recommendation] Marked song as played:', songId, 'Total played today:', this.dailyPlayedSongs.size);
      }
    });
    
    // If played songs exceed 50, clear half of them to allow rediscovery
    if (this.playedSongs.size > 50) {
      const songsArray = Array.from(this.playedSongs);
      const halfLength = Math.floor(songsArray.length / 2);
      this.playedSongs = new Set(songsArray.slice(halfLength));
      console.log('[Recommendation] Cleared old played songs, remaining:', this.playedSongs.size);
    }
  }

  /**
   * Check if a song has been played today
   */
  async isSongPlayedToday(songId) {
    // Check if date has changed
    const currentDate = this.getTodayDate();
    if (currentDate !== this.todayDate) {
      this.todayDate = currentDate;
      this.dailyPlayedSongs.clear();
      await this.loadDailyPlayedSongs();
    }
    
    return this.dailyPlayedSongs.has(songId) || this.playedSongs.has(songId);
  }

  /**
   * Clear played songs history
   */
  clearPlayedSongs() {
    this.playedSongs.clear();
    this.dailyPlayedSongs.clear();
    console.log('[Recommendation] Cleared played songs history');
  }

  /**
   * Get multiple unique recommendations for a playlist
   */
  async getRecommendations(count = 5, context = {}) {
    console.log('[Recommendation] getRecommendations called with context:', {
      hasScene: !!context.scene,
      sceneTime: context.scene?.timeOfDay,
      sceneWeather: context.scene?.weather,
      sceneHour: context.scene?.hour
    });
    
    const recommendations = [];
    const maxAttempts = count * 10; // Allow extra attempts to find unique songs
    let attempts = 0;
    let allowPlayedSongs = false; // After many attempts, allow played songs
    const startTime = Date.now();
    const maxDuration = 45000; // Maximum 45 seconds for recommendations (increased from 30s)

    while (recommendations.length < count && attempts < maxAttempts) {
      // Check if we've exceeded max duration
      if (Date.now() - startTime > maxDuration) {
        console.warn('[Recommendation] Timeout: exceeded 30 seconds, returning', recommendations.length, 'songs');
        break;
      }

      attempts++;
      
      // Add timeout to individual getRecommendation call
      let rec;
      try {
        rec = await Promise.race([
          this.getRecommendation(context),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('getRecommendation timeout')), 10000)
          )
        ]);
      } catch (error) {
        console.error('[Recommendation] getRecommendation failed or timed out:', error.message);
        rec = null;
      }
      
      if (rec && rec.song) {
        // Check if this song is already in the current playlist
        const isInCurrentPlaylist = recommendations.some(r => r.song.id === rec.song.id);
        
        // Check if this song has been played today (only if we haven't exhausted options)
        let isPlayedToday = false;
        try {
          isPlayedToday = !allowPlayedSongs && await Promise.race([
            this.isSongPlayedToday(rec.song.id),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('isSongPlayedToday timeout')), 5000)
            )
          ]);
        } catch (error) {
          console.error('[Recommendation] isSongPlayedToday failed:', error.message);
          isPlayedToday = false;
        }
        
        if (!isInCurrentPlaylist && !isPlayedToday) {
          recommendations.push(rec);
          console.log('[Recommendation] Added unique song:', rec.song.name, '-', rec.song.artist);
        } else {
          if (isInCurrentPlaylist) {
            console.log('[Recommendation] Skipped duplicate in playlist:', rec.song.name);
          } else if (isPlayedToday) {
            console.log('[Recommendation] Skipped song played today:', rec.song.name);
          }
        }
        
        // If we've tried many times and still don't have enough songs, allow played songs
        // 【调整】更早允许已播放的歌曲，避免超时
        if (attempts > count * 3 && recommendations.length < count) {
          if (!allowPlayedSongs) {
            allowPlayedSongs = true;
            console.log('[Recommendation] Allowing played songs after', attempts, 'attempts');
          }
        }
      }
    }

    console.log('[Recommendation] Generated', recommendations.length, 'unique recommendations after', attempts, 'attempts');
    return recommendations;
  }

  /**
   * Get personalized recommendation based on current context
   */
  async getRecommendation(context = {}) {
    // 优先使用传入的 scene，避免重复获取导致不一致
    let scene = context.scene;
    if (!scene) {
      console.log('[Recommendation] No scene in context, fetching fresh scene...');
      scene = await getCurrentScene();
    }
    const userPrefs = await this.userProfile.getPreferences();
    
    // 获取被屏蔽的歌曲列表（从前端传入）
    const blockedSongs = context.blockedSongs || [];
    if (blockedSongs.length > 0) {
      console.log('[Recommendation] Blocked songs from user:', blockedSongs.length);
    }
    
    // 【优化】只在第一次调用时打印完整的用户偏好日志
    if (!this._hasLoggedUserPrefs) {
      this._hasLoggedUserPrefs = true;
      console.log('[Recommendation] Current scene:', scene);
      console.log('[Recommendation] User preferences:', {
        preferredStyles: userPrefs.preferredStyles,
        preferredArtists: userPrefs.preferredArtists,
        dislikedStyles: userPrefs.dislikedStyles,
        playHistoryCount: userPrefs.playHistory?.length || 0,
        favoriteTimes: userPrefs.favoriteTimes
      });
    }

    // Try multiple strategies in order
    // Note: External search is prioritized to ensure we get real songs with encryptedId
    const strategies = [
      // Strategy 1: AI-generated search queries based on scene (external search)
      () => this.recommendBySceneKeywords(scene, userPrefs, blockedSongs),
      
      // Strategy 2: Popular songs in preferred styles (external search)
      () => this.recommendPopularInStyles(userPrefs, blockedSongs),
      
      // Strategy 3: Match from local library based on scene
      () => this.recommendFromLibrary(scene, userPrefs, blockedSongs),
      
      // Strategy 4: Fallback to time-based defaults
      () => this.recommendDefaults(scene, blockedSongs)
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
  async recommendFromLibrary(scene, userPrefs, blockedSongs = []) {
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
      query += ' ORDER BY play_count DESC, RANDOM() LIMIT 10';

      this.db.all(query, params, async (err, rows) => {
        if (err) {
          reject(err);
          return;
        }

        // Filter out blocked songs
        let filteredRows = rows;
        if (blockedSongs && blockedSongs.length > 0) {
          const blockedSet = new Set(blockedSongs.map(id => id.toString()));
          filteredRows = rows.filter(row => !blockedSet.has(row.song_id.toString()));
        }

        if (filteredRows && filteredRows.length > 0) {
          const song = filteredRows[0];
          resolve({
            song: {
              id: song.song_id,
              encryptedId: song.song_id,
              name: song.song_name,
              artist: song.artist,
              album: song.album
            },
            reason: this.generateReason(scene, song, 'library'),
            source: 'local_library'
          });
        } else {
          // Local library is empty or all songs blocked, fall back to external search
          console.log('[Recommendation] Local library empty or all blocked, falling back to external search');
          try {
            const searchQueries = this.generateSearchQueries(scene, userPrefs);
            for (const query of searchQueries) {
              // Use searchAndFilter to ensure we only get playable songs
              let songs = await this.searchAndFilter(query, 5);
              
              // Filter out blocked songs
              if (blockedSongs && blockedSongs.length > 0) {
                const blockedSet = new Set(blockedSongs.map(id => id.toString()));
                songs = songs.filter(s => !blockedSet.has(s.id.toString()));
              }
              
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
   * Recommend by scene-based keywords (enhanced with detailed time period and mood)
   */
  async recommendBySceneKeywords(scene, userPrefs, blockedSongs = []) {
    // Build scene-based search keywords with more granularity
    const timeKeywords = {
      'early_morning': ['轻柔', '清新', '晨间', '放松', '瑜伽', '冥想'],
      'morning': ['轻快', '活力', '积极', '励志', '阳光', '元气'],
      'forenoon': ['专注', '工作', '学习', '轻音乐', '古典', '爵士'],
      'noon': ['轻松', '休闲', '午餐', '流行', '轻快', '愉悦'],
      'afternoon': ['下午茶', '慵懒', '爵士', '民谣', '咖啡', '文艺'],
      'evening': ['浪漫', '温馨', '夕阳', '散步', '怀旧', '抒情'],
      'night': ['夜晚', '星空', '宁静', '安眠', '放松', '温柔'],
      'late_night': ['深夜', '思考', '孤独', '情感', '抒情', '安静']
    };

    // Weather-based keywords
    const weatherKeywords = {
      'sunny': ['阳光', '温暖', '快乐', '活力', '晴天'],
      'cloudy': ['文艺', '清新', '民谣', '轻音乐', '抒情'],
      'rainy': ['雨天', '浪漫', '咖啡', '怀旧', '文艺', '思绪'],
      'snowy': ['雪天', '温暖', '浪漫', '圣诞', '温馨', '冬天']
    };

    // Get detailed time period
    const detailedTime = this.getDetailedTimePeriod();
    const mood = this.inferMood(scene);

    // 【优化】只在第一次调用时打印完整的场景日志
    if (!this._hasLoggedSceneInfo) {
      this._hasLoggedSceneInfo = true;
      console.log('[Recommendation] ==========================================');
      console.log('[Recommendation] Scene-based recommendation triggered');
      console.log('[Recommendation] Time:', scene.timeOfDay, '| Hour:', scene.hour, '| Detailed:', detailedTime);
      console.log('[Recommendation] Weather:', scene.weather, '| Mood:', mood);
      console.log('[Recommendation] ==========================================');
    }

    // Get base keywords from time
    const timeKw = timeKeywords[detailedTime] || ['流行', '轻音乐'];

    // Get weather keywords
    const weatherKw = weatherKeywords[scene.weather] || ['流行', '轻音乐'];

    // Combine and add user preference keywords
    let allKeywords = [...timeKw, ...weatherKw];

    // Add user preferred styles if available
    if (userPrefs.preferredStyles && userPrefs.preferredStyles.length > 0) {
      const topStyles = userPrefs.preferredStyles.slice(0, 3);
      allKeywords = [...allKeywords, ...topStyles];
    }

    // Randomly select keywords to add variety
    const numKeywords = Math.min(2, allKeywords.length);
    const shuffled = allKeywords.sort(() => 0.5 - Math.random());
    const selectedKeywords = shuffled.slice(0, numKeywords);

    // Construct search query with mood and scene context
    const moodContext = {
      'peaceful': '平静',
      'relaxed': '轻松',
      'energetic': '活力',
      'happy': '快乐',
      'focused': '专注',
      'melancholy': '情感'
    };

    const searchQuery = `${selectedKeywords.join(' ')} ${moodContext[mood] || ''}`.trim();

    console.log('[Recommendation] Searching with query:', searchQuery);

    // Search with the generated query
    const songs = await this.musicService.searchSongs(searchQuery, 8);

    if (songs && songs.length > 0) {
      // Step 1: Apply user excluded styles filter (from disliked_styles)
      let filteredSongs = this.filterByDislikedStyles(songs, userPrefs.dislikedStyles);

      // Step 2: Filter out VIP-restricted songs
      filteredSongs = filteredSongs.filter(s => s.canPlay);

      // Step 3: Filter out blocked songs
      if (blockedSongs && blockedSongs.length > 0) {
        const blockedSet = new Set(blockedSongs.map(id => id.toString()));
        const beforeCount = filteredSongs.length;
        filteredSongs = filteredSongs.filter(s => !blockedSet.has(s.id.toString()));
        if (beforeCount > filteredSongs.length) {
          console.log('[Recommendation] Filtered out', beforeCount - filteredSongs.length, 'blocked songs');
        }
      }

      // Step 4: Prioritize songs by preferred artists
      if (userPrefs.preferredArtists && userPrefs.preferredArtists.length > 0) {
        const preferredArtistsLower = userPrefs.preferredArtists.map(a => a.toLowerCase());
        const preferredSongs = filteredSongs.filter(s =>
          preferredArtistsLower.some(pa => s.artist && s.artist.toLowerCase().includes(pa))
        );
        if (preferredSongs.length > 0) {
          // Pick random from preferred artists
          const selected = preferredSongs[Math.floor(Math.random() * preferredSongs.length)];
          console.log('[Recommendation] Selected from preferred artists:', selected.name, '-', selected.artist);
          return {
            song: selected,
            reason: this.generateReason(scene, selected, 'scene'),
            source: 'scene_keywords',
            searchQuery: searchQuery
          };
        }
      }

      // Fallback: pick random from filtered results
      if (filteredSongs.length > 0) {
        const selected = filteredSongs[Math.floor(Math.random() * filteredSongs.length)];
        console.log('[Recommendation] Selected from scene keywords:', selected.name);
        return {
          song: selected,
          reason: this.generateReason(scene, selected, 'scene'),
          source: 'scene_keywords',
          searchQuery: searchQuery
        };
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
      '嘻哈', 'hiphop', 'hip-hop', '说唱', 'rap', '饶舌',
      '儿童', '婴幼儿', 'children', 'kids', '幼儿'
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
   * Filter songs by user's disliked styles (from database preferences)
   * Combines built-in exclusions with user-specified disliked styles
   */
  filterByDislikedStyles(songs, dislikedStyles = []) {
    // Combine built-in exclusions with user disliked styles
    const userDislikedPatterns = (dislikedStyles || []).map(s => s.toLowerCase());
    const builtinExclusions = [
      '虫', '昆虫', '虫子', '虫鸣', '虫叫',
      '白噪音', '白噪声', 'white noise', 'noise',
      '电子', 'electronic', 'edm', '电音',
      '嘻哈', 'hiphop', 'hip-hop', '说唱', 'rap', '饶舌',
      '儿童', '婴幼儿', 'children', 'kids', '幼儿'
    ];
    const allExclusions = [...new Set([...builtinExclusions, ...userDislikedPatterns])];

    return songs.filter(song => {
      const searchText = `${song.name} ${song.artist} ${song.album || ''}`.toLowerCase();
      const isExcluded = allExclusions.some(pattern =>
        searchText.includes(pattern)
      );

      if (isExcluded) {
        console.log('[Recommendation] Filtered by disliked styles:', song.name, '-', song.artist);
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
          encryptedId: row.song_id, // 本地库使用 song_id 作为 encryptedId
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
  async recommendPopularInStyles(userPrefs, blockedSongs = []) {
    if (!userPrefs.preferredStyles || userPrefs.preferredStyles.length === 0) {
      return null;
    }

    // Pick a random preferred style
    const style = userPrefs.preferredStyles[Math.floor(Math.random() * userPrefs.preferredStyles.length)];
    
    try {
      let songs = await this.searchAndFilter(`${style} 热门`, 5);
      
      // Filter out blocked songs
      if (blockedSongs && blockedSongs.length > 0) {
        const blockedSet = new Set(blockedSongs.map(id => id.toString()));
        songs = songs.filter(s => !blockedSet.has(s.id.toString()));
      }
      
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
  async recommendDefaults(scene, blockedSongs = []) {
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
      let songs = await this.searchAndFilter(defaultConfig.keyword, 5);

      // Filter out blocked songs
      if (blockedSongs && blockedSongs.length > 0) {
        const blockedSet = new Set(blockedSongs.map(id => id.toString()));
        songs = songs.filter(s => !blockedSet.has(s.id.toString()));
      }

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
   * 【修改】优先推荐用户喜欢的歌手
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

    // 【新增】获取用户偏好
    const userPrefs = await this.userProfile.getPreferences();
    const blockedSongs = context.blockedSongs || [];
    const blockedSet = new Set(blockedSongs.map(id => id.toString()));

    // 【新增】Step 1: 优先搜索用户喜欢的歌手 + 风格
    if (userPrefs.preferredArtists && userPrefs.preferredArtists.length > 0) {
      // 随机选择一个喜欢的歌手
      const randomArtist = userPrefs.preferredArtists[Math.floor(Math.random() * userPrefs.preferredArtists.length)];
      console.log('[Recommendation] Trying preferred artist:', randomArtist, '+ style:', chineseStyle);

      try {
        const songs = await this.searchAndFilter(`${randomArtist} ${chineseStyle}`, 5);
        // 过滤已播放和被屏蔽的歌曲
        const unplayedSongs = songs.filter(song =>
          !this.playedSongs.has(song.id) && !blockedSet.has(song.id.toString())
        );

        if (unplayedSongs.length > 0) {
          const selected = unplayedSongs[Math.floor(Math.random() * unplayedSongs.length)];
          console.log('[Recommendation] Selected from preferred artist:', selected.name, '-', selected.artist);
          return {
            song: selected,
            reason: `来自你喜欢的歌手 ${selected.artist} 的${chineseStyle}歌曲`,
            source: 'preferred_artist_style'
          };
        }
      } catch (error) {
        console.log('[Recommendation] Preferred artist search failed:', error.message);
      }
    }

    // Step 2: 搜索风格（本地库）
    try {
      const songs = await this.searchLocalLibrary(chineseStyle, 10);
      // 过滤已播放和被屏蔽的歌曲
      const unplayedSongs = songs.filter(song =>
        !this.playedSongs.has(song.id) && !blockedSet.has(song.id.toString())
      );

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

    // Step 3: 外部搜索
    const styleQueries = {
      'jazz': ['爵士', 'jazz'],
      'piano': ['钢琴', 'piano'],
      'light': ['轻音乐', '纯音乐'],
      'pop': ['流行', '华语流行'],
      'folk': ['民谣', 'folk']
    };

    const queries = styleQueries[style] || [style];

    for (const query of queries) {
      try {
        let songs = await this.searchAndFilter(query, 8);

        // 过滤被屏蔽的歌曲
        if (blockedSongs && blockedSongs.length > 0) {
          songs = songs.filter(s => !blockedSet.has(s.id.toString()));
        }

        // 【新增】优先选择用户喜欢的歌手
        if (userPrefs.preferredArtists && userPrefs.preferredArtists.length > 0) {
          const preferredArtistsLower = userPrefs.preferredArtists.map(a => a.toLowerCase());
          const preferredSongs = songs.filter(s =>
            !this.playedSongs.has(s.id) &&
            preferredArtistsLower.some(pa => s.artist && s.artist.toLowerCase().includes(pa))
          );

          if (preferredSongs.length > 0) {
            const selected = preferredSongs[Math.floor(Math.random() * preferredSongs.length)];
            console.log('[Recommendation] Selected preferred artist from external:', selected.name, '-', selected.artist);
            return {
              song: selected,
              reason: `来自你喜欢的歌手 ${selected.artist}`,
              source: 'preferred_artist_external'
            };
          }
        }

        // 过滤已播放的歌曲
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
}

module.exports = { RecommendationEngine };
