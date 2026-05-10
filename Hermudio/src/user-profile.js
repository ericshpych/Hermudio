/**
 * User Profile Service for Hermudio
 * 
 * Manages user preferences and learning from interactions
 * Enhanced with intelligent preference learning
 */

class UserProfile {
  constructor(db) {
    this.db = db;
    this.cache = new Map();
  }

  /**
   * Get user preferences with enhanced learning
   */
  async getPreferences(userId = 'default') {
    if (this.cache.has(userId)) {
      console.log('[UserProfile] Returning cached preferences for:', userId);
      return this.cache.get(userId);
    }

    console.log('[UserProfile] Fetching preferences from DB for:', userId);

    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM user_profiles WHERE user_id = ?',
        [userId],
        (err, row) => {
          if (err) {
            console.error('[UserProfile] DB error:', err);
            reject(err);
            return;
          }

          if (row) {
            console.log('[UserProfile] Found user profile in DB:', row.user_id);
            const prefs = {
              userId: row.user_id,
              preferredStyles: JSON.parse(row.preferred_styles || '[]'),
              preferredArtists: JSON.parse(row.preferred_artists || '[]'),
              dislikedStyles: JSON.parse(row.disliked_styles || '[]'),
              playHistory: JSON.parse(row.play_history || '[]'),
              skipPatterns: JSON.parse(row.skip_patterns || '{}'),
              favoriteTimes: JSON.parse(row.favorite_times || '{}'),
              songRatings: JSON.parse(row.song_ratings || '{}'),
              artistPlayCounts: JSON.parse(row.artist_play_counts || '{}'),
              stylePlayCounts: JSON.parse(row.style_play_counts || '{}'),
              createdAt: row.created_at,
              updatedAt: row.updated_at
            };
            this.cache.set(userId, prefs);
            resolve(prefs);
          } else {
            console.log('[UserProfile] No profile found for:', userId, 'returning defaults');
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
         play_history, skip_patterns, favorite_times, song_ratings,
         artist_play_counts, style_play_counts, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        userId,
        JSON.stringify(newPrefs.preferredStyles),
        JSON.stringify(newPrefs.preferredArtists),
        JSON.stringify(newPrefs.dislikedStyles),
        JSON.stringify(newPrefs.playHistory),
        JSON.stringify(newPrefs.skipPatterns),
        JSON.stringify(newPrefs.favoriteTimes),
        JSON.stringify(newPrefs.songRatings),
        JSON.stringify(newPrefs.artistPlayCounts),
        JSON.stringify(newPrefs.stylePlayCounts),
        newPrefs.createdAt || new Date().toISOString(),
        newPrefs.updatedAt,
        (err) => {
          if (err) {
            reject(err);
          } else {
            this.cache.set(userId, newPrefs);
            resolve(newPrefs);
          }
        }
      );

      stmt.finalize();
    });
  }

  /**
   * Record a like/dislike action
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
      this.rateSong(prefs, songId, 5);
    } else if (action === 'dislike') {
      if (songInfo.style && !prefs.dislikedStyles.includes(songInfo.style)) {
        prefs.dislikedStyles.push(songInfo.style);
      }
      this.rateSong(prefs, songId, 1);
    }

    await this.saveFeedback(userId, songId, songInfo, action);
    
    return this.updatePreferences(userId, prefs);
  }

  /**
   * Rate a song (1-5 stars)
   */
  rateSong(prefs, songId, rating) {
    if (!prefs.songRatings) {
      prefs.songRatings = {};
    }
    prefs.songRatings[songId] = rating;
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
            resolve();
          }
        }
      );
    });
  }

  /**
   * Record song play with learning
   */
  async recordPlay(userId, songId, songInfo, completed = false, duration = 0) {
    const prefs = await this.getPreferences(userId);
    
    if (!prefs.playHistory) {
      prefs.playHistory = [];
    }
    
    prefs.playHistory.unshift({
      songId,
      timestamp: new Date().toISOString(),
      completed,
      duration
    });

    if (prefs.playHistory.length > 200) {
      prefs.playHistory = prefs.playHistory.slice(0, 200);
    }

    const hour = new Date().getHours();
    if (!prefs.favoriteTimes) {
      prefs.favoriteTimes = {};
    }
    prefs.favoriteTimes[hour] = (prefs.favoriteTimes[hour] || 0) + 1;

    this.updateArtistPlayCount(prefs, songInfo.artist);
    this.updateStylePlayCount(prefs, songInfo.style);

    if (completed) {
      this.rateSong(prefs, songId, 3);
    }

    return this.updatePreferences(userId, prefs);
  }

  /**
   * Update artist play count
   */
  updateArtistPlayCount(prefs, artist) {
    if (!artist) return;
    
    if (!prefs.artistPlayCounts) {
      prefs.artistPlayCounts = {};
    }
    prefs.artistPlayCounts[artist] = (prefs.artistPlayCounts[artist] || 0) + 1;
  }

  /**
   * Update style play count
   */
  updateStylePlayCount(prefs, style) {
    if (!style) return;
    
    if (!prefs.stylePlayCounts) {
      prefs.stylePlayCounts = {};
    }
    prefs.stylePlayCounts[style] = (prefs.stylePlayCounts[style] || 0) + 1;
  }

  /**
   * Record skip
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

    this.rateSong(prefs, songId, 1);

    return this.updatePreferences(userId, prefs);
  }

  /**
   * Learn preferences from play history
   */
  async learnPreferences(userId) {
    const prefs = await this.getPreferences(userId);
    
    const learnedStyles = this.learnStylesFromHistory(prefs);
    const learnedArtists = this.learnArtistsFromHistory(prefs);
    
    learnedStyles.forEach(style => {
      if (!prefs.preferredStyles.includes(style)) {
        prefs.preferredStyles.push(style);
      }
    });
    
    learnedArtists.forEach(artist => {
      if (!prefs.preferredArtists.includes(artist)) {
        prefs.preferredArtists.push(artist);
      }
    });

    return this.updatePreferences(userId, prefs);
  }

  /**
   * Learn styles from play history
   */
  learnStylesFromHistory(prefs) {
    if (!prefs.stylePlayCounts) return [];
    
    const sortedStyles = Object.entries(prefs.stylePlayCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([style]) => style);
    
    return sortedStyles;
  }

  /**
   * Learn artists from play history
   */
  learnArtistsFromHistory(prefs) {
    if (!prefs.artistPlayCounts) return [];
    
    const sortedArtists = Object.entries(prefs.artistPlayCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([artist]) => artist);
    
    return sortedArtists;
  }

  /**
   * Get user's favorite artists based on play count
   */
  async getFavoriteArtists(userId, limit = 10) {
    const prefs = await this.getPreferences(userId);
    
    if (prefs.artistPlayCounts) {
      return Object.entries(prefs.artistPlayCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([artist]) => artist);
    }

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
   * Get user's favorite styles
   */
  async getFavoriteStyles(userId, limit = 5) {
    const prefs = await this.getPreferences(userId);
    
    if (prefs.stylePlayCounts) {
      return Object.entries(prefs.stylePlayCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([style]) => style);
    }
    
    return prefs.preferredStyles.slice(0, limit);
  }

  /**
   * Get user's peak listening hours
   */
  async getPeakListeningHours(userId) {
    const prefs = await this.getPreferences(userId);
    
    if (!prefs.favoriteTimes) return [];
    
    return Object.entries(prefs.favoriteTimes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([hour]) => parseInt(hour));
  }

  /**
   * Get user's listening stats
   */
  async getStats(userId) {
    const prefs = await this.getPreferences(userId);
    
    let totalPlays = prefs.playHistory?.length || 0;
    let completedPlays = prefs.playHistory?.filter(p => p.completed).length || 0;
    let uniqueArtists = prefs.artistPlayCounts ? Object.keys(prefs.artistPlayCounts).length : 0;
    let favoriteArtist = null;
    
    if (prefs.artistPlayCounts) {
      favoriteArtist = Object.entries(prefs.artistPlayCounts)
        .sort((a, b) => b[1] - a[1])[0]?.[0];
    }

    return {
      totalPlays,
      completedPlays,
      completionRate: totalPlays > 0 ? Math.round((completedPlays / totalPlays) * 100) : 0,
      uniqueArtists,
      favoriteArtist,
      peakHours: await this.getPeakListeningHours(userId),
      likedSongs: prefs.songRatings ? 
        Object.values(prefs.songRatings).filter(r => r >= 4).length : 0
    };
  }

  /**
   * Get personalized weights for recommendation
   */
  async getRecommendationWeights(userId) {
    const prefs = await this.getPreferences(userId);
    const stats = await this.getStats(userId);
    
    return {
      timeOfDayWeight: 0.3,
      weatherWeight: 0.2,
      moodWeight: 0.2,
      preferredArtistWeight: 0.4,
      preferredStyleWeight: 0.3,
      playHistoryWeight: stats.totalPlays > 10 ? 0.2 : 0.05,
      completionRateBonus: stats.completionRate > 70 ? 0.1 : 0
    };
  }

  /**
   * Should exclude this artist based on skip patterns
   */
  shouldExcludeArtist(userId, artist) {
    return this.getPreferences(userId).then(prefs => {
      if (!prefs.skipPatterns) return false;
      const key = `artist:${artist}`;
      return (prefs.skipPatterns[key] || 0) > 3;
    });
  }

  /**
   * Should exclude this style based on skip patterns
   */
  shouldExcludeStyle(userId, style) {
    return this.getPreferences(userId).then(prefs => {
      if (!prefs.skipPatterns) return false;
      const key = `style:${style}`;
      return (prefs.skipPatterns[key] || 0) > 3;
    });
  }

  /**
   * Get default preferences for new users
   */
  getDefaultPreferences(userId) {
    return {
      userId,
      preferredStyles: ['流行', '轻音乐', '钢琴', '爵士'],
      preferredArtists: [],
      dislikedStyles: [],
      playHistory: [],
      skipPatterns: {},
      favoriteTimes: {},
      songRatings: {},
      artistPlayCounts: {},
      stylePlayCounts: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Clear cache for a user
   */
  clearCache(userId) {
    this.cache.delete(userId);
  }

  /**
   * Reset user profile
   */
  async resetProfile(userId) {
    const defaults = this.getDefaultPreferences(userId);
    this.cache.set(userId, defaults);
    return this.updatePreferences(userId, defaults);
  }
}

module.exports = { UserProfile };
