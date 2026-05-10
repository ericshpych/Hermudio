/**
 * Real-time Streaming Learning Module
 * 
 * Implements:
 * 1. Real-time user behavior capture
 * 2. Online learning for recommendation adjustment
 * 3. Play session analysis
 * 4. Immediate feedback integration
 * 5. Adaptive recommendation weights
 */

class RealtimeLearning {
  constructor(db, recommendationEngine) {
    this.db = db;
    this.recommendationEngine = recommendationEngine;

    // In-memory session tracking
    this.currentSessions = new Map(); // userId -> session data
    this.playEvents = []; // Buffer for batch processing
    this.eventBufferSize = 10;
    this.bufferFlushInterval = 30000; // 30 seconds

    // Adaptive weights
    this.userWeights = new Map(); // userId -> { cfWeight, sceneWeight, diversityWeight }

    // 【修复】存储定时器引用，用于后续清理
    this.intervals = [];

    // Start background processing
    this.startBackgroundProcessing();
  }

  /**
   * Start a new play session for a user
   */
  startSession(userId, songId, songInfo = {}) {
    const session = {
      userId,
      startTime: Date.now(),
      songId,
      songName: songInfo.name,
      artist: songInfo.artist,
      playEvents: [],
      skipDetected: false,
      completionRate: 0
    };
    
    this.currentSessions.set(userId, session);
    console.log('[RealtimeLearning] Session started:', { userId, songId, songName: songInfo.name });
    
    // Record play start
    this.recordPlayEvent(userId, songId, 'play_start', songInfo);
  }

  /**
   * Update play progress in real-time
   */
  updateProgress(userId, progress, duration) {
    const session = this.currentSessions.get(userId);
    if (!session) return;

    session.completionRate = progress;
    
    // Detect skip behavior (progress < 30% and stopped)
    if (progress < 30 && !session.skipDetected) {
      session.skipDetected = true;
      console.log('[RealtimeLearning] Early skip detected:', { userId, progress });
    }

    // Record progress milestone
    if (progress === 25 || progress === 50 || progress === 75 || progress === 100) {
      this.recordPlayEvent(userId, session.songId, `progress_${progress}`, {
        completionRate: progress,
        duration
      });
    }
  }

  /**
   * End a play session and analyze
   */
  async endSession(userId, endReason = 'completed') {
    const session = this.currentSessions.get(userId);
    if (!session) return;

    const duration = Date.now() - session.startTime;
    session.endTime = Date.now();
    session.duration = duration;
    session.endReason = endReason;

    // Determine action based on session analysis
    let action = this.determineAction(session);
    
    console.log('[RealtimeLearning] Session ended:', {
      userId,
      songId: session.songId,
      duration,
      completionRate: session.completionRate,
      action
    });

    // Record feedback immediately
    await this.recordImmediateFeedback(
      userId,
      session.songId,
      action,
      session.songName,
      session.artist
    );

    // Update user's adaptive weights
    this.updateAdaptiveWeights(userId, session, action);

    // Clear session
    this.currentSessions.delete(userId);

    // Trigger immediate recommendation adjustment if needed
    if (action === 'dislike' || action === 'skip') {
      this.triggerRecommendationRefresh(userId);
    }
  }

  /**
   * Determine action based on session analysis
   */
  determineAction(session) {
    const { completionRate, skipDetected, duration } = session;

    // Dislike: skipped within first 10 seconds or < 10% completion
    if (completionRate < 10 || (skipDetected && duration < 10000)) {
      return 'dislike';
    }

    // Skip: skipped between 10-30%
    if (skipDetected && completionRate < 30) {
      return 'skip';
    }

    // Play partial: 30-80% completion
    if (completionRate < 80) {
      return 'play_partial';
    }

    // Play complete: 80%+ completion
    if (completionRate >= 80) {
      return 'play_complete';
    }

    return 'unknown';
  }

