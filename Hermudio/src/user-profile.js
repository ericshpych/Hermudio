/**
 * User Profile Service for Hermudio
 * 
 * Manages user preferences and learning from interactions
 */

class UserProfile {
  constructor(db) {
    this.db = db;
    this.cache = new Map();
  }

  /**
   * Get user preferences
   */
  async getPreferences(userId = 'default') {
    // Check cache
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
            // Return default preferences
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
      // Add to preferred styles
      if (songInfo.style && !prefs.preferredStyles.includes(songInfo.style)) {
        prefs.preferredStyles.push(songInfo.style);
      }
      // Add to preferred artists
      if (songInfo.artist && !prefs.preferredArtists.includes(songInfo.artist)) {
        prefs.preferredArtists.push(songInfo.artist);
      }
    } else if (action === 'dislike') {
      // Add to disliked styles
      if (songInfo.style && !prefs.dislikedStyles.includes(songInfo.style)) {
        prefs.dislikedStyles.push(songInfo.style);
      }
    }

    // Save feedback to history
    await this.saveFeedback(userId, songId, songInfo, action);
    
    // Update preferences
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
            resolve();
          }
        }
      );
    });
  }

  /**
   * Record song play (for learning patterns)
   */
  async recordPlay(userId, songId, songInfo, completed = false) {
    const prefs = await this.getPreferences(userId);
    
    // Track play history
    if (!prefs.playHistory) {
      prefs.playHistory = [];
    }
    
    prefs.playHistory.unshift({
      songId,
      timestamp: new Date().toISOString(),
      completed
    });

    // Keep only last 100 plays
    if (prefs.playHistory.length > 100) {
      prefs.playHistory = prefs.playHistory.slice(0, 100);
    }

    // Track favorite times
    const hour = new Date().getHours();
    if (!prefs.favoriteTimes) {
      prefs.favoriteTimes = {};
    }
    prefs.favoriteTimes[hour] = (prefs.favoriteTimes[hour] || 0) + 1;

    return this.updatePreferences(userId, prefs);
  }

  /**
   * Record skip (for learning what user doesn't like)
   */
  async recordSkip(userId, songId, songInfo) {
    const prefs = await this.getPreferences(userId);
    
    if (!prefs.skipPatterns) {
      prefs.skipPatterns = {};
    }

    // Track skips by artist
    if (songInfo.artist) {
      const key = `artist:${songInfo.artist}`;
      prefs.skipPatterns[key] = (prefs.skipPatterns[key] || 0) + 1;
    }

    // Track skips by style
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
   * Get user's listening stats
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
  }
}

module.exports = { UserProfile };
