/**
 * Hermudio - AI Personalized Music Radio Server
 * 
 * Core Services:
 * - User Profile Management (SQLite)
 * - Music Search & Playback (ncm-cli integration)
 * - AI Recommendation Engine (Hermes integration)
 * - Scene-based Auto-recommendation
 */

const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const { exec } = require('child_process');
const axios = require('axios');

// Import services
const { RecommendationEngine } = require('./src/recommendation-engine');
const { MusicService } = require('./src/music-service');
const { UserProfile } = require('./src/user-profile');
const { HermesService } = require('./src/hermes-service');
const { getCurrentScene, getSceneDescription } = require('./src/scene-analyzer');
const { RadioHostService } = require('./src/radio-host-service');

const app = express();
const PORT = process.env.PORT || 6688;

// ==================== OAuth Login Setup ====================
// 使用原始项目配置目录（包含已配置的API key和登录凭证）
const PROJECT_HOME = path.join(__dirname, '..', '.ncm-home');
const PROJECT_CONFIG_DIR = path.join(PROJECT_HOME, '.config', 'ncm-cli');

// 确保配置目录存在
if (!fs.existsSync(PROJECT_CONFIG_DIR)) {
  fs.mkdirSync(PROJECT_CONFIG_DIR, { recursive: true });
  console.log(`[配置] 创建项目配置目录: ${PROJECT_CONFIG_DIR}`);
} else {
  console.log(`[配置] 使用已有配置目录: ${PROJECT_CONFIG_DIR}`);
}

// 存储登录会话
let loginSession = {
  isLoggingIn: false,
  loginUrl: null,
  startTime: null,
  loginProcess: null,
  loginCompleted: false
};

// 执行 ncm-cli 命令的辅助函数
function executeCLICommand(command, args = [], timeout = 30000) {
  return new Promise((resolve, reject) => {
    const escapedArgs = args.map(arg => {
      if (arg.includes(' ') || arg.includes('(') || arg.includes(')') || arg.includes('&') || arg.includes('|')) {
        return `"${arg.replace(/"/g, '\\"')}"`;
      }
      return arg;
    });
    const fullCommand = `npx @music163/ncm-cli ${command} ${escapedArgs.join(' ')}`;
    
    console.log(`[CLI执行] ${fullCommand}`);

    // 使用项目目录作为 HOME，避开系统保护
    const env = {
      ...process.env,
      HOME: PROJECT_HOME,
      USERPROFILE: PROJECT_HOME,
      XDG_CONFIG_HOME: path.join(PROJECT_HOME, '.config')
    };

    exec(fullCommand, { 
      timeout: timeout,
      encoding: 'utf8',
      env: env
    }, (error, stdout, stderr) => {
      const output = stdout || stderr || '';
      
      if (error && error.code !== 0 && !output) {
        console.error(`[CLI错误] ${error.message}`);
        reject({ error: error.message, stderr });
        return;
      }
      
      resolve(output);
    });
  });
}

// Middleware
app.use(express.json());
app.use(express.static('public'));

// ==================== Database Setup ====================
const DATA_DIR = './data';
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new sqlite3.Database('./data/hermudio.db', (err) => {
  if (err) {
    console.error('Database connection failed:', err);
  } else {
    console.log('Connected to SQLite database');
    initDatabase();
  }
});

function initDatabase() {
  // User Profile Table
  db.run(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT UNIQUE NOT NULL,
      preferred_styles TEXT DEFAULT '[]',
      preferred_artists TEXT DEFAULT '[]',
      disliked_styles TEXT DEFAULT '[]',
      play_history TEXT DEFAULT '[]',
      skip_patterns TEXT DEFAULT '{}',
      favorite_times TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Play History Table
  db.run(`
    CREATE TABLE IF NOT EXISTS play_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      song_id TEXT NOT NULL,
      played_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Local Music Library (songs with play permission)
  db.run(`
    CREATE TABLE IF NOT EXISTS local_library (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      song_id TEXT UNIQUE NOT NULL,
      song_name TEXT,
      artist TEXT,
      album TEXT,
      styles TEXT DEFAULT '[]',
      can_play BOOLEAN DEFAULT 1,
      play_count INTEGER DEFAULT 0,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // User Feedback Table
  db.run(`
    CREATE TABLE IF NOT EXISTS user_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      song_id TEXT NOT NULL,
      song_name TEXT,
      artist TEXT,
      action TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // User Playlists Table
  db.run(`
    CREATE TABLE IF NOT EXISTS playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Playlist Songs Table (many-to-many relationship)
  db.run(`
    CREATE TABLE IF NOT EXISTS playlist_songs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      playlist_id INTEGER NOT NULL,
      song_id TEXT NOT NULL,
      position INTEGER DEFAULT 0,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
      UNIQUE(playlist_id, song_id)
    )
  `);

  console.log('Database tables initialized');
}

// ==================== Initialize Services ====================
const musicService = new MusicService(db);
const userProfile = new UserProfile(db);
const recommendationEngine = new RecommendationEngine(db, userProfile);
const hermesService = new HermesService(recommendationEngine, musicService, userProfile);
const radioHostService = new RadioHostService(db, hermesService);

// ==================== API Routes ====================

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'Hermudio', 
    version: '1.0.0',
    features: ['recommendation', 'playback', 'chat', 'scene-analysis']
  });
});

// Get Current Scene
app.get('/api/scene', async (req, res) => {
  try {
    const scene = await getCurrentScene();
    const description = getSceneDescription(scene);
    res.json({ 
      success: true, 
      scene,
      description
    });
  } catch (error) {
    console.error('Scene error:', error);
    res.status(500).json({ error: 'Failed to get scene' });
  }
});