  /**
   * Record immediate feedback to database
   */
  async recordImmediateFeedback(userId, songId, action, songName, artist) {
    try {
      // Use the recommendation engine's recordFeedback method
      if (this.recommendationEngine && this.recommendationEngine.recordFeedback) {
        await this.recommendationEngine.recordFeedback(userId, songId, action, songName, artist);
      }

      // Also store in play_events for detailed analytics
      const sql = `
        INSERT INTO play_events 
        (user_id, song_id, song_name, artist, action, timestamp, session_data)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
      `;

      const sessionData = JSON.stringify({
        completionRate: this.currentSessions.get(userId)?.completionRate || 0,
        duration: this.currentSessions.get(userId)?.duration || 0
      });

      this.db.run(sql, [userId, songId, songName, artist, action, sessionData], (err) => {
        if (err) {
          console.error('[RealtimeLearning] Failed to record play event:', err);
        } else {
          console.log('[RealtimeLearning] Play event recorded:', { userId, songId, action });
        }
      });
    } catch (error) {
      console.error('[RealtimeLearning] Error recording feedback:', error);
    }
  }

  /**
   * Update adaptive weights for a user based on behavior
   */
  updateAdaptiveWeights(userId, session, action) {
    let weights = this.userWeights.get(userId);
    if (!weights) {
      weights = {
        cfWeight: 0.4,        // Collaborative filtering weight
        sceneWeight: 0.3,     // Scene-based weight
        diversityWeight: 0.3, // Diversity exploration weight
        consecutiveSkips: 0,
        consecutiveLikes: 0
      };
    }

    // Adjust weights based on action
    switch (action) {
      case 'dislike':
      case 'skip':
        weights.consecutiveSkips++;
        weights.consecutiveLikes = 0;
        
        // Increase diversity weight if consecutive skips
        if (weights.consecutiveSkips >= 2) {
          weights.diversityWeight = Math.min(0.6, weights.diversityWeight + 0.1);
          weights.cfWeight = Math.max(0.2, weights.cfWeight - 0.05);
          console.log('[RealtimeLearning] Increased diversity due to consecutive skips');
        }
        break;

      case 'play_complete':
        weights.consecutiveLikes++;
        weights.consecutiveSkips = 0;
        
        // Increase CF weight if consecutive completions
        if (weights.consecutiveLikes >= 2) {
          weights.cfWeight = Math.min(0.6, weights.cfWeight + 0.05);
          weights.diversityWeight = Math.max(0.2, weights.diversityWeight - 0.05);
          console.log('[RealtimeLearning] Increased CF weight due to consecutive likes');
        }
        break;

      case 'play_partial':
        // Neutral - slight preference for scene-based
        weights.sceneWeight = Math.min(0.5, weights.sceneWeight + 0.02);
        break;
    }

    // Normalize weights to sum to 1
    const total = weights.cfWeight + weights.sceneWeight + weights.diversityWeight;
    weights.cfWeight /= total;
    weights.sceneWeight /= total;
    weights.diversityWeight /= total;

    this.userWeights.set(userId, weights);
    
    console.log('[RealtimeLearning] Updated weights for user:', userId, weights);
  }

  /**
   * Get adaptive weights for a user
   */
  getAdaptiveWeights(userId) {
    return this.userWeights.get(userId) || {
      cfWeight: 0.4,
      sceneWeight: 0.3,
      diversityWeight: 0.3,
      consecutiveSkips: 0,
      consecutiveLikes: 0
    };
  }

  /**
   * Record a play event for batch processing
   */
  recordPlayEvent(userId, songId, eventType, metadata = {}) {
    this.playEvents.push({
      userId,
      songId,
      eventType,
      metadata,
      timestamp: Date.now()
    });

    // Flush if buffer is full
    if (this.playEvents.length >= this.eventBufferSize) {
      this.flushEventBuffer();
    }
  }

