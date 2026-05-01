/**
 * User Profile Service for Hermudio
 * 
 * Manages user preferences and learning from interactions
 * Enhanced with detailed preference analysis and learning
 */

class UserProfile {
  constructor(db) {
    this.db = db;
    this.cache = new Map();
    
    // Analysis cache
    this.analysisCache = new Map();
    this.analysisCacheExpiry = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Get user preferences
   */
  async getPreferences(userId = 'default') {
    if (this.cache.has(userId)) {
      return this.cache.get(userId);
    }

    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM user_profiles WHERE user_id = ?',
        [userId],
        (err, row) => {
          if (err) {
            reject(err);
            return;
          }

          if (row) {
            const prefs = {
              userId: row.user_id,
              preferredStyles: JSON.parse(row.preferred_styles || '[]'),
              preferredArtists: JSON.parse(row.preferred_artists || '[]'),
              dislikedStyles: JSON.parse(row.disliked_styles || '[]'),
              playHistory: JSON.parse(row.play_history || '[]'),
              skipPatterns: JSON.parse(row.skip_patterns || '{}'),
              favoriteTimes: JSON.parse(row.favorite_times || '{}'),
              createdAt: row.created_at,
              updatedAt: row.updated_at
            };
            this.cache.set(userId, prefs);
            resolve(prefs);
          } else {
            const defaults = this.getDefaultPreferences(userId);
            resolve(defaults);
          }
        }
      );
    });
  }

  /**
   * Update user preferences
   */
  async updatePreferences(userId, updates) {
    const prefs = await this.getPreferences(userId);
    const newPrefs = { ...prefs, ...updates, updatedAt: new Date().toISOString() };

    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO user_profiles 
        (user_id, preferred_styles, preferred_artists, disliked_styles, 
         play_history, skip_patterns, favorite_times, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        userId,
        JSON.stringify(newPrefs.preferredStyles),
        JSON.stringify(newPrefs.preferredArtists),
        JSON.stringify(newPrefs.dislikedStyles),
        JSON.stringify(newPrefs.playHistory),
        JSON.stringify(newPrefs.skipPatterns),
        JSON.stringify(newPrefs.favoriteTimes),
        newPrefs.createdAt || new Date().toISOString(),
        newPrefs.updatedAt,
        (err) => {
          if (err) {
            reject(err);
          } else {
            this.cache.set(userId, newPrefs);
            this.invalidateAnalysisCache(userId);
            resolve(newPrefs);
          }
        }
      );

      stmt.finalize();
    });
  }

  /**
   * Record a like/dislike action with detailed tracking
   */
  async recordFeedback(userId, songId, songInfo, action) {
    const prefs = await this.getPreferences(userId);
    
    if (action === 'like') {
      if (songInfo.style && !prefs.preferredStyles.includes(songInfo.style)) {
        prefs.preferredStyles.push(songInfo.style);
      }
      if (songInfo.artist && !prefs.preferredArtists.includes(songInfo.artist)) {
        prefs.preferredArtists.push(songInfo.artist);
      }
    } else if (action === 'dislike') {
      if (songInfo.style && !prefs.dislikedStyles.includes(songInfo.style)) {
        prefs.dislikedStyles.push(songInfo.style);
      }
    }

    await this.saveFeedback(userId, songId, songInfo, action);
    return this.updatePreferences(userId, prefs);
  }

  /**
   * Save feedback to database
   */
  async saveFeedback(userId, songId, songInfo, action) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO user_feedback 
         (user_id, song_id, song_name, artist, action, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, songId, songInfo.name, songInfo.artist, action, new Date().toISOString()],
        (err) => {
          if (err) {
            reject(err);
          } else {
            this.invalidateAnalysisCache(userId);
            resolve();
          }
        }
      );
    });
  }

  /**
   * Record song play with detailed tracking
   */
  async recordPlay(userId, songId, songInfo, completed = false) {
    const prefs = await this.getPreferences(userId);
    
    if (!prefs.playHistory) {
      prefs.playHistory = [];
    }
    
    prefs.playHistory.unshift({
      songId,
      timestamp: new Date().toISOString(),
      completed
    });

    if (prefs.playHistory.length > 100) {
      prefs.playHistory = prefs.playHistory.slice(0, 100);
    }

    const hour = new Date().getHours();
    if (!prefs.favoriteTimes) {
      prefs.favoriteTimes = {};
    }
    prefs.favoriteTimes[hour] = (prefs.favoriteTimes[hour] || 0) + 1;

    return this.updatePreferences(userId, prefs);
  }

  /**
   * Record skip with pattern learning
   */
  async recordSkip(userId, songId, songInfo) {
    const prefs = await this.getPreferences(userId);
    
    if (!prefs.skipPatterns) {
      prefs.skipPatterns = {};
    }

    if (songInfo.artist) {
      const key = `artist:${songInfo.artist}`;
      prefs.skipPatterns[key] = (prefs.skipPatterns[key] || 0) + 1;
    }

    if (songInfo.style) {
      const key = `style:${songInfo.style}`;
      prefs.skipPatterns[key] = (prefs.skipPatterns[key] || 0) + 1;
    }

    return this.updatePreferences(userId, prefs);
  }

  /**
   * Get user's favorite artists based on play history
   */
  async getFavoriteArtists(userId, limit = 10) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT artist, COUNT(*) as play_count 
         FROM user_feedback 
         WHERE user_id = ? AND action = 'like'
         GROUP BY artist 
         ORDER BY play_count DESC 
         LIMIT ?`,
        [userId, limit],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows.map(r => r.artist));
          }
        }
      );
    });
  }

  /**
   * Get comprehensive listening statistics
   */
  async getStats(userId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT 
          COUNT(DISTINCT song_id) as unique_songs,
          COUNT(CASE WHEN action = 'like' THEN 1 END) as likes,
          COUNT(CASE WHEN action = 'dislike' THEN 1 END) as dislikes
         FROM user_feedback 
         WHERE user_id = ?`,
        [userId],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve({
              uniqueSongs: row?.unique_songs || 0,
              likes: row?.likes || 0,
              dislikes: row?.dislikes || 0
            });
          }
        }
      );
    });
  }

  /**
   * Get detailed listening analysis
   */
  async getDetailedAnalysis(userId) {
    // Check cache first
    const cached = this.analysisCache.get(userId);
    if (cached && Date.now() - cached.timestamp < this.analysisCacheExpiry) {
      return cached.data;
    }

    const analysis = {
      listeningPatterns: await this.analyzeListeningPatterns(userId),
      preferredTimeSlots: await this.analyzePreferredTimeSlots(userId),
      styleDistribution: await this.analyzeStyleDistribution(userId),
      artistInsights: await this.analyzeArtistInsights(userId),
      moodCorrelations: await this.analyzeMoodCorrelations(userId)
    };

    this.analysisCache.set(userId, {
      data: analysis,
      timestamp: Date.now()
    });

    return analysis;
  }

  /**
   * Analyze listening patterns (completion rate, skip rate, etc.)
   */
  async analyzeListeningPatterns(userId) {
    const prefs = await this.getPreferences(userId);
    const history = prefs.playHistory || [];
    
    if (history.length === 0) {
      return {
        totalPlays: 0,
        completionRate: 0,
        averageSessionLength: 0,
        mostActiveTime: null
      };
    }

    const completed = history.filter(h => h.completed).length;
    const completionRate = (completed / history.length) * 100;
    
    // Analyze session patterns
    let sessions = 1;
    let maxConsecutive = 1;
    let currentConsecutive = 1;
    
    for (let i = 1; i < history.length; i++) {
      const prevTime = new Date(history[i-1].timestamp).getTime();
      const currTime = new Date(history[i].timestamp).getTime();
      const gap = (prevTime - currTime) / 1000 / 60; // minutes
      
      if (gap < 30) {
        currentConsecutive++;
        maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
      } else {
        sessions++;
        currentConsecutive = 1;
      }
    }

    return {
      totalPlays: history.length,
      completedPlays: completed,
      completionRate: Math.round(completionRate * 10) / 10,
      sessions,
      averageSessionLength: Math.round(history.length / sessions),
      maxConsecutivePlays: maxConsecutive
    };
  }

  /**
   * Analyze preferred listening time slots
   */
  async analyzePreferredTimeSlots(userId) {
    const prefs = await this.getPreferences(userId);
    const favoriteTimes = prefs.favoriteTimes || {};
    
    // Convert to array and sort
    const timeSlots = Object.entries(favoriteTimes)
      .map(([hour, count]) => ({ hour: parseInt(hour), count }))
      .sort((a, b) => b.count - a.count);

    if (timeSlots.length === 0) {
      return {
        preferredSlots: [],
        leastPreferredSlots: [],
        peakHour: null
      };
    }

    const peakHour = timeSlots[0].hour;
    const peakTime = this.getTimeSlotName(peakHour);

    return {
      preferredSlots: timeSlots.slice(0, 3).map(s => ({
        ...s,
        name: this.getTimeSlotName(s.hour)
      })),
      leastPreferredSlots: timeSlots.slice(-3).map(s => ({
        ...s,
        name: this.getTimeSlotName(s.hour)
      })),
      peakHour,
      peakTime,
      distribution: this.getTimeDistribution(favoriteTimes)
    };
  }

  /**
   * Get time slot name from hour
   */
  getTimeSlotName(hour) {
    if (hour >= 5 && hour < 8) return '清晨';
    if (hour >= 8 && hour < 12) return '上午';
    if (hour >= 12 && hour < 14) return '中午';
    if (hour >= 14 && hour < 18) return '下午';
    if (hour >= 18 && hour < 21) return '傍晚';
    if (hour >= 21 && hour < 24) return '夜晚';
    return '深夜';
  }

  /**
   * Get time distribution percentages
   */
  getTimeDistribution(favoriteTimes) {
    const total = Object.values(favoriteTimes).reduce((a, b) => a + b, 0);
    if (total === 0) return {};

    const distribution = {};
    for (const [hour, count] of Object.entries(favoriteTimes)) {
      distribution[this.getTimeSlotName(parseInt(hour))] = 
        Math.round((count / total) * 100);
    }
    return distribution;
  }

  /**
   * Analyze style distribution from feedback
   */
  async analyzeStyleDistribution(userId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT song_name, artist, action, created_at
         FROM user_feedback
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 100`,
        [userId],
        (err, rows) => {
          if (err) {
            reject(err);
            return;
          }

          // Simple keyword-based style inference
          const styleKeywords = {
            '流行': ['流行', 'pop', '热门'],
            '摇滚': ['摇滚', 'rock', '乐队'],
            '爵士': ['爵士', 'jazz', '蓝调'],
            '古典': ['古典', 'classical', '交响'],
            '民谣': ['民谣', 'folk', '吉他'],
            '电子': ['电子', 'electronic', 'edm'],
            '轻音乐': ['轻音乐', '纯音乐', 'instrumental']
          };

          const styleCounts = {};
          
          for (const row of rows) {
            const text = `${row.song_name} ${row.artist}`.toLowerCase();
            for (const [style, keywords] of Object.entries(styleKeywords)) {
              if (keywords.some(kw => text.includes(kw))) {
                styleCounts[style] = (styleCounts[style] || 0) + 1;
              }
            }
          }

          const total = Object.values(styleCounts).reduce((a, b) => a + b, 0) || 1;
          const distribution = {};
          
          for (const [style, count] of Object.entries(styleCounts)) {
            distribution[style] = Math.round((count / total) * 100);
          }

          resolve({
            distribution,
            totalAnalyzed: rows.length,
            topStyles: Object.entries(styleCounts)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 5)
              .map(([style, count]) => ({ style, count, percentage: Math.round((count / total) * 100) }))
          });
        }
      );
    });
  }

  /**
   * Analyze artist insights
   */
  async analyzeArtistInsights(userId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT artist, 
                COUNT(*) as play_count,
                SUM(CASE WHEN action = 'like' THEN 1 ELSE 0 END) as likes,
                SUM(CASE WHEN action = 'dislike' THEN 1 ELSE 0 END) as dislikes
         FROM user_feedback
         WHERE user_id = ? AND artist IS NOT NULL
         GROUP BY artist
         ORDER BY play_count DESC
         LIMIT 20`,
        [userId],
        (err, rows) => {
          if (err) {
            reject(err);
            return;
          }

          const artists = rows.map(row => ({
            name: row.artist,
            playCount: row.play_count,
            likes: row.likes,
            dislikes: row.dislikes,
            likeRate: row.play_count > 0 ? Math.round((row.likes / row.play_count) * 100) : 0
          }));

          const favorite = artists.filter(a => a.likeRate >= 70);
          const avoided = artists.filter(a => a.likeRate <= 30);

          resolve({
            topArtists: artists.slice(0, 10),
            favoriteArtists: favorite.slice(0, 5),
            avoidedArtists: avoided.slice(0, 5),
            totalUniqueArtists: artists.length
          });
        }
      );
    });
  }

  /**
   * Analyze mood correlations (based on time and weather patterns)
   */
  async analyzeMoodCorrelations(userId) {
    const prefs = await this.getPreferences(userId);
    const history = prefs.playHistory || [];
    
    // This would ideally use weather API data, but we'll infer from patterns
    const correlations = {
      morningMood: null,
      eveningMood: null,
      weekendVsWeekday: null
    };

    const morningPlays = history.filter(h => {
      const hour = new Date(h.timestamp).getHours();
      return hour >= 6 && hour < 12;
    });

    const eveningPlays = history.filter(h => {
      const hour = new Date(h.timestamp).getHours();
      return hour >= 18 && hour < 24;
    });

    const morningCompletion = morningPlays.length > 0 
      ? (morningPlays.filter(p => p.completed).length / morningPlays.length) * 100 
      : 0;
    
    const eveningCompletion = eveningPlays.length > 0 
      ? (eveningPlays.filter(p => p.completed).length / eveningPlays.length) * 100 
      : 0;

    return {
      morningEngagement: {
        playCount: morningPlays.length,
        completionRate: Math.round(morningCompletion * 10) / 10,
        preferred: morningCompletion > eveningCompletion ? 'morning' : 'evening'
      },
      eveningEngagement: {
        playCount: eveningPlays.length,
        completionRate: Math.round(eveningCompletion * 10) / 10
      },
      insight: morningCompletion > eveningCompletion 
        ? 'You seem to enjoy music more in the morning hours'
        : 'Your music sessions are typically longer in the evening'
    };
  }

  /**
   * Invalidate analysis cache
   */
  invalidateAnalysisCache(userId) {
    this.analysisCache.delete(userId);
  }

  /**
   * Get default preferences for new users
   */
  getDefaultPreferences(userId) {
    return {
      userId,
      preferredStyles: ['流行', '轻音乐', '钢琴'],
      preferredArtists: [],
      dislikedStyles: [],
      playHistory: [],
      skipPatterns: {},
      favoriteTimes: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Clear cache for a user
   */
  clearCache(userId) {
    this.cache.delete(userId);
    this.analysisCache.delete(userId);
  }
}

module.exports = { UserProfile };
