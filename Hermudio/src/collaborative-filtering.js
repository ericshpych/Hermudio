/**
 * Collaborative Filtering Recommendation Module
 * 
 * Implements:
 * 1. User-Based Collaborative Filtering (UBCF)
 * 2. Item-Based Collaborative Filtering (IBCF)
 * 3. User-Item Rating Matrix generation
 * 4. Cosine similarity calculation
 * 5. K-Nearest Neighbors (KNN) for recommendation
 */

class CollaborativeFiltering {
  constructor(db) {
    this.db = db;
    this.userSimilarityCache = new Map();
    this.itemSimilarityCache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    this.lastCacheUpdate = 0;
  }

  /**
   * Generate user-item rating matrix from database
   * Rating weights: like=5, play_complete=3, play_partial=2, skip=-1, dislike=-3
   */
  async generateRatingMatrix() {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          user_id,
          song_id,
          SUM(CASE 
            WHEN action = 'like' THEN 5
            WHEN action = 'play_complete' THEN 3
            WHEN action = 'play_partial' THEN 2
            WHEN action = 'skip' THEN -1
            WHEN action = 'dislike' THEN -3
            ELSE 1
          END) as rating
        FROM user_feedback
        GROUP BY user_id, song_id
        HAVING rating > 0
      `;

      this.db.all(query, [], (err, rows) => {
        if (err) {
          console.error('[CF] Failed to generate rating matrix:', err);
          reject(err);
          return;
        }

        // Build rating matrix: { userId: { songId: rating } }
        const matrix = {};
        const userSongs = {}; // Track songs each user has interacted with
        const songUsers = {}; // Track users who interacted with each song

        rows.forEach(row => {
          if (!matrix[row.user_id]) {
            matrix[row.user_id] = {};
            userSongs[row.user_id] = new Set();
          }
          matrix[row.user_id][row.song_id] = row.rating;
          userSongs[row.user_id].add(row.song_id);

          if (!songUsers[row.song_id]) {
            songUsers[row.song_id] = new Set();
          }
          songUsers[row.song_id].add(row.user_id);
        });

        console.log('[CF] Rating matrix generated:', {
          users: Object.keys(matrix).length,
          totalRatings: rows.length
        });

        resolve({ matrix, userSongs, songUsers });
      });
    });
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  cosineSimilarity(vectorA, vectorB) {
    const commonKeys = Object.keys(vectorA).filter(key => vectorB[key] !== undefined);
    
    if (commonKeys.length === 0) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    // Calculate dot product and norms for common items
    commonKeys.forEach(key => {
      dotProduct += vectorA[key] * vectorB[key];
    });

    // Calculate full norms
    Object.values(vectorA).forEach(val => {
      normA += val * val;
    });
    Object.values(vectorB).forEach(val => {
      normB += val * val;
    });

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) return 0;

    return dotProduct / (normA * normB);
  }

  /**
   * Calculate similarity between two users
   */
  calculateUserSimilarity(userId1, userId2, matrix) {
    const ratings1 = matrix[userId1];
    const ratings2 = matrix[userId2];

    if (!ratings1 || !ratings2) return 0;

    return this.cosineSimilarity(ratings1, ratings2);
  }

  /**
   * Calculate similarity between two songs (items)
   */
  calculateItemSimilarity(songId1, songId2, matrix, songUsers) {
    // Get users who rated both songs
    const users1 = songUsers[songId1] || new Set();
    const users2 = songUsers[songId2] || new Set();
    
    const commonUsers = [...users1].filter(u => users2.has(u));
    
    if (commonUsers.length < 2) return 0; // Need at least 2 common users

    // Build rating vectors for common users
    const vector1 = {};
    const vector2 = {};
    
    commonUsers.forEach(userId => {
      vector1[userId] = matrix[userId][songId1];
      vector2[userId] = matrix[userId][songId2];
    });

    return this.cosineSimilarity(vector1, vector2);
  }

  /**
   * Find K nearest neighbors for a user
   */
  async findSimilarUsers(targetUserId, k = 10) {
    try {
      const { matrix } = await this.generateRatingMatrix();
      
      if (!matrix[targetUserId]) {
        console.log('[CF] Target user has no ratings');
        return [];
      }

      const similarities = [];

      for (const userId of Object.keys(matrix)) {
        if (userId === targetUserId) continue;

        const similarity = this.calculateUserSimilarity(targetUserId, userId, matrix);
        
        if (similarity > 0) {
          similarities.push({ userId, similarity });
        }
      }

      // Sort by similarity descending and take top K
      similarities.sort((a, b) => b.similarity - a.similarity);
      
      console.log('[CF] Found', similarities.length, 'similar users, top similarity:', similarities[0]?.similarity);
      
      return similarities.slice(0, k);
    } catch (error) {
      console.error('[CF] Error finding similar users:', error);
      return [];
    }
  }

  /**
   * Find K similar songs for a given song
   */
  async findSimilarSongs(songId, k = 10) {
    try {
      const { matrix, songUsers } = await this.generateRatingMatrix();
      
      if (!songUsers[songId] || songUsers[songId].size < 2) {
        console.log('[CF] Target song has insufficient ratings');
        return [];
      }

      const similarities = [];
      const allSongs = Object.keys(songUsers);

      for (const otherSongId of allSongs) {
        if (otherSongId === songId) continue;

        const similarity = this.calculateItemSimilarity(songId, otherSongId, matrix, songUsers);
        
        if (similarity > 0.1) { // Threshold to filter weak similarities
          similarities.push({ songId: otherSongId, similarity });
        }
      }

      // Sort by similarity descending and take top K
      similarities.sort((a, b) => b.similarity - a.similarity);
      
      console.log('[CF] Found', similarities.length, 'similar songs, top similarity:', similarities[0]?.similarity);
      
      return similarities.slice(0, k);
    } catch (error) {
      console.error('[CF] Error finding similar songs:', error);
      return [];
    }
  }

  /**
   * User-Based Collaborative Filtering Recommendation
   * Recommend songs that similar users liked
   */
  async recommendByUserCF(userId, excludedSongs = [], k = 5) {
    try {
      console.log('[CF] User-Based CF recommendation for user:', userId);
      
      const similarUsers = await this.findSimilarUsers(userId, 10);
      
      if (similarUsers.length === 0) {
        console.log('[CF] No similar users found');
        return null;
      }

      const { matrix } = await this.generateRatingMatrix();
      const userRatings = matrix[userId] || {};
      const excludedSet = new Set(excludedSongs.map(id => id.toString()));

      // Aggregate ratings from similar users
      const candidateScores = {};
      const candidateSources = {};

      for (const { userId: similarUserId, similarity } of similarUsers) {
        const similarUserRatings = matrix[similarUserId];
        
        for (const [songId, rating] of Object.entries(similarUserRatings)) {
          // Skip songs user already rated or excluded
          if (userRatings[songId] || excludedSet.has(songId)) continue;

          if (!candidateScores[songId]) {
            candidateScores[songId] = 0;
            candidateSources[songId] = [];
          }
          
          // Weighted by similarity
          candidateScores[songId] += rating * similarity;
          candidateSources[songId].push({ userId: similarUserId, similarity, rating });
        }
      }

      // Sort candidates by score
      const sortedCandidates = Object.entries(candidateScores)
        .map(([songId, score]) => ({ songId, score, sources: candidateSources[songId] }))
        .sort((a, b) => b.score - a.score);

      if (sortedCandidates.length === 0) {
        console.log('[CF] No candidate songs from similar users');
        return null;
      }

      // Get top recommendation
      const topCandidate = sortedCandidates[0];
      
      // Fetch song details
      const songDetails = await this.getSongDetails(topCandidate.songId);
      
      if (!songDetails) {
        console.log('[CF] Could not fetch details for song:', topCandidate.songId);
        return null;
      }

      console.log('[CF] User-Based CF recommendation:', songDetails.name, 'score:', topCandidate.score);

      return {
        song: songDetails,
        score: topCandidate.score,
        reason: `根据与你音乐品味相似的用户推荐`,
        source: 'user_cf',
        similarUsers: topCandidate.sources.slice(0, 3).map(s => s.userId)
      };
    } catch (error) {
      console.error('[CF] User-Based CF error:', error);
      return null;
    }
  }

  /**
   * Item-Based Collaborative Filtering Recommendation
   * Recommend songs similar to what user liked
   */
  async recommendByItemCF(userId, excludedSongs = [], k = 5) {
    try {
      console.log('[CF] Item-Based CF recommendation for user:', userId);
      
      const { matrix, userSongs, songUsers } = await this.generateRatingMatrix();
      
      if (!matrix[userId]) {
        console.log('[CF] User has no ratings');
        return null;
      }

      const userRatedSongs = Object.entries(matrix[userId])
        .filter(([songId, rating]) => rating >= 3) // Only consider liked songs
        .sort((a, b) => b[1] - a[1]) // Sort by rating descending
        .slice(0, 5); // Take top 5 liked songs

      if (userRatedSongs.length === 0) {
        console.log('[CF] User has no positively rated songs');
        return null;
      }

      const excludedSet = new Set(excludedSongs.map(id => id.toString()));
      const candidateScores = {};

      // For each liked song, find similar songs
      for (const [likedSongId, userRating] of userRatedSongs) {
        const similarSongs = await this.findSimilarSongs(likedSongId, 10);
        
        for (const { songId, similarity } of similarSongs) {
          // Skip songs user already rated or excluded
          if (matrix[userId][songId] || excludedSet.has(songId)) continue;

          if (!candidateScores[songId]) {
            candidateScores[songId] = 0;
          }
          
          // Weight by user's rating for the source song and similarity
          candidateScores[songId] += userRating * similarity;
        }
      }

      // Sort candidates by score
      const sortedCandidates = Object.entries(candidateScores)
        .map(([songId, score]) => ({ songId, score }))
        .sort((a, b) => b.score - a.score);

      if (sortedCandidates.length === 0) {
        console.log('[CF] No candidate songs from item similarity');
        return null;
      }

      // Get top recommendation
      const topCandidate = sortedCandidates[0];
      
      // Fetch song details
      const songDetails = await this.getSongDetails(topCandidate.songId);
      
      if (!songDetails) {
        console.log('[CF] Could not fetch details for song:', topCandidate.songId);
        return null;
      }

      console.log('[CF] Item-Based CF recommendation:', songDetails.name, 'score:', topCandidate.score);

      return {
        song: songDetails,
        score: topCandidate.score,
        reason: `与你喜欢的歌曲风格相似`,
        source: 'item_cf'
      };
    } catch (error) {
      console.error('[CF] Item-Based CF error:', error);
      return null;
    }
  }

  /**
   * Hybrid CF recommendation combining User-Based and Item-Based
   */
  async recommendHybrid(userId, excludedSongs = []) {
    console.log('[CF] Hybrid recommendation for user:', userId);

    const [userCFResult, itemCFResult] = await Promise.all([
      this.recommendByUserCF(userId, excludedSongs),
      this.recommendByItemCF(userId, excludedSongs)
    ]);

    const candidates = [];

    if (userCFResult) {
      candidates.push({ ...userCFResult, weight: 0.6 });
    }

    if (itemCFResult) {
      // Avoid duplicate
      if (!userCFResult || userCFResult.song.id !== itemCFResult.song.id) {
        candidates.push({ ...itemCFResult, weight: 0.4 });
      }
    }

    if (candidates.length === 0) {
      console.log('[CF] No hybrid recommendations available');
      return null;
    }

    // Select based on weighted score with some randomness
    candidates.sort((a, b) => (b.score * b.weight) - (a.score * a.weight));
    
    // 80% chance to pick top, 20% chance to pick second (if exists)
    const selected = (candidates.length > 1 && Math.random() < 0.2) 
      ? candidates[1] 
      : candidates[0];

    console.log('[CF] Hybrid selected:', selected.song.name, 'source:', selected.source);

    return {
      song: selected.song,
      reason: selected.reason,
      source: selected.source,
      cfScore: selected.score
    };
  }

  /**
   * Get song details from database or music service
   */
  async getSongDetails(songId) {
    return new Promise((resolve, reject) => {
      // First try local library
      this.db.get(
        'SELECT song_id, song_name, artist, album FROM local_library WHERE song_id = ?',
        [songId],
        (err, row) => {
          if (err) {
            reject(err);
            return;
          }

          if (row) {
            resolve({
              id: row.song_id,
              encryptedId: row.song_id,
              name: row.song_name,
              artist: row.artist,
              album: row.album
            });
            return;
          }

          // If not in local library, return basic info
          resolve({
            id: songId,
            encryptedId: songId,
            name: null,
            artist: null,
            album: null
          });
        }
      );
    });
  }

  /**
   * Record user feedback for CF training
   */
  async recordFeedback(userId, songId, action, songName = null, artist = null) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO user_feedback (user_id, song_id, song_name, artist, action, created_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `;

      this.db.run(sql, [userId, songId, songName, artist, action], (err) => {
        if (err) {
          console.error('[CF] Failed to record feedback:', err);
          reject(err);
          return;
        }

        console.log('[CF] Feedback recorded:', { userId, songId, action });
        
        // Invalidate cache
        this.userSimilarityCache.clear();
        this.itemSimilarityCache.clear();
        
        resolve();
      });
    });
  }

  /**
   * Clear similarity caches
   */
  clearCache() {
    this.userSimilarityCache.clear();
    this.itemSimilarityCache.clear();
    this.lastCacheUpdate = 0;
    console.log('[CF] Similarity caches cleared');
  }
}

module.exports = { CollaborativeFiltering };
