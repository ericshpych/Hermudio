/**
 * Music Service for Hermudio
 * 
 * Handles music search and playback via ncm-cli integration
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const execAsync = promisify(exec);
const fetch = require('node-fetch');

// Project config directory (same as server.js)
const PROJECT_HOME = path.join(__dirname, '..', '..', '.ncm-home');

class MusicService {
  constructor(db) {
    this.db = db;
    this.currentSong = null;
    this.isPlaying = false;
    this.playHistory = [];
    this.playQueue = []; // 播放队列，用于上一曲/下一曲
    this.currentQueueIndex = -1; // 当前播放位置
    this.ncmLoggedIn = null; // Cache login status
    this.checkNcmLogin();
  }

  /**
   * Get environment with project HOME
   */
  getEnv() {
    return {
      ...process.env,
      HOME: PROJECT_HOME,
      USERPROFILE: PROJECT_HOME,
      XDG_CONFIG_HOME: path.join(PROJECT_HOME, '.config')
    };
  }

  /**
   * Check if ncm-cli is logged in
   */
  async checkNcmLogin() {
    try {
      // Use login --check to verify actual login status
      const command = `npx @music163/ncm-cli login --check`;
      const { stdout } = await execAsync(command, {
        timeout: 5000,
        env: this.getEnv()
      });

      // ncm-cli login --check returns JSON format
      let isLoggedIn = false;
      try {
        const jsonOutput = JSON.parse(stdout);
        // success 为 true 表示已登录
        isLoggedIn = jsonOutput.success === true;
      } catch (e) {
        // If parsing fails, check output content
        isLoggedIn = stdout.includes('"success": true') || stdout.includes('logged in');
      }

      this.ncmLoggedIn = isLoggedIn;
      console.log('[MusicService] ncm-cli login status:', isLoggedIn ? 'logged in' : 'not logged in');
      return this.ncmLoggedIn;
    } catch (error) {
      console.log('[MusicService] ncm-cli not logged in or not available:', error.message);
      this.ncmLoggedIn = false;
      return false;
    }
  }

  /**
   * Get ncm-cli login status
   */
  isNcmLoggedIn() {
    return this.ncmLoggedIn;
  }

  /**
   * Search songs using ncm-cli to get real encrypted IDs
   */
  async searchSongs(keyword, limit = 10) {
    console.log(`[MusicService] Searching for: ${keyword}`);

    try {
      // Use ncm-cli search to get real encrypted IDs
      const command = `npx @music163/ncm-cli search song --keyword "${keyword}" --limit ${limit} --output json`;
      const { stdout } = await execAsync(command, {
        timeout: 10000,
        env: this.getEnv()
      });

      // Parse JSON response
      const data = JSON.parse(stdout);

      if (!data || !data.data || !data.data.records || data.data.records.length === 0) {
        console.log('[MusicService] No search results found from ncm-cli');
        return this.getMockSongs(keyword, limit);
      }

      // Map to unified format with encryptedId and originalId from ncm-cli
      const songs = data.data.records.map(song => {
        return {
          id: song.id, // encryptedId from ncm-cli
          encryptedId: song.id,
          originalId: song.originalId,
          name: song.name,
          artist: song.artists?.map(a => a.name).join(', ') || 'Unknown',
          album: song.album?.name || 'Unknown',
          duration: song.duration,
          canPlay: song.plLevel !== 'none' && song.userMaxBr > 0,
          vipFlag: song.vipFlag || false,
          coverImgUrl: song.coverImgUrl || ''
        };
      });

      console.log(`[MusicService] Found ${songs.length} songs from ncm-cli`);
      return songs;
    } catch (error) {
      console.error('[MusicService] ncm-cli search failed:', error.message);
      // Fallback to mock data for development
      return this.getMockSongs(keyword, limit);
    }
  }
  
  /**
   * Encrypt song ID to 32-char hex format for ncm-cli
   * This is a simplified version - real encryption is more complex
   */
  encryptSongId(songId) {
    // For now, return a placeholder that ncm-cli might accept
    // In production, this should use the proper NetEase encryption algorithm
    const idStr = songId.toString();
    // Create a simple hash-like string
    let hash = '';
    for (let i = 0; i < 32; i++) {
      const charCode = idStr.charCodeAt(i % idStr.length);
      hash += ((charCode * (i + 1)) % 16).toString(16).toUpperCase();
    }
    return hash;
  }

  /**
   * Get song URL for playback
   * Note: ncm-cli doesn't provide a direct URL command
   * The play command handles URL retrieval internally
   */
  async getSongUrl(songId) {
    // ncm-cli play command handles URL internally
    // This method is kept for compatibility but returns null
    console.log('[MusicService] getSongUrl is not supported by ncm-cli, use play command instead');
    return null;
  }

  /**
   * Play a song using ncm-cli
   * Falls back to mock mode if ncm-cli is not available
   */
  async playSong(songId, encryptedId = null) {
    try {
      // Check ncm login status first
      const isLoggedIn = await this.checkNcmLogin();
      
      if (!isLoggedIn) {
        console.log('[MusicService] ncm-cli not logged in, returning login required');
        return {
          success: false,
          error: 'ncm_not_logged_in',
          message: '请先登录网易云音乐',
          loginRequired: true
        };
      }

      // Stop current playback if any
      await this.stop();

      // Get song details first
      const details = await this.getSongDetails(songId);
      if (details) {
        this.currentSong = details;
      } else {
        this.currentSong = { id: songId };
      }
      this.isPlaying = true;
      
      // Add to history
      await this.addToHistory(songId);
      
      // Try to play with ncm-cli
      // ncm-cli play requires --song --encrypted-id <id> --original-id <id>
      try {
        // We need both encryptedId and originalId
        // If encryptedId is not provided, we need to search for it
        let originalId = songId;
        let encId = encryptedId;
        
        // If songId looks like an encryptedId (32 hex chars), we need to find originalId
        if (/^[A-F0-9]{32}$/i.test(songId)) {
          encId = songId;
          // Try to get originalId from details or search
          if (details && details.originalId && /^\d+$/.test(details.originalId)) {
            originalId = details.originalId;
            console.log(`[MusicService] Got originalId from details: ${originalId}`);
          } else {
            // Search for the song to get originalId
            console.log(`[MusicService] Searching for originalId with keyword: ${details?.name || songId}`);
            const searchResults = await this.searchSongs(details?.name || songId, 5);
            if (searchResults.length > 0) {
              // Find the song that matches the encryptedId or has a valid originalId
              const match = searchResults.find(s => 
                s.id === songId || 
                (s.originalId && /^\d+$/.test(s.originalId))
              );
              if (match) {
                if (match.originalId && /^\d+$/.test(match.originalId)) {
                  originalId = match.originalId;
                  console.log(`[MusicService] Got originalId from search: ${originalId}`);
                }
                // Also update encryptedId if we found a better match
                if (match.encryptedId && match.encryptedId !== encId) {
                  console.log(`[MusicService] Updating encryptedId from search: ${match.encryptedId}`);
                  encId = match.encryptedId;
                }
              }
            }
          }
        } else if (/^\d+$/.test(songId)) {
          // songId is originalId, need to find encryptedId
          originalId = songId;
          if (!encId) {
            // Search for the song to get encryptedId
            console.log(`[MusicService] Searching for encryptedId with originalId: ${songId}`);
            const searchResults = await this.searchSongs(details?.name || songId, 5);
            const match = searchResults.find(s => s.originalId == songId || s.id == songId);
            if (match && match.encryptedId) {
              encId = match.encryptedId;
              console.log(`[MusicService] Got encryptedId from search: ${encId}`);
            }
          }
        }
        
        if (!encId) {
          console.log(`[MusicService] Could not find encryptedId for song ${songId}`);
          return {
            success: false,
            error: 'missing_encrypted_id',
            message: '无法获取歌曲播放信息，请尝试搜索其他歌曲'
          };
        }
        
        // Validate originalId - if it's still the encryptedId, we need to find the real originalId
        if (!/^\d+$/.test(originalId)) {
          console.log(`[MusicService] originalId is not a valid numeric ID: ${originalId}, searching...`);
          const searchResults = await this.searchSongs(details?.name || encId, 5);
          const match = searchResults.find(s => s.originalId && /^\d+$/.test(s.originalId));
          if (match && match.originalId) {
            originalId = match.originalId;
            console.log(`[MusicService] Found valid originalId: ${originalId}`);
          } else {
            // If we still can't find originalId, use a placeholder (ncm-cli might still work)
            console.log(`[MusicService] Could not find valid originalId, using encryptedId as fallback`);
            originalId = encId;
          }
        }
        
        console.log(`[MusicService] Playing with ncm-cli: encryptedId=${encId}, originalId=${originalId}`);
        
        // Use the correct play command with both IDs
        const playCommand = `npx @music163/ncm-cli play --song --encrypted-id ${encId} --original-id ${originalId}`;
        
        // 使用 promisify 的 execAsync 来等待命令完成
        let ncmPlaySuccess = false;
        try {
          console.log(`[MusicService] Executing ncm-cli play command...`);
          const { stdout, stderr } = await execAsync(playCommand, { env: this.getEnv(), timeout: 30000 });
          console.log(`[MusicService] ncm-cli play stdout:`, stdout);
          if (stderr) {
            console.log(`[MusicService] ncm-cli play stderr:`, stderr);
          }
          console.log(`[MusicService] Successfully started playing with ncm-cli: ${songId}`);
          ncmPlaySuccess = true;
        } catch (ncmError) {
          console.error(`[MusicService] ncm-cli play error:`, ncmError.message);
          console.error(`[MusicService] ncm-cli play error details:`, ncmError);
          // ncm-cli 执行失败，返回错误
          return {
            success: false,
            error: 'ncm_play_failed',
            message: '歌曲播放失败，请尝试其他歌曲',
            details: ncmError.message,
            songId,
            encryptedId: encId,
            originalId
          };
        }
      } catch (ncmError) {
        console.log(`[MusicService] ncm-cli error: ${ncmError.message}`);
        return {
          success: false,
          error: 'ncm_error',
          message: '播放服务异常，请稍后重试'
        };
      }
      
      // 添加到播放队列
      this.addToQueue(this.currentSong);

      return {
        success: true,
        songId,
        isPlaying: true,
        mock: false
      };
    } catch (error) {
      console.error('[MusicService] Play failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Add song to play queue
   */
  addToQueue(song) {
    if (!song) return;
    
    // 如果当前不在队列末尾，先截断后面的
    if (this.currentQueueIndex < this.playQueue.length - 1) {
      this.playQueue = this.playQueue.slice(0, this.currentQueueIndex + 1);
    }
    
    // 添加到队列末尾
    this.playQueue.push(song);
    this.currentQueueIndex = this.playQueue.length - 1;
    
    // 限制队列长度
    if (this.playQueue.length > 50) {
      this.playQueue.shift();
      this.currentQueueIndex--;
    }
  }

  /**
   * Play previous song from queue
   */
  async playPrevious() {
    if (this.currentQueueIndex > 0) {
      this.currentQueueIndex--;
      const previousSong = this.playQueue[this.currentQueueIndex];
      console.log(`[MusicService] Playing previous song: ${previousSong.name}`);
      return await this.playSong(previousSong.id, previousSong.encryptedId);
    }
    
    return {
      success: false,
      error: 'no_previous_song',
      message: '没有上一首歌曲'
    };
  }

  /**
   * Play next song from queue
   */
  async playNext() {
    if (this.currentQueueIndex < this.playQueue.length - 1) {
      this.currentQueueIndex++;
      const nextSong = this.playQueue[this.currentQueueIndex];
      console.log(`[MusicService] Playing next song from queue: ${nextSong.name}`);
      return await this.playSong(nextSong.id, nextSong.encryptedId);
    }
    
    return {
      success: false,
      error: 'no_next_song',
      message: '没有下一首歌曲，请使用推荐功能'
    };
  }

  /**
   * Stop playback
   */
  async stop() {
    try {
      // Use ncm-cli stop command
      await execAsync('npx @music163/ncm-cli stop', { 
        timeout: 5000,
        env: this.getEnv()
      }).catch(() => {});
      this.isPlaying = false;
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Pause playback (if supported by player)
   */
  async pause() {
    // ncm-cli doesn't support pause, we stop instead
    return this.stop();
  }

  /**
   * Get current playback status from ncm-cli
   */
  async getStatus() {
    let progress = 0;
    let ncmPlaying = false;
    
    // Try to get current playing song from ncm-cli
    try {
      const { stdout } = await execAsync('npx @music163/ncm-cli state', { 
        timeout: 5000,
        env: this.getEnv()
      });
      
      const result = JSON.parse(stdout);
      // ncm-cli state returns { success: true, state: { status, title, position, duration, ... } }
      if (result.success && result.state) {
        const playState = result.state;
        
        // Calculate progress if playing
        if (playState.status === 'playing') {
          ncmPlaying = true;
          if (playState.duration && playState.duration > 0) {
            progress = (playState.position / playState.duration) * 100;
          }
          
          // title format: "歌曲名 - 艺术家"
          const titleParts = playState.title?.split(' - ') || ['Unknown', 'Unknown'];
          const songName = titleParts[0];
          const artistName = titleParts[1] || 'Unknown';
          
          // Check if it's different from our current song
          if (!this.currentSong || this.currentSong.name !== songName) {
            // Search for the song to get full details including cover
            const searchResults = await this.searchSongs(songName, 5);
            const match = searchResults.find(s => s.name === songName && s.artist.includes(artistName));
            
            if (match) {
              this.currentSong = {
                id: match.id,
                encryptedId: match.encryptedId,
                originalId: match.originalId,
                name: match.name,
                artist: match.artist,
                album: match.album,
                duration: match.duration,
                coverImgUrl: match.coverImgUrl
              };
            } else {
              // Fallback to basic info if search fails
              this.currentSong = {
                id: playState.currentIndex || 0,
                name: songName,
                artist: artistName,
                album: 'Unknown',
                duration: playState.duration * 1000 // convert to ms
              };
            }
            this.isPlaying = true;
            console.log('[MusicService] Synced with ncm-cli:', songName);
          }
        } else if (playState.status === 'stopped' || playState.status === 'paused') {
          // ncm-cli reports stopped/paused, update our state
          if (this.isPlaying) {
            this.isPlaying = false;
            console.log('[MusicService] ncm-cli stopped/paused, updating state');
          }
        }
      }
    } catch (error) {
      // ncm-cli not playing or not available
    }
    
    return {
      isPlaying: this.isPlaying,
      currentSong: this.currentSong,
      progress: progress,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Add song to play history
   */
  async addToHistory(songId) {
    const timestamp = new Date().toISOString();
    
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO play_history (song_id, played_at) VALUES (?, ?)',
        [songId, timestamp],
        (err) => {
          if (err) {
            console.error('[MusicService] Failed to add history:', err);
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  /**
   * Get play history
   */
  async getHistory(limit = 50) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM play_history ORDER BY played_at DESC LIMIT ?',
        [limit],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });
  }

  /**
   * Get song details by ID
   * ncm-cli doesn't have a detail command, so we search by ID
   */
  async getSongDetails(songId) {
    try {
      // Search for the song by ID to get details
      const songs = await this.searchSongs(songId.toString(), 5);
      
      // Find the matching song
      const match = songs.find(s => 
        s.id == songId || 
        s.originalId == songId || 
        s.encryptedId?.toLowerCase() === songId.toString().toLowerCase()
      );
      
      if (match) {
        return {
          id: match.id,
          encryptedId: match.encryptedId,
          originalId: match.originalId,
          name: match.name,
          artist: match.artist,
          album: match.album,
          duration: match.duration,
          canPlay: match.canPlay,
          vipFlag: match.vipFlag,
          coverImgUrl: match.coverImgUrl
        };
      }
      
      return null;
    } catch (error) {
      console.error('[MusicService] Get details failed:', error);
      return null;
    }
  }

  /**
   * Get lyrics for a song
   * Note: Lyrics are handled by the TUI player or external tools
   */
  async getLyrics(songId) {
    // ncm-cli doesn't provide a direct lyric command
    // Lyrics are available in TUI mode with the 'L' key
    console.log('[MusicService] Lyrics available in TUI mode (ncm-cli tui)');
    return { lrc: null, tlyric: null };
  }

  /**
   * Mock songs for development/testing
   */
  getMockSongs(keyword, limit) {
    const mockSongs = [
      { id: 1, name: '晴天', artist: '周杰伦', album: '叶惠美', duration: 269000, canPlay: true },
      { id: 2, name: '夜曲', artist: '周杰伦', album: '十一月的萧邦', duration: 226000, canPlay: true },
      { id: 3, name: '稻香', artist: '周杰伦', album: '魔杰座', duration: 223000, canPlay: true },
      { id: 4, name: '演员', artist: '薛之谦', album: '初学者', duration: 261000, canPlay: true },
      { id: 5, name: '告白气球', artist: '周杰伦', album: '周杰伦的床边故事', duration: 215000, canPlay: true },
      { id: 6, name: '成都', artist: '赵雷', album: '无法长大', duration: 336000, canPlay: true },
      { id: 7, name: '南山南', artist: '马頔', album: '孤岛', duration: 294000, canPlay: true },
      { id: 8, name: '理想', artist: '赵雷', album: '无法长大', duration: 318000, canPlay: true },
      { id: 9, name: '消愁', artist: '毛不易', album: '平凡的一天', duration: 261000, canPlay: true },
      { id: 10, name: '像我这样的人', artist: '毛不易', album: '平凡的一天', duration: 303000, canPlay: true }
    ];

    // Filter by keyword
    const filtered = mockSongs.filter(song => 
      song.name.includes(keyword) || 
      song.artist.includes(keyword) ||
      keyword === 'mock'
    );

    return filtered.slice(0, limit);
  }
}

module.exports = { MusicService };
