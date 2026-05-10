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
    // 【修复】日志节流变量
    this._lastReportedNcmStatus = null;
    this._statusCheckCount = 0;
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
        // Extract originalId - ncm-cli returns it in a specific format
        let originalId = song.originalId || song.id;
        // If originalId is not numeric, try to extract it from other fields
        if (!/^\d+$/.test(String(originalId))) {
          originalId = song.album?.id || song.id;
        }

        return {
          id: song.id, // encryptedId from ncm-cli
          encryptedId: song.id,
          originalId: originalId,
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
    const MAX_RETRIES = 3;
    let retryCount = 0;

    const attemptPlay = async () => {
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

        // 【优化】先确定两个 ID
        let originalId = null;
        let encId = encryptedId;

        // 如果 songId 是数字 ID
        if (/^\d+$/.test(songId)) {
          originalId = songId;
          console.log(`[MusicService] Using originalId directly: ${originalId}`);
          
          // ⚡️ 优化：如果已经有 encryptedId，直接用，完全跳过 getSongDetails
          if (encryptedId) {
            encId = encryptedId;
            console.log(`[MusicService] Using provided encryptedId directly: ${encId}`);
            // 因为我们是从 playlistService 来的，已经有完整歌曲信息
            // 所以我们可以构造一个简单的 currentSong 对象，不需要搜索
            this.currentSong = { 
              id: originalId,
              encryptedId: encId,
              originalId: originalId
              // name, artist 等信息在 playlistService 中已经有了，前端会处理显示
            };
          } else {
            // 如果没有提供 encryptedId，才从 details 找
            const details = await this.getSongDetails(songId);
            if (details && details.encryptedId) {
              encId = details.encryptedId;
              console.log(`[MusicService] Got encryptedId from details: ${encId}`);
            }
            // 更新 currentSong
            if (details) {
              this.currentSong = details;
            } else {
              this.currentSong = { id: originalId };
            }
          }
        } 
        // 如果 songId 是加密 ID（兼容旧逻辑）
        else if (/^[A-F0-9]{32}$/i.test(songId)) {
          encId = songId;
          console.log(`[MusicService] songId is encryptedId, searching for originalId...`);
          
          const details = await this.getSongDetails(songId);
          if (details && details.originalId && /^\d+$/.test(details.originalId)) {
            originalId = details.originalId;
            this.currentSong = details;
            console.log(`[MusicService] Got originalId from details: ${originalId}`);
          } else {
            // 搜索获取
            const searchResults = await this.searchSongs(details?.name || songId, 5);
            const match = searchResults.find(s => s.originalId && /^\d+$/.test(s.originalId));
            if (match) {
              originalId = match.originalId;
              encId = match.encryptedId;
              this.currentSong = match;
              console.log(`[MusicService] Got from search: originalId=${originalId}, encryptedId=${encId}`);
            }
          }
        }
        
        this.isPlaying = true;
        this._ncmStoppedCount = 0; // 重置计数器

        // Add to history
        await this.addToHistory(songId);

        // Try to play with ncm-cli
        // ncm-cli play requires --song --encrypted-id <id> --original-id <id>
        try {
          // 【修复】如果有 encryptedId，直接用，避免搜索
          if (!encId && !originalId) {
            console.log(`[MusicService] Could not find valid IDs for song ${songId}`);
            return {
              success: false,
              error: 'missing_ids',
              message: '无法获取歌曲播放信息，请尝试搜索其他歌曲'
            };
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
            // 如果还没有达到最大重试次数，尝试使用搜索结果的第一个有效歌曲
            if (retryCount < MAX_RETRIES) {
              retryCount++;
              console.log(`[MusicService] Retrying with first search result (attempt ${retryCount}/${MAX_RETRIES})...`);

              // 获取歌曲名称并搜索
              const songName = details?.name || songId;
              const searchResults = await this.searchSongs(songName, 5);

              // 找到第一个可播放的歌曲
              const playableSong = searchResults.find(s =>
                s.canPlay &&
                s.originalId &&
                /^\d+$/.test(String(s.originalId)) &&
                s.encryptedId &&
                /^[A-F0-9]{32}$/i.test(s.encryptedId)
              );

              if (playableSong) {
                console.log(`[MusicService] Retrying with song: ${playableSong.name}`);
                return await this.playSong(playableSong.originalId, playableSong.encryptedId);
              }
            }

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

        // 如果还没有达到最大重试次数，尝试使用搜索结果的第一个有效歌曲
        if (retryCount < MAX_RETRIES) {
          retryCount++;
          console.log(`[MusicService] Play error, retrying (attempt ${retryCount}/${MAX_RETRIES})...`);
          return await attemptPlay();
        }

        return {
          success: false,
          error: error.message
        };
      }
    };

    return await attemptPlay();
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
    try {
      // 使用 ncm-cli prev 命令切换上一首
      console.log(`[MusicService] Calling ncm-cli prev`);
      await execAsync('npx @music163/ncm-cli prev', { 
        timeout: 5000,
        env: this.getEnv()
      });
      
      // 更新队列索引（如果还有上一首）
      if (this.currentQueueIndex > 0) {
        this.currentQueueIndex--;
      }
      
      return { success: true };
    } catch (error) {
      console.error('[MusicService] ncm-cli prev failed:', error.message);
      return {
        success: false,
        error: 'prev_failed',
        message: '切换上一首失败'
      };
    }
  }

  /**
   * Play next song from queue
   */
  async playNext() {
    try {
      // 使用 ncm-cli next 命令切换下一首
      console.log(`[MusicService] Calling ncm-cli next`);
      await execAsync('npx @music163/ncm-cli next', { 
        timeout: 5000,
        env: this.getEnv()
      });
      
      // 更新队列索引（如果还有下一首）
      if (this.currentQueueIndex < this.playQueue.length - 1) {
        this.currentQueueIndex++;
      }
      
      return { success: true };
    } catch (error) {
      console.error('[MusicService] ncm-cli next failed:', error.message);
      return {
        success: false,
        error: 'next_failed',
        message: '切换下一首失败'
      };
    }
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
   * Pause playback
   */
  async pause() {
    try {
      await execAsync('npx @music163/ncm-cli pause', { 
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
   * Resume playback
   */
  async resume() {
    try {
      await execAsync('npx @music163/ncm-cli resume', { 
        timeout: 5000,
        env: this.getEnv()
      }).catch(() => {});
      this.isPlaying = true;
      this._ncmStoppedCount = 0; // 重置计数器
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get current playback status from ncm-cli
   */
  async getStatus() {
    let progress = 0;
    let ncmPlaying = false;
    let ncmPosition = 0;
    let ncmDuration = 0;
    
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
        ncmPosition = playState.position || 0;
        ncmDuration = playState.duration || 0;
        
        // Calculate progress if playing
        if (playState.status === 'playing') {
          ncmPlaying = true;
          if (ncmDuration && ncmDuration > 0) {
            progress = (ncmPosition / ncmDuration) * 100;
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
                duration: ncmDuration * 1000 // convert to ms
              };
            }
            this.isPlaying = true;
            this._ncmStoppedCount = 0; // 重置计数器
            console.log('[MusicService] Synced with ncm-cli:', songName);
          }
        } else if (playState.status === 'stopped' || playState.status === 'paused') {
          // 【临时修复】暂时不更新 isPlaying 为 false，避免 ncm-cli 误报导致频繁切歌
          // 日志节流：只有状态变化或每10次才打印
          this._statusCheckCount++;
          const statusKey = `ncm-${playState.status}`;
          if (statusKey !== this._lastReportedNcmStatus || this._statusCheckCount % 10 === 0) {
            console.log(`[MusicService] Status check #${this._statusCheckCount}, ncm reports ${playState.status} (ignoring for now)`);
            this._lastReportedNcmStatus = statusKey;
          }
          // 暂时不更新 isPlaying，不重置计数器，避免误报影响体验
        }
      }
    } catch (error) {
      // ncm-cli not playing or not available
    }
    
    // 【修复】确保不返回无效的歌曲数据
    const validCurrentSong = this.currentSong && this.currentSong.id && this.currentSong.name 
      ? this.currentSong 
      : null;
    
    return {
      isPlaying: this.isPlaying,
      currentSong: validCurrentSong,
      progress: progress,
      position: ncmPosition,
      duration: ncmDuration,
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
      // 【关键修复】如果 songId 是纯数字（originalId），不要用它搜索（ncm-cli 不接受纯数字搜索）
      if (/^\d+$/.test(songId.toString())) {
        console.log('[MusicService] getSongDetails called with pure numeric ID, skipping search:', songId);
        return null;
      }
      
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