// Search Songs
app.get('/api/search', async (req, res) => {
  const { keyword, limit = 10 } = req.query;
  
  if (!keyword) {
    return res.status(400).json({ error: 'Keyword is required' });
  }

  try {
    const songs = await musicService.searchSongs(keyword, parseInt(limit));
    res.json({ success: true, data: songs });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed', message: error.message });
  }
});

// Get Recommendation
app.get('/api/recommend', async (req, res) => {
  const userId = req.query.userId || 'default';
  
  try {
    const recommendation = await recommendationEngine.getRecommendation({ userId });
    
    if (!recommendation || !recommendation.song) {
      return res.status(404).json({ error: 'No recommendation available' });
    }

    res.json({ 
      success: true, 
      recommendation 
    });
  } catch (error) {
    console.error('Recommendation error:', error);
    res.status(500).json({ error: 'Recommendation failed' });
  }
});

// Play Song
app.post('/api/play', async (req, res) => {
  const { songId, encryptedId } = req.body;
  const userId = req.body.userId || 'default';
  
  if (!songId) {
    return res.status(400).json({ error: 'Song ID is required' });
  }

  try {
    const result = await musicService.playSong(songId, encryptedId);
    
    if (result.success) {
      // Get song details and record play
      const details = await musicService.getSongDetails(songId);
      if (details) {
        await userProfile.recordPlay(userId, songId, details);
      }
    }

    res.json(result);
  } catch (error) {
    console.error('Play error:', error);
    res.status(500).json({ error: 'Play failed', message: error.message });
  }
});

// Play Recommendation (Auto-play recommended song)
app.post('/api/play-recommend', async (req, res) => {
  const userId = req.body.userId || 'default';
  
  try {
    const recommendation = await recommendationEngine.getRecommendation({ userId });
    
    if (!recommendation || !recommendation.song) {
      return res.status(404).json({ error: 'No recommendation available' });
    }

    // Get full song details with encryptedId if not present
    let songToPlay = recommendation.song;
    if (!songToPlay.encryptedId) {
      const details = await musicService.getSongDetails(songToPlay.id);
      if (details) {
        songToPlay = {
          ...songToPlay,
          encryptedId: details.encryptedId,
          originalId: details.originalId
        };
      }
    }

    const playResult = await musicService.playSong(songToPlay.id, songToPlay.encryptedId);

    // Check if login is required
    if (playResult.loginRequired) {
      return res.json({
        success: false,
        loginRequired: true,
        message: playResult.message,
        song: songToPlay,
        reason: recommendation.reason
      });
    }

    if (playResult.success) {
      await userProfile.recordPlay(userId, songToPlay.id, songToPlay);
    }

    res.json({
      success: true,
      song: songToPlay,
      reason: recommendation.reason,
      source: recommendation.source,
      mock: playResult.mock || false
    });
  } catch (error) {
    console.error('Play recommend error:', error);
    res.status(500).json({ error: 'Failed to play recommendation' });
  }
});

// Stop Playback
app.post('/api/stop', async (req, res) => {
  try {
    const result = await musicService.stop();
    res.json(result);
  } catch (error) {
    console.error('Stop error:', error);
    res.status(500).json({ error: 'Stop failed' });
  }
});

// Play Previous Song
app.post('/api/previous', async (req, res) => {
  try {
    const result = await musicService.playPrevious();
    
    if (result.loginRequired) {
      return res.json({
        success: false,
        loginRequired: true,
        message: result.message
      });
    }
    
    if (result.success) {
      res.json({
        success: true,
        song: musicService.currentSong,
        message: '已切换到上一首'
      });
    } else {
      res.json({
        success: false,
        message: result.message || '没有上一首歌曲'
      });
    }
  } catch (error) {
    console.error('Previous error:', error);
    res.status(500).json({ error: 'Failed to play previous song' });
  }
});