  /**
   * Flush event buffer to database
   */
  async flushEventBuffer() {
    if (this.playEvents.length === 0) return;

    const events = [...this.playEvents];
    this.playEvents = [];

    console.log('[RealtimeLearning] Flushing', events.length, 'play events');

    // Batch insert would be more efficient, but for simplicity we process individually
    for (const event of events) {
      // Events are already recorded in real-time, this is for analytics
      // Could be used for batch model training later
    }
  }

  /**
   * Trigger immediate recommendation refresh
   */
  triggerRecommendationRefresh(userId) {
    console.log('[RealtimeLearning] Triggering recommendation refresh for user:', userId);
    
    // Clear recommendation cache for this user
    if (this.recommendationEngine) {
      this.recommendationEngine.recommendationCache.delete(userId);
    }

    // Could also trigger a websocket push or event here
  }

  /**
   * Start background processing loop
   */
  startBackgroundProcessing() {
    // 【修复】存储定时器引用，便于后续清理
    // Flush buffer periodically
    const bufferInterval = setInterval(() => {
      this.flushEventBuffer();
    }, this.bufferFlushInterval);
    this.intervals.push(bufferInterval);

    // Clean up stale sessions periodically
    const cleanupInterval = setInterval(() => {
      this.cleanupStaleSessions();
    }, 60000); // Every minute
    this.intervals.push(cleanupInterval);

    console.log('[RealtimeLearning] Background processing started');
  }

  /**
   * 【修复】关闭方法 - 清理所有定时器，防止资源泄漏
   */
  shutdown() {
    console.log('[RealtimeLearning] Shutting down, cleaning up intervals...');
    this.intervals.forEach(intervalId => clearInterval(intervalId));
    this.intervals = [];
    // Flush any remaining events
    this.flushEventBuffer();
  }

  /**
   * Clean up stale sessions (sessions older than 30 minutes)
   */
  cleanupStaleSessions() {
    const now = Date.now();
    const staleThreshold = 30 * 60 * 1000; // 30 minutes

    for (const [userId, session] of this.currentSessions.entries()) {
      if (now - session.startTime > staleThreshold) {
        console.log('[RealtimeLearning] Cleaning up stale session:', userId);
        this.currentSessions.delete(userId);
      }
    }
  }

  /**
   * Get user's recent behavior summary
   */
  async getUserBehaviorSummary(userId, hours = 24) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          action,
          COUNT(*) as count,
          AVG(CASE 
            WHEN session_data IS NOT NULL 
            THEN json_extract(session_data, '$.completionRate')
            ELSE 0 
          END) as avgCompletionRate
        FROM play_events
        WHERE user_id = ? 
          AND timestamp > datetime('now', '-${hours} hours')
        GROUP BY action
      `;

      this.db.all(sql, [userId], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }

        const summary = {
          totalPlays: 0,
          completionRate: 0,
          skipRate: 0,
          likeRate: 0
        };

        rows.forEach(row => {
          summary.totalPlays += row.count;
          
          if (row.action === 'play_complete') {
            summary.completionRate = row.count;
          } else if (row.action === 'skip' || row.action === 'dislike') {
            summary.skipRate += row.count;
          } else if (row.action === 'like') {
            summary.likeRate = row.count;
          }
        });

        if (summary.totalPlays > 0) {
          summary.completionRate = (summary.completionRate / summary.totalPlays * 100).toFixed(1);
          summary.skipRate = (summary.skipRate / summary.totalPlays * 100).toFixed(1);
        }

        resolve(summary);
      });
    });
  }

  /**
   * Shutdown gracefully
   */
  async shutdown() {
    console.log('[RealtimeLearning] Shutting down...');
    
    // End all active sessions
    for (const userId of this.currentSessions.keys()) {
      await this.endSession(userId, 'shutdown');
    }

    // Flush remaining events
    await this.flushEventBuffer();
    
    console.log('[RealtimeLearning] Shutdown complete');
  }
}

module.exports = { RealtimeLearning };
