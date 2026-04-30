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
const PROJECT_HOME = path.join('/Users/bytedance/claudio', '.ncm-home');
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
    const playlist = [];
    const scene = await getCurrentScene();
    
    // Generate 5 songs for the playlist
    for (let i = 0; i < 5; i++) {
      const recommendation = await recommendationEngine.getRecommendation({ scene });
      if (recommendation && recommendation.song) {
        playlist.push(recommendation.song);
      }
    }
    
    radioHostService.setPlaylist(playlist);
    res.json({ success: true, songs: playlist });
  } catch (error) {
    console.error('Playlist generation error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate playlist' });
  }
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
    
    // ncm-cli state 返回 JSON 格式
    const output = await executeCLICommand('state', []);
    console.log('[登录检查] CLI输出:', output);
    
    let isLoggedIn = false;
    try {
      const jsonOutput = JSON.parse(output);
      // success 为 true 表示已登录
      isLoggedIn = jsonOutput.success === true;
    } catch (e) {
      // 如果解析失败，检查输出内容
      isLoggedIn = output.includes('"success": true') || output.includes('"status":');
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