// Get Playback Status
app.get('/api/status', async (req, res) => {
  try {
    const status = await musicService.getStatus();
    res.json({ success: true, status });
  } catch (error) {
    console.error('Status error:', error);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

// Get Song Details
app.get('/api/song/:songId', async (req, res) => {
  const { songId } = req.params;
  
  try {
    const details = await musicService.getSongDetails(songId);
    if (details) {
      res.json({ success: true, song: details });
    } else {
      res.status(404).json({ error: 'Song not found' });
    }
  } catch (error) {
    console.error('Song details error:', error);
    res.status(500).json({ error: 'Failed to get song details' });
  }
});

// Get Lyrics
app.get('/api/lyrics/:songId', async (req, res) => {
  const { songId } = req.params;
  
  try {
    const lyrics = await musicService.getLyrics(songId);
    res.json({ success: true, lyrics });
  } catch (error) {
    console.error('Lyrics error:', error);
    res.status(500).json({ error: 'Failed to get lyrics' });
  }
});

// ==================== User Profile APIs ====================

// Get User Profile
app.get('/api/profile', async (req, res) => {
  const userId = req.query.userId || 'default';
  
  try {
    const profile = await userProfile.getPreferences(userId);
    res.json({ success: true, profile });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// Update User Profile
app.post('/api/profile', async (req, res) => {
  const userId = req.body.userId || 'default';
  const updates = req.body.updates || {};
  
  try {
    const profile = await userProfile.updatePreferences(userId, updates);
    res.json({ success: true, profile });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Record Feedback (Like/Dislike)
app.post('/api/feedback', async (req, res) => {
  const { songId, action } = req.body;
  const userId = req.body.userId || 'default';
  
  if (!songId || !action) {
    return res.status(400).json({ error: 'Song ID and action are required' });
  }

  try {
    const songInfo = await musicService.getSongDetails(songId) || { name: 'Unknown', artist: 'Unknown' };
    await userProfile.recordFeedback(userId, songId, songInfo, action);
    res.json({ success: true, message: `Recorded ${action}` });
  } catch (error) {
    console.error('Feedback error:', error);
    res.status(500).json({ error: 'Failed to record feedback' });
  }
});

// Get User's Favorite Songs (Liked Songs)
app.get('/api/favorites', async (req, res) => {
  const userId = req.query.userId || 'default';
  
  try {
    const favorites = await new Promise((resolve, reject) => {
      db.all(
        `SELECT song_id, song_name, artist, created_at 
         FROM user_feedback 
         WHERE user_id = ? AND action = 'like'
         ORDER BY created_at DESC
         LIMIT 100`,
        [userId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
    
    res.json({ success: true, favorites });
  } catch (error) {
    console.error('Favorites error:', error);
    res.status(500).json({ error: 'Failed to get favorites' });
  }
});

// Get Play History
app.get('/api/history', async (req, res) => {
  const userId = req.query.userId || 'default';
  const { limit = 50 } = req.query;
  
  try {
    const history = await new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM play_history 
         WHERE user_id = ?
         ORDER BY played_at DESC
         LIMIT ?`,
        [userId, parseInt(limit)],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
    
    res.json({ success: true, history });
  } catch (error) {
    console.error('History error:', error);
    res.status(500).json({ error: 'Failed to get history' });
  }
});

// Add Song to Favorites
app.post('/api/favorites/add', async (req, res) => {
  const { songId, songName, artist } = req.body;
  const userId = req.body.userId || 'default';
  
  if (!songId) {
    return res.status(400).json({ error: 'Song ID is required' });
  }

  try {
    db.run(
      `INSERT OR REPLACE INTO user_feedback 
       (user_id, song_id, song_name, artist, action, created_at)
       VALUES (?, ?, ?, ?, 'like', ?)`,
      [userId, songId, songName || 'Unknown', artist || 'Unknown', new Date().toISOString()],
      (err) => {
        if (err) {
          console.error('Add favorite error:', err);
          res.status(500).json({ error: 'Failed to add favorite' });
        } else {
          res.json({ success: true, message: 'Added to favorites' });
        }
      }
    );
  } catch (error) {
    console.error('Add favorite error:', error);
    res.status(500).json({ error: 'Failed to add favorite' });
  }
});

// Remove Song from Favorites
app.post('/api/favorites/remove', async (req, res) => {
  const { songId } = req.body;
  const userId = req.body.userId || 'default';
  
  if (!songId) {
    return res.status(400).json({ error: 'Song ID is required' });
  }

  try {
    db.run(
      `DELETE FROM user_feedback WHERE user_id = ? AND song_id = ? AND action = 'like'`,
      [userId, songId],
      (err) => {
        if (err) {
          console.error('Remove favorite error:', err);
          res.status(500).json({ error: 'Failed to remove favorite' });
        } else {
          res.json({ success: true, message: 'Removed from favorites' });
        }
      }
    );
  } catch (error) {
    console.error('Remove favorite error:', error);
    res.status(500).json({ error: 'Failed to remove favorite' });
  }
});

// Check if Song is Favorite
app.get('/api/favorites/check', async (req, res) => {
  const { songId } = req.query;
  const userId = req.query.userId || 'default';
  
  if (!songId) {
    return res.status(400).json({ error: 'Song ID is required' });
  }

  try {
    const result = await new Promise((resolve, reject) => {
      db.get(
        `SELECT id FROM user_feedback 
         WHERE user_id = ? AND song_id = ? AND action = 'like'`,
        [userId, songId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
    
    res.json({ success: true, isFavorite: !!result });
  } catch (error) {
    console.error('Check favorite error:', error);
    res.status(500).json({ error: 'Failed to check favorite' });
  }
});

// Clear Play History
app.post('/api/history/clear', async (req, res) => {
  const userId = req.body.userId || 'default';
  
  try {
    db.run(
      `DELETE FROM play_history WHERE user_id = ?`,
      [userId],
      (err) => {
        if (err) {
          console.error('Clear history error:', err);
          res.status(500).json({ error: 'Failed to clear history' });
        } else {
          res.json({ success: true, message: 'History cleared' });
        }
      }
    );
  } catch (error) {
    console.error('Clear history error:', error);
    res.status(500).json({ error: 'Failed to clear history' });
  }
});

// Get User Stats
app.get('/api/stats', async (req, res) => {
  const userId = req.query.userId || 'default';
  
  try {
    const stats = await userProfile.getStats(userId);
    res.json({ success: true, stats });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// Get detailed user profile analysis
app.get('/api/profile/analysis', async (req, res) => {
  const userId = req.query.userId || 'default';
  
  try {
    const analysis = await userProfile.getDetailedAnalysis(userId);
    res.json({ success: true, analysis });
  } catch (error) {
    console.error('Profile analysis error:', error);
    res.status(500).json({ error: 'Failed to get profile analysis' });
  }
});

// Get listening patterns
app.get('/api/profile/listening-patterns', async (req, res) => {
  const userId = req.query.userId || 'default';
  
  try {
    const prefs = await userProfile.getPreferences(userId);
    const patterns = await userProfile.analyzeListeningPatterns(userId);
    res.json({ success: true, patterns });
  } catch (error) {
    console.error('Listening patterns error:', error);
    res.status(500).json({ error: 'Failed to get listening patterns' });
  }
});

// Get preferred time slots
app.get('/api/profile/time-preferences', async (req, res) => {
  const userId = req.query.userId || 'default';
  
  try {
    const timeSlots = await userProfile.analyzePreferredTimeSlots(userId);
    res.json({ success: true, timeSlots });
  } catch (error) {
    console.error('Time preferences error:', error);
    res.status(500).json({ error: 'Failed to get time preferences' });
  }
});

// Get artist insights
app.get('/api/profile/artist-insights', async (req, res) => {
  const userId = req.query.userId || 'default';
  
  try {
    const insights = await userProfile.analyzeArtistInsights(userId);
    res.json({ success: true, insights });
  } catch (error) {
    console.error('Artist insights error:', error);
    res.status(500).json({ error: 'Failed to get artist insights' });
  }
});

// Get Play History
app.get('/api/history', async (req, res) => {
  const { limit = 50 } = req.query;
  
  try {
    const history = await musicService.getHistory(parseInt(limit));
    res.json({ success: true, history });
  } catch (error) {
    console.error('History error:', error);
    res.status(500).json({ error: 'Failed to get history' });
  }
});

// ==================== Hermes Chat APIs ====================

// Chat with Hermes AI
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  const userId = req.body.userId || 'default';
  
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    // Get current playing song and scene for context
    const status = musicService.getStatus();
    const scene = await getCurrentScene();
    
    const context = {
      userId,
      currentSong: status.currentSong,
      scene: {
        timeOfDay: scene.timeOfDay,
        weather: scene.weather,
        mood: scene.mood
      }
    };
    
    const response = await hermesService.chat(userId, message, context);
    res.json({ success: true, ...response });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Chat failed' });
  }
});

// Get Chat History
app.get('/api/chat/history', (req, res) => {
  const userId = req.query.userId || 'default';
  const history = hermesService.getConversationHistory(userId);
  res.json({ success: true, history });
});

// Clear Chat History
app.post('/api/chat/clear', (req, res) => {
  const userId = req.body.userId || 'default';
  hermesService.clearHistory(userId);
  res.json({ success: true, message: 'History cleared' });
});

// ==================== Radio Host APIs ====================

// Generate welcome message
app.get('/api/radio/welcome', async (req, res) => {
  try {
    const script = await radioHostService.generateWelcomeMessage();
    res.json({ success: true, script });
  } catch (error) {
    console.error('Welcome generation error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate welcome' });
  }
});

// Generate playlist intro
app.post('/api/radio/playlist-intro', async (req, res) => {
  try {
    const { songs } = req.body;
    const scene = await getCurrentScene();
    const script = await radioHostService.generatePlaylistIntro(songs, scene);
    res.json({ success: true, script });
  } catch (error) {
    console.error('Playlist intro error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate intro' });
  }
});

// Generate song intro
app.post('/api/radio/song-intro', async (req, res) => {
  try {
    const { song } = req.body;
    const scene = await getCurrentScene();
    const script = await radioHostService.generateSongIntro(song, scene);
    res.json({ success: true, script });
  } catch (error) {
    console.error('Song intro error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate song intro' });
  }
});

// Generate song outro
app.post('/api/radio/song-outro', async (req, res) => {
  try {
    const { song } = req.body;
    const script = await radioHostService.generateSongOutro(song);
    res.json({ success: true, script });
  } catch (error) {
    console.error('Song outro error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate outro' });
  }
});

// Generate closing message
app.get('/api/radio/closing', async (req, res) => {
  try {
    const script = await radioHostService.generateClosingMessage();
    res.json({ success: true, script });
  } catch (error) {
    console.error('Closing generation error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate closing' });
  }
});

// Get today's playlist
app.get('/api/radio/playlist', async (req, res) => {
  try {
    const scene = await getCurrentScene();
    
    // Generate 5 unique songs for the playlist using the new method
    const recommendations = await recommendationEngine.getRecommendations(5, { scene });
    const playlist = recommendations.filter(r => r && r.song).map(r => r.song);
    
    radioHostService.setPlaylist(playlist);
    res.json({ success: true, songs: playlist });
  } catch (error) {
    console.error('Playlist generation error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate playlist' });
  }
});

// Mark song as played (to avoid repeats)
app.post('/api/radio/mark-played', (req, res) => {
  try {
    const { songId } = req.body;
    if (songId) {
      recommendationEngine.markSongAsPlayed(songId);
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Mark played error:', error);
    res.status(500).json({ success: false, error: 'Failed to mark song as played' });
  }
});

// Clear played songs history
app.post('/api/radio/clear-played', (req, res) => {
  try {
    recommendationEngine.clearPlayedSongs();
    res.json({ success: true });
  } catch (error) {
    console.error('Clear played error:', error);
    res.status(500).json({ success: false, error: 'Failed to clear played songs' });
  }
});

// Get daily mix recommendation (balanced playlist with variety)
app.get('/api/recommend/daily-mix', async (req, res) => {
  const { count = 5 } = req.query;
  const userId = req.query.userId || 'default';
  
  try {
    const scene = await getCurrentScene();
    const recommendations = await recommendationEngine.getDailyMix(parseInt(count), { userId, scene });
    
    res.json({
      success: true,
      recommendations,
      scene: scene.timeOfDay
    });
  } catch (error) {
    console.error('Daily mix error:', error);
    res.status(500).json({ error: 'Failed to generate daily mix' });
  }
});

// Get exploration recommendation (discover new styles)
app.get('/api/recommend/explore', async (req, res) => {
  const userId = req.query.userId || 'default';
  
  try {
    const recommendation = await recommendationEngine.recommendExploration({ userId });
    
    if (!recommendation || !recommendation.song) {
      return res.status(404).json({ error: 'No exploration recommendation available' });
    }

    res.json({
      success: true,
      recommendation
    });
  } catch (error) {
    console.error('Exploration error:', error);
    res.status(500).json({ error: 'Failed to get exploration recommendation' });
  }
});

// Get similar songs recommendation
app.get('/api/recommend/similar', async (req, res) => {
  const { songId, songName, artist, album } = req.query;
  
  if (!songId && !songName) {
    return res.status(400).json({ error: 'Song ID or name is required' });
  }
  
  try {
    const seedSong = { id: songId, name: songName, artist, album };
    const recommendations = await recommendationEngine.recommendSimilarTo(seedSong, 3);
    
    res.json({
      success: true,
      recommendations
    });
  } catch (error) {
    console.error('Similar songs error:', error);
    res.status(500).json({ error: 'Failed to get similar songs' });
  }
});

// Get time-context recommendation
app.get('/api/recommend/time-context', async (req, res) => {
  const userId = req.query.userId || 'default';
  
  try {
    const scene = await getCurrentScene();
    const recommendation = await recommendationEngine.recommendByTimeContext({ userId, scene });
    
    if (!recommendation || !recommendation.song) {
      return res.status(404).json({ error: 'No time-context recommendation available' });
    }

    res.json({
      success: true,
      recommendation,
      context: recommendation.context
    });
  } catch (error) {
    console.error('Time-context error:', error);
    res.status(500).json({ error: 'Failed to get time-context recommendation' });
  }
});

// Get recommendation statistics
app.get('/api/recommend/stats', (req, res) => {
  res.json({
    success: true,
    stats: {
      playedSongsCount: recommendationEngine.playedSongs.size,
      recentRecsCount: recommendationEngine.recentRecommendations.length,
      diversityThreshold: recommendationEngine.diversityThreshold,
      noveltyBoost: recommendationEngine.noveltyBoost
    }
  });
});

// ==================== Library APIs ====================

// Get Local Library
app.get('/api/library', (req, res) => {
  db.all('SELECT * FROM local_library ORDER BY play_count DESC', (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true, library: rows });
  });
});

// Add to Library
app.post('/api/library', (req, res) => {
  const { songId, songName, artist, album, styles } = req.body;
  
  db.run(
    `INSERT INTO local_library (song_id, song_name, artist, album, styles)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(song_id) DO UPDATE SET
     play_count = play_count + 1`,
    [songId, songName, artist, album, JSON.stringify(styles || [])],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ success: true, message: 'Added to library' });
    }
  );
});

// ==================== Playlist Management APIs ====================

// Get User's Playlists
app.get('/api/playlists', (req, res) => {
  const userId = req.query.userId || 'default';
  
  db.all(
    `SELECT * FROM playlists WHERE user_id = ? ORDER BY updated_at DESC`,
    [userId],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ success: true, playlists: rows });
    }
  );
});

// Create New Playlist
app.post('/api/playlists', (req, res) => {
  const { name, description } = req.body;
  const userId = req.body.userId || 'default';
  
  if (!name) {
    return res.status(400).json({ error: 'Playlist name is required' });
  }

  db.run(
    `INSERT INTO playlists (user_id, name, description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, name, description || '', new Date().toISOString(), new Date().toISOString()],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ success: true, playlistId: this.lastID, message: 'Playlist created' });
    }
  );
});

// Get Playlist Details with Songs
app.get('/api/playlists/:id', (req, res) => {
  const { id } = req.params;
  const userId = req.query.userId || 'default';
  
  db.get(
    `SELECT * FROM playlists WHERE id = ? AND user_id = ?`,
    [id, userId],
    (err, playlist) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (!playlist) {
        return res.status(404).json({ error: 'Playlist not found' });
      }
      
      db.all(
        `SELECT ps.position, s.* FROM playlist_songs ps 
         JOIN songs s ON ps.song_id = s.id 
         WHERE ps.playlist_id = ? 
         ORDER BY ps.position`,
        [id],
        (err, songs) => {
          if (err) {
            return res.status(500).json({ error: err.message });
          }
          res.json({ success: true, playlist, songs });
        }
      );
    }
  );
});

// Add Song to Playlist
app.post('/api/playlists/:id/songs', (req, res) => {
  const { id } = req.params;
  const { songId } = req.body;
  const userId = req.body.userId || 'default';
  
  if (!songId) {
    return res.status(400).json({ error: 'Song ID is required' });
  }

  // Verify playlist ownership
  db.get(
    `SELECT id FROM playlists WHERE id = ? AND user_id = ?`,
    [id, userId],
    (err, playlist) => {
      if (err || !playlist) {
        return res.status(404).json({ error: 'Playlist not found' });
      }
      
      // Get current max position
      db.get(
        `SELECT MAX(position) as maxPos FROM playlist_songs WHERE playlist_id = ?`,
        [id],
        (err, result) => {
          const newPosition = (result?.maxPos || 0) + 1;
          
          db.run(
            `INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id, position) VALUES (?, ?, ?)`,
            [id, songId, newPosition],
            function(err) {
              if (err) {
                return res.status(500).json({ error: err.message });
              }
              
              // Update playlist timestamp
              db.run(
                `UPDATE playlists SET updated_at = ? WHERE id = ?`,
                [new Date().toISOString(), id]
              );
              
              res.json({ success: true, message: 'Song added to playlist' });
            }
          );
        }
      );
    }
  );
});

// Remove Song from Playlist
app.delete('/api/playlists/:id/songs/:songId', (req, res) => {
  const { id, songId } = req.params;
  const userId = req.query.userId || 'default';
  
  // Verify playlist ownership
  db.get(
    `SELECT id FROM playlists WHERE id = ? AND user_id = ?`,
    [id, userId],
    (err, playlist) => {
      if (err || !playlist) {
        return res.status(404).json({ error: 'Playlist not found' });
      }
      
      db.run(
        `DELETE FROM playlist_songs WHERE playlist_id = ? AND song_id = ?`,
        [id, songId],
        function(err) {
          if (err) {
            return res.status(500).json({ error: err.message });
          }
          
          db.run(
            `UPDATE playlists SET updated_at = ? WHERE id = ?`,
            [new Date().toISOString(), id]
          );
          
          res.json({ success: true, message: 'Song removed from playlist' });
        }
      );
    }
  );
});

// Delete Playlist
app.delete('/api/playlists/:id', (req, res) => {
  const { id } = req.params;
  const userId = req.query.userId || 'default';
  
  // Verify playlist ownership and delete
  db.run(
    `DELETE FROM playlists WHERE id = ? AND user_id = ?`,
    [id, userId],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Playlist not found' });
      }
      
      // Also delete playlist songs
      db.run(`DELETE FROM playlist_songs WHERE playlist_id = ?`, [id]);
      
      res.json({ success: true, message: 'Playlist deleted' });
    }
  );
});

// Export Playlist (as JSON)
app.get('/api/playlists/:id/export', (req, res) => {
  const { id } = req.params;
  const userId = req.query.userId || 'default';
  
  db.get(
    `SELECT * FROM playlists WHERE id = ? AND user_id = ?`,
    [id, userId],
    (err, playlist) => {
      if (err || !playlist) {
        return res.status(404).json({ error: 'Playlist not found' });
      }
      
      db.all(
        `SELECT s.* FROM playlist_songs ps 
         JOIN songs s ON ps.song_id = s.id 
         WHERE ps.playlist_id = ? 
         ORDER BY ps.position`,
        [id],
        (err, songs) => {
          if (err) {
            return res.status(500).json({ error: err.message });
          }
          
          const exportData = {
            name: playlist.name,
            description: playlist.description,
            exportedAt: new Date().toISOString(),
            songCount: songs.length,
            songs: songs.map(s => ({
              id: s.id,
              name: s.name,
              artist: s.artist,
              album: s.album,
              duration: s.duration
            }))
          };
          
          res.json({ success: true, playlist: exportData });
        }
      );
    }
  );
});

// Import Playlist (from JSON)
app.post('/api/playlists/import', async (req, res) => {
  const { playlistData, songs } = req.body;
  const userId = req.body.userId || 'default';
  
  if (!playlistData || !playlistData.name) {
    return res.status(400).json({ error: 'Invalid playlist data' });
  }

  // Create playlist
  db.run(
    `INSERT INTO playlists (user_id, name, description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, playlistData.name, playlistData.description || '', new Date().toISOString(), new Date().toISOString()],
    async function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      const playlistId = this.lastID;
      
      // Add songs to playlist
      if (songs && songs.length > 0) {
        let position = 1;
        for (const song of songs) {
          // Try to find song in database
          db.get(`SELECT id FROM songs WHERE id = ?`, [song.id], (err, existingSong) => {
            if (existingSong) {
              db.run(
                `INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id, position) VALUES (?, ?, ?)`,
                [playlistId, song.id, position++]
              );
            }
          });
        }
      }
      
      res.json({ 
        success: true, 
        playlistId,
        message: 'Playlist imported successfully',
        songCount: songs?.length || 0
      });
    }
  );
});

// ==================== OAuth Login APIs ====================

// 1. 开始登录 - 生成登录链接
app.post('/api/auth/login', async (req, res) => {
  try {
    // 重置登录会话
    loginSession.isLoggingIn = true;
    loginSession.startTime = Date.now();
    loginSession.loginUrl = null;
    loginSession.loginCompleted = false;
    
    // 如果之前有登录进程，终止它
    if (loginSession.loginProcess) {
      try {
        loginSession.loginProcess.kill();
      } catch (e) {}
    }
    
    console.log('[登录] 开始生成新的登录链接...');
    
    // 使用非阻塞方式执行登录命令
    const fullCommand = `npx @music163/ncm-cli login`;
    
    const env = {
      ...process.env,
      HOME: PROJECT_HOME,
      USERPROFILE: PROJECT_HOME,
      XDG_CONFIG_HOME: path.join(PROJECT_HOME, '.config')
    };
    
    // 执行命令并捕获输出
    const child = exec(fullCommand, { 
      timeout: 300000,
      encoding: 'utf8',
      env: env
    }, (error, stdout, stderr) => {
      loginSession.isLoggingIn = false;
      loginSession.loginCompleted = true;
      console.log('[登录] CLI登录进程结束');
    });
    
    loginSession.loginProcess = child;
    
    // 监听输出以提取登录链接
    let outputBuffer = '';
    let loginUrlFound = false;
    
    const extractInfo = (data) => {
      outputBuffer += data;
      console.log('[登录] CLI输出:', data.substring(0, 200));
      
      // 查找 https://163cn.tv/ 链接
      const urlMatch = outputBuffer.match(/https:\/\/163cn\.tv\/[a-zA-Z0-9]+/);
      if (urlMatch && !loginUrlFound) {
        loginUrlFound = true;
        loginSession.loginUrl = urlMatch[0];
        console.log('[登录] 获取到登录链接:', loginSession.loginUrl);
      }
      
      // 检测登录成功
      if (data.includes('登录成功') || data.includes('logged in') || data.includes('success')) {
        console.log('[登录] 检测到登录成功信息');
        loginSession.loginCompleted = true;
      }
    };
    
    child.stdout?.on('data', extractInfo);
    child.stderr?.on('data', extractInfo);
    
    // 轮询等待链接生成，最多等待15秒
    let waitTime = 0;
    const maxWaitTime = 15000;
    const checkInterval = 500;
    
    while (waitTime < maxWaitTime && !loginSession.loginUrl) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      waitTime += checkInterval;
    }
    
    if (loginSession.loginUrl) {
      console.log('[登录] 返回登录链接:', loginSession.loginUrl);
      res.json({
        success: true,
        message: '登录链接已生成',
        loginUrl: loginSession.loginUrl
      });
    } else {
      console.error('[登录] 未能获取登录链接');
      loginSession.isLoggingIn = false;
      try {
        child.kill();
      } catch (e) {}
      res.status(500).json({
        success: false,
        message: '获取登录链接失败，请重试'
      });
    }
  } catch (err) {
    console.error('登录失败：', err);
    loginSession.isLoggingIn = false;
    res.status(500).json({ 
      success: false,
      message: '登录失败',
      error: err.message 
    });
  }
});

// 2. 检查登录状态
app.get('/api/auth/status', async (req, res) => {
  try {
    console.log('[登录检查] 开始检查登录状态...');

    // Use login --check to verify actual login status
    const output = await executeCLICommand('login', ['--check']);
    console.log('[登录检查] CLI输出:', output);

    let isLoggedIn = false;
    try {
      const jsonOutput = JSON.parse(output);
      // success 为 true 表示已登录
      isLoggedIn = jsonOutput.success === true;
    } catch (e) {
      // 如果解析失败，检查输出内容
      isLoggedIn = output.includes('"success": true') || output.includes('logged in');
    }

    console.log('[登录检查] 登录状态:', isLoggedIn);

    res.json({
      success: true,
      isLoggedIn: isLoggedIn,
      message: isLoggedIn ? '已登录' : '未登录'
    });
  } catch (err) {
    console.error('[登录检查] 检查失败：', err);
    // 如果执行出错，可能是未登录状态
    res.json({
      success: true,
      isLoggedIn: false,
      message: '未登录'
    });
  }
});

// 3. 退出登录
app.post('/api/auth/logout', async (req, res) => {
  try {
    await executeCLICommand('logout');
    res.json({ success: true, message: '已退出登录' });
  } catch (err) {
    console.error('退出登录失败：', err);
    res.status(500).json({ 
      success: false,
      message: '退出登录失败',
      error: err.message 
    });
  }
});

// 4. 获取登录链接 (GET 方式，供前端直接调用)
app.get('/api/login-url', async (req, res) => {
  try {
    // 重置登录会话
    loginSession.isLoggingIn = true;
    loginSession.startTime = Date.now();
    loginSession.loginUrl = null;
    loginSession.loginCompleted = false;
    
    // 如果之前有登录进程，终止它
    if (loginSession.loginProcess) {
      try {
        loginSession.loginProcess.kill();
      } catch (e) {}
    }
    
    console.log('[登录] 开始生成新的登录链接...');
    
    // 使用非阻塞方式执行登录命令
    const fullCommand = `npx @music163/ncm-cli login`;
    
    const env = {
      ...process.env,
      HOME: PROJECT_HOME,
      USERPROFILE: PROJECT_HOME,
      XDG_CONFIG_HOME: path.join(PROJECT_HOME, '.config')
    };
    
    // 执行命令并捕获输出
    const child = exec(fullCommand, { 
      timeout: 300000,
      encoding: 'utf8',
      env: env
    }, (error, stdout, stderr) => {
      loginSession.isLoggingIn = false;
      loginSession.loginCompleted = true;
      console.log('[登录] CLI登录进程结束');
    });
    
    loginSession.loginProcess = child;
    
    // 监听输出以提取登录链接
    let outputBuffer = '';
    let loginUrlFound = false;
    
    const extractInfo = (data) => {
      outputBuffer += data;
      console.log('[登录] CLI输出:', data.substring(0, 200));
      
      // 查找 https://163cn.tv/ 链接
      const urlMatch = outputBuffer.match(/https:\/\/163cn\.tv\/[a-zA-Z0-9]+/);
      if (urlMatch && !loginUrlFound) {
        loginUrlFound = true;
        loginSession.loginUrl = urlMatch[0];
        console.log('[登录] 获取到登录链接:', loginSession.loginUrl);
      }
      
      // 检测登录成功
      if (data.includes('登录成功') || data.includes('logged in') || data.includes('success')) {
        console.log('[登录] 检测到登录成功信息');
        loginSession.loginCompleted = true;
      }
    };
    
    child.stdout?.on('data', extractInfo);
    child.stderr?.on('data', extractInfo);
    
    // 轮询等待链接生成，最多等待15秒
    let waitTime = 0;
    const maxWaitTime = 15000;
    const checkInterval = 500;
    
    while (waitTime < maxWaitTime && !loginSession.loginUrl) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      waitTime += checkInterval;
    }
    
    if (loginSession.loginUrl) {
      console.log('[登录] 返回登录链接:', loginSession.loginUrl);
      res.json({
        success: true,
        message: '登录链接已生成',
        loginUrl: loginSession.loginUrl
      });
    } else {
      console.error('[登录] 未能获取登录链接');
      loginSession.isLoggingIn = false;
      try {
        child.kill();
      } catch (e) {}
      res.status(500).json({
        success: false,
        message: '获取登录链接失败，请重试'
      });
    }
  } catch (err) {
    console.error('登录失败：', err);
    loginSession.isLoggingIn = false;
    res.status(500).json({ 
      success: false,
      message: '登录失败',
      error: err.message 
    });
  }
});

// ==================== MiniMax TTS API ====================

// MiniMax 语音合成配置（从环境变量读取，保护密钥安全）
const MINIMAX_TTS_CONFIG = {
  api_key: process.env.MINIMAX_API_KEY || 'sk-cp-18ClTeRjxT0p-1LMOYNP0XFi1Fe3oBZT9UcbDV6C3sAuwtlos-u15B4e0RFPugyGuXkNmQ8b-yJr07Sa9z3mQ64RkNFShInJu5-xDEbVlAHqCVKdu42OBSI',
  group_id: process.env.MINIMAX_GROUP_ID || '',
  api_url: 'https://api.minimaxi.com/v1/t2a_v2'
};

// MiniMax 推荐音色列表
const RECOMMENDED_VOICES = {
  // 磁性男声
  male_magnetic: [
    { id: 'male-qn-qingse', name: '青涩青年', desc: '青涩男声' },
    { id: 'male-qn-jingying', name: '精英青年', desc: '精英男声' },
    { id: 'male-qn-badao', name: '霸道青年', desc: '霸道男声' },
    { id: 'male-qn-daxuesheng', name: '青年大学生', desc: '大学生音色' },
    { id: 'presenter_male', name: '男性主持人', desc: '主持人男声' },
    { id: 'audiobook_male_1', name: '男性有声书1', desc: '有声书男声' },
    { id: 'audiobook_male_2', name: '男性有声书2', desc: '有声书男声2' }
  ],
  // 温暖女声
  female_warm: [
    { id: 'female-shaonv', name: '少女', desc: '少女音色' },
    { id: 'female-yujie', name: '御姐', desc: '御姐音色' },
    { id: 'female-chengshu', name: '成熟女性', desc: '成熟女声' },
    { id: 'female-tianmei', name: '甜美女性', desc: '甜美女声' },
    { id: 'presenter_female', name: '女性主持人', desc: '主持人女声' },
    { id: 'audiobook_female_1', name: '女性有声书1', desc: '有声书女声' },
    { id: 'audiobook_female_2', name: '女性有声书2', desc: '有声书女声2' }
  ]
};

// 获取音色列表
app.get('/api/tts/voices', (req, res) => {
  res.json({
    success: true,
    data: RECOMMENDED_VOICES,
    message: '获取音色列表成功'
  });
});

// MiniMax 语音合成接口
app.post('/api/tts/doubao', async (req, res) => {
  try {
    const { text, voice_type = 'female-yujie', speed = 1.0, vol = 1.0, pitch = 0 } = req.body;

    if (!text) {
      return res.status(400).json({ success: false, message: '缺少文本参数' });
    }

    // 检查配置
    if (!MINIMAX_TTS_CONFIG.api_key) {
      return res.status(500).json({
        success: false,
        message: 'MiniMax API未配置，请设置环境变量 MINIMAX_API_KEY',
        config_required: true
      });
    }

    // 构建 MiniMax API 请求体
    const requestData = {
      model: 'speech-2.8-hd',
      text: text,
      voice_setting: {
        voice_id: voice_type,
        speed: speed,
        vol: vol,
        pitch: pitch
      },
      audio_setting: {
        sample_rate: 32000,
        bitrate: 128000,
        format: 'mp3',
        channel: 1
      }
    };

    console.log(`[TTS] 合成请求: ${text.substring(0, 50)}...`);
    console.log(`[TTS] 使用音色: ${voice_type}`);

    // 构建请求URL（包含group_id）
    let apiUrl = MINIMAX_TTS_CONFIG.api_url;
    if (MINIMAX_TTS_CONFIG.group_id) {
      apiUrl += `?GroupId=${MINIMAX_TTS_CONFIG.group_id}`;
    }

    const response = await axios.post(
      apiUrl,
      requestData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${MINIMAX_TTS_CONFIG.api_key}`
        },
        timeout: 30000
      }
    );

    console.log('[TTS] 响应状态:', response.status);

    // MiniMax 返回的音频数据在 data.audio 中（hex编码）
    if (response.data && response.data.data && response.data.data.audio) {
      // 将 hex 转换为 base64
      const audioHex = response.data.data.audio;
      const audioBuffer = Buffer.from(audioHex, 'hex');
      const audioBase64 = audioBuffer.toString('base64');

      res.json({
        success: true,
        data: {
          audio: audioBase64,
          format: 'mp3',
          text: text,
          voice_type: voice_type
        },
        message: '语音合成成功'
      });
      console.log('[TTS] 合成成功，音频大小:', audioBase64.length, 'bytes');
    } else if (response.data && response.data.base_resp && response.data.base_resp.status_code !== 0) {
      res.status(500).json({
        success: false,
        message: '语音合成失败: ' + (response.data.base_resp.status_msg || '未知错误')
      });
    } else {
      res.status(500).json({
        success: false,
        message: '语音合成失败: 未获取到音频数据',
        raw_response: JSON.stringify(response.data).substring(0, 500)
      });
    }
  } catch (error) {
    console.error('[TTS] 错误:', error.message);
    res.status(500).json({
      success: false,
      message: '语音合成失败: ' + error.message,
      error: error.response?.data || error.message
    });
  }
});

// 检查 MiniMax 语音配置状态
app.get('/api/tts/status', (req, res) => {
  const isConfigured = !!(MINIMAX_TTS_CONFIG.api_key);
  res.json({
    success: true,
    data: {
      configured: isConfigured,
      has_api_key: !!MINIMAX_TTS_CONFIG.api_key,
      has_group_id: !!MINIMAX_TTS_CONFIG.group_id
    }
  });
});

// ==================== Start Server ====================
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════╗
║                                                ║
║   🎵 Hermudio - AI Personalized Radio         ║
║                                                ║
║   Server running on http://localhost:${PORT}    ║
║                                                ║
║   Features:                                    ║
║   • AI Recommendation Engine                   ║
║   • Scene-based Auto-play                      ║
║   • Hermes AI Chat                             ║
║   • User Profile Learning                      ║
║                                                ║
╚════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  db.close(() => {
    process.exit(0);
  });
});
