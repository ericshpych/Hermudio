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
const PROJECT_HOME = path.join(__dirname, '..', '..', '.claudio');

/**
 * Parse JSON from ncm-cli stdout, tolerating non-JSON preamble.
 * ncm-cli may print banners (e.g. "有新版本 ... 运行 ncm-cli upgrade 升级")
 * before the JSON payload, which breaks a naive JSON.parse. This extracts
 * the JSON blob spanning the first "{"/"[" to the last "}"/"]".
 */
function parseNcmJson(stdout) {
  const text = stdout == null ? '' : String(stdout);
  try {
    return JSON.parse(text);
  } catch (_) {
    const start = text.search(/[{[]/);
    const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
    if (start === -1 || end <= start) {
      throw new Error('no JSON found in ncm-cli output');
    }
    return JSON.parse(text.slice(start, end + 1));
  }
}

class MpvWatchdog {
  constructor(musicService, opts = {}) {
    this.svc = musicService;
    this.intervalMs = opts.intervalMs || 30000;
    this.maxAllowed = opts.maxAllowed || 1;
    this.idleGraceMs = opts.idleGraceMs || 60000;
    this.timer = null;
    this.lastKillAt = 0;
    this.killCount = 0;
    this.idleSince = null;
    this._listPidsImpl = opts.listPidsImpl || null;
    this._sortByStartTimeImpl = opts.sortByStartTimeImpl || null;
    this._killImpl = opts.killImpl || null;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.tick().catch(() => {});
    }, this.intervalMs);
    this.timer.unref?.();
    console.log('[MpvWatchdog] started, interval=', this.intervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick() {
    const mpvPids = await this.listPids('mpv');
    // 【修复】npx/npm bin 符号链接解析后的真实进程命令行是 ".../node_modules/.bin/ncm-cli play ..."，
    // 不包含 "@music163/" scope 前缀，用旧字符串永远匹配不到真实运行的进程，
    // 导致这个安全检查形同虚设：只要 isPlayingTracked() 短暂误判为 false，
    // watchdog 就会把仍在正常播放的 mpv 当成孤儿进程杀掉（实测已发生 3 次)。
    const ncmPlayPids = await this.listPids('node', 'ncm-cli play');
    const isPlaying = this.svc.isPlayingTracked();

    if (mpvPids.length > this.maxAllowed) {
      const sorted = await this.sortByStartTime(mpvPids);
      const toKill = sorted.slice(0, sorted.length - this.maxAllowed);
      await this.kill(toKill, 'excess_mpv');
      return;
    }

    if (mpvPids.length > 0 && !isPlaying && ncmPlayPids.length === 0) {
      if (!this.idleSince) this.idleSince = Date.now();
      const idleFor = Date.now() - this.idleSince;
      if (idleFor >= this.idleGraceMs) {
        await this.kill(mpvPids, 'orphan_idle');
        this.idleSince = null;
      }
    } else {
      this.idleSince = null;
    }
  }

  async listPids(name, mustContain) {
    if (this._listPidsImpl) {
      return this._listPidsImpl(name, mustContain);
    }

    try {
      const { stdout } = await execAsync('ps -axo pid=,command=', { timeout: 3000 });
      const lines = stdout.split('\n').map(line => line.trim()).filter(Boolean);
      const pids = [];
      for (const line of lines) {
        const match = line.match(/^(\d+)\s+(.*)$/);
        if (!match) continue;
        const pid = Number(match[1]);
        const command = match[2];
        const exactNameMatch = name === 'mpv'
          ? /(^|\/)mpv(\s|$)/.test(command)
          : command.includes(name);
        if (!exactNameMatch) continue;
        if (mustContain && !command.includes(mustContain)) continue;
        pids.push(pid);
      }
      return pids;
    } catch (error) {
      return [];
    }
  }

  async sortByStartTime(pids) {
    if (this._sortByStartTimeImpl) {
      return this._sortByStartTimeImpl(pids);
    }

    const arr = await Promise.all(pids.map(async (pid) => {
      try {
        const { stdout } = await execAsync(`ps -p ${pid} -o lstart=`, { timeout: 2000 });
        return { pid, t: Date.parse(stdout.trim()) || 0 };
      } catch (error) {
        return { pid, t: 0 };
      }
    }));
    return arr.sort((a, b) => a.t - b.t).map(item => item.pid);
  }

  async kill(pids, reason) {
    if (!pids?.length) return;
    const now = Date.now();
    if (now - this.lastKillAt < 10000) return;
    this.lastKillAt = now;
    this.killCount++;
    console.warn(`[MpvWatchdog] killing ${pids.length} mpv pids reason=${reason}`, pids);

    if (this._killImpl) {
      await this._killImpl(pids, reason);
      return;
    }

    await execAsync(`kill -9 ${pids.join(' ')}`, { timeout: 3000 }).catch(() => {});
  }

  getStats() {
    return {
      killCount: this.killCount,
      lastKillAt: this.lastKillAt
    };
  }
}

class MusicService {
  constructor(db) {
    this.db = db;
    this.currentSong = null;
    this.isPlaying = false;
    this.playHistory = [];
    this.playQueue = []; // 播放队列，用于上一曲/下一曲
    this.currentQueueIndex = -1; // 当前播放位置
    this.ncmLoggedIn = null; // Cache login status
    this._lastLoginCheckTime = 0; // 上次登录检查时间
    this._loginCheckInterval = 5 * 60 * 1000; // 5分钟才检查一次
    this._hasLoggedInBefore = false; // 标记是否曾经登录成功过
    // 【修复】日志节流变量
    this._lastReportedNcmStatus = null;
    this._statusCheckCount = 0;
    this._isPlayingTracked = false;
    this._currentSongId = null;
    // 【修复】之前默认 50，页面没有音量滑块能把它调回 100——每次 applyOutputVolume()
    // 被调用（切歌、或下面 visibilitychange 里"切回标签页就顺手 resume 一次"的兜底逻辑）
    // 都会把 mpv 音量强制拉低到 50%，而 mpv 本身没被动过时是接近满音量的，
    // 于是用户会感觉"切回 Hermudio 界面音量突然变小"。默认改成 100，跟 mpv 的自然音量一致。
    this._outputVolume = 100;
    this._lastNonMutedVolume = 100;
    this._isMuted = false;
    this.watchdog = new MpvWatchdog(this, {
      intervalMs: 30000,
      maxAllowed: 1,
      idleGraceMs: 60000
    });
    this.watchdog.start();
    // 【优化】不在构造函数中同步调用，改为异步初始化，不阻塞启动
    this._initAsync();
  }

  // 【新增】异步初始化，不阻塞服务启动
  async _initAsync() {
    console.log('[MusicService] Starting async initialization in background...');
    // 延迟2秒再检查登录，避免阻塞服务启动
    setTimeout(() => {
      this.checkNcmLogin(true);
    }, 2000);
  }

  /**
   * Get environment for ncm-cli child processes.
   * 默认使用真实用户 HOME，确保服务端能读取用户刚扫码登录的 ncm-cli 凭据。
   * 如需项目隔离配置，可显式设置 HERMUDIO_USE_PROJECT_NCM_HOME=true。
   */
  getEnv() {
    if (process.env.HERMUDIO_USE_PROJECT_NCM_HOME === 'true') {
      return {
        ...process.env,
        HOME: PROJECT_HOME,
        USERPROFILE: PROJECT_HOME,
        XDG_CONFIG_HOME: path.join(PROJECT_HOME, '.config')
      };
    }
    return { ...process.env };
  }

  getAudioState() {
    return {
      muted: this._isMuted,
      volume: this._isMuted ? 0 : this._outputVolume
    };
  }

  async applyOutputVolume() {
    const targetVolume = this._isMuted ? 0 : this._outputVolume;
    await execAsync(`npx @music163/ncm-cli volume ${targetVolume}`, {
      timeout: 5000,
      env: this.getEnv()
    }).catch(() => {});
    return {
      success: true,
      muted: this._isMuted,
      volume: targetVolume
    };
  }

  async setMuted(muted = true) {
    const nextMuted = !!muted;
    if (nextMuted === this._isMuted) {
      return {
        success: true,
        ...this.getAudioState()
      };
    }

    if (nextMuted) {
      this._lastNonMutedVolume = this._outputVolume;
    } else if (this._lastNonMutedVolume > 0) {
      this._outputVolume = this._lastNonMutedVolume;
    }

    this._isMuted = nextMuted;
    return this.applyOutputVolume();
  }

  /**
   * Check if ncm-cli is logged in (with caching)
   */
  async checkNcmLogin(force = false) {
    // 【新增】如果不是强制检查，且5分钟内检查过，直接返回缓存
    const now = Date.now();
    if (!force && this.ncmLoggedIn !== null && (now - this._lastLoginCheckTime) < this._loginCheckInterval) {
      // 【优化】如果之前已经登录成功过，直接返回 true，不做严格检查
      if (this._hasLoggedInBefore && this.ncmLoggedIn === true) {
        return true;
      }
      return this.ncmLoggedIn;
    }
    
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
        const jsonOutput = parseNcmJson(stdout);
        // success 为 true 表示已登录
        isLoggedIn = jsonOutput.success === true;
      } catch (e) {
        // If parsing fails, check output content
        isLoggedIn = stdout.includes('"success": true') || stdout.includes('logged in');
      }

      this.ncmLoggedIn = isLoggedIn;
      this._lastLoginCheckTime = now;
      
      // 【新增】如果登录成功，记住曾经登录过
      if (isLoggedIn) {
        this._hasLoggedInBefore = true;
      }
      
      console.log('[MusicService] ncm-cli login status:', isLoggedIn ? 'logged in' : 'not logged in');
      return this.ncmLoggedIn;
    } catch (error) {
      console.log('[MusicService] ncm-cli login check failed:', error.message);
      // 【新增】即使检查失败，如果曾经登录成功过，我们仍然返回 true（信任之前的登录）
      if (this._hasLoggedInBefore) {
        console.log('[MusicService] Trusting previous login state (hasLoggedInBefore=true), skipping login required check');
        // 【关键优化】即使检查失败，只要之前登录过，就认为是已登录，不阻止播放
        this.ncmLoggedIn = true;
        this._lastLoginCheckTime = now;
        return true;
      }
      this.ncmLoggedIn = false;
      this._lastLoginCheckTime = now;
      return false;
    }
  }

  /**
   * Get ncm-cli login status
   */
  isNcmLoggedIn() {
    return this.ncmLoggedIn;
  }

  markLoginSuccess() {
    this.ncmLoggedIn = true;
    this._hasLoggedInBefore = true;
    this._lastLoginCheckTime = Date.now();
  }

  isPlayingTracked() {
    return this._isPlayingTracked;
  }

  getWatchdogStats() {
    return this.watchdog.getStats();
  }

  async hasActivePlaybackProcess() {
    try {
      const { stdout } = await execAsync('ps -axo command=', { timeout: 3000 });
      return stdout
        .split('\n')
        .some(line => /(^|\/)mpv(\s|$)|@music163\/ncm-cli play|ncm-cli play/.test(line));
    } catch (error) {
      return false;
    }
  }

  async resolveSongByIntent(intent = {}) {
    const queries = [
      intent.artistHint && intent.keyword ? `${intent.artistHint} ${intent.keyword}` : null,
      intent.artistHint || null,
      intent.keyword || null,
      intent.mood ? `${intent.mood} 歌曲` : null,
      intent.genre || null,
      intent.scene || null
    ].filter(Boolean);

    for (const query of queries) {
      try {
        const results = await this.searchSongs(query, 1);
        if (results?.[0]?.id) {
          return results[0];
        }
      } catch (error) {
        console.warn('[MusicService] resolveSongByIntent search failed:', query, error.message);
      }
    }

    return null;
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
      const data = parseNcmJson(stdout);

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
  async playSong(songId, encryptedId = null, songMetadata = null) {
    const MAX_RETRIES = 3;
    let retryCount = 0;

    const attemptPlay = async () => {
      try {
        let resolvedSong = songMetadata ? { ...songMetadata } : null;
        let fallbackSongName = songMetadata?.name || null;

        // Check ncm login status first
        const isLoggedIn = await this.checkNcmLogin();

        // 【优化】如果检查结果是未登录，但曾经登录过，我们仍然尝试播放
        if (!isLoggedIn && !this._hasLoggedInBefore) {
          console.log('[MusicService] ncm-cli not logged in, returning login required');
          return {
            success: false,
            error: 'ncm_not_logged_in',
            message: '请先登录网易云音乐',
            loginRequired: true
          };
        }
        
        if (!isLoggedIn && this._hasLoggedInBefore) {
          console.log('[MusicService] Login check failed, but trusting previous login and attempting to play anyway');
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
            resolvedSong = {
              id: originalId,
              encryptedId: encId,
              originalId: originalId,
              ...songMetadata,
              id: songMetadata?.id || originalId,
              encryptedId: songMetadata?.encryptedId || encId,
              originalId: songMetadata?.originalId || originalId
            };
          } else {
            // 如果没有提供 encryptedId，才从 details 找
            const details = await this.getSongDetails(songId);
            if (details && details.encryptedId) {
              encId = details.encryptedId;
              console.log(`[MusicService] Got encryptedId from details: ${encId}`);
            }
            fallbackSongName = details?.name || fallbackSongName;
            if (details) {
              resolvedSong = details;
            } else {
              resolvedSong = { id: originalId };
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
            resolvedSong = details;
            fallbackSongName = details.name || fallbackSongName;
            console.log(`[MusicService] Got originalId from details: ${originalId}`);
          } else {
            // 搜索获取
            const searchResults = await this.searchSongs(details?.name || songId, 5);
            const match = searchResults.find(s => s.originalId && /^\d+$/.test(s.originalId));
            if (match) {
              originalId = match.originalId;
              encId = match.encryptedId;
              resolvedSong = match;
              fallbackSongName = match.name || fallbackSongName;
              console.log(`[MusicService] Got from search: originalId=${originalId}, encryptedId=${encId}`);
            }
          }
        }

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

            let playResult = null;
            try {
              playResult = parseNcmJson(stdout);
            } catch (parseError) {
              playResult = null;
            }

            if (playResult && playResult.success !== true) {
              const message = playResult.message || '歌曲播放失败，请稍后重试';
              const loginRequired = /登录|实名/.test(message);
              if (loginRequired) {
                this.ncmLoggedIn = false;
                this._lastLoginCheckTime = Date.now();
              }
              return {
                success: false,
                error: loginRequired ? 'ncm_not_logged_in' : 'ncm_play_rejected',
                message,
                loginRequired
              };
            }

            console.log(`[MusicService] Successfully started playing with ncm-cli: ${songId}`);
            await this.applyOutputVolume();
            ncmPlaySuccess = true;
          } catch (ncmError) {
            console.error(`[MusicService] ncm-cli play error:`, ncmError.message);
            console.error(`[MusicService] ncm-cli play error details:`, ncmError);
            // 如果还没有达到最大重试次数，尝试使用搜索结果的第一个有效歌曲
            if (retryCount < MAX_RETRIES) {
              retryCount++;
              console.log(`[MusicService] Retrying with first search result (attempt ${retryCount}/${MAX_RETRIES})...`);

              // 获取歌曲名称并搜索
              const songName = fallbackSongName || songId;
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
                return await this.playSong(playableSong.originalId, playableSong.encryptedId, playableSong);
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

          if (!ncmPlaySuccess) {
            this.isPlaying = false;
            this._isPlayingTracked = false;
            this._currentSongId = null;
            this.currentSong = null;
            return {
              success: false,
              error: 'ncm_play_not_started',
              message: '播放器未成功启动'
            };
          }
        } catch (ncmError) {
          console.log(`[MusicService] ncm-cli error: ${ncmError.message}`);
          this.isPlaying = false;
          this._isPlayingTracked = false;
          this._currentSongId = null;
          this.currentSong = null;
          return {
            success: false,
            error: 'ncm_error',
            message: '播放服务异常，请稍后重试'
          };
        }

        this.currentSong = resolvedSong || {
          id: originalId || songId,
          originalId: originalId || null,
          encryptedId: encId || null
        };
        this.isPlaying = true;
        this._isPlayingTracked = true;
        this._currentSongId = originalId || songId;
        this._ncmStoppedCount = 0; // 重置计数器

        // Add to history only after playback really starts
        await this.addToHistory(songId);

        // 添加到播放队列
        this.addToQueue(this.currentSong);

        return {
          success: true,
          songId,
          song: this.currentSong,
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

        this._isPlayingTracked = false;
        this._currentSongId = null;
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
      await execAsync('npx @music163/ncm-cli queue clear', {
        timeout: 5000,
        env: this.getEnv()
      }).catch(() => {});
      await execAsync("pkill -f '@music163/ncm-cli.* play'", { timeout: 3000 }).catch(() => {});
      await execAsync("pkill -f 'ncm-cli play'", { timeout: 3000 }).catch(() => {});
      this.isPlaying = false;
      this._isPlayingTracked = false;
      this._currentSongId = null;
      this.currentSong = null;
      await execAsync('pkill -9 -x mpv', { timeout: 3000 }).catch(() => {});
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
      this._isPlayingTracked = false;
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
      const hadActivePlayback = await this.hasActivePlaybackProcess();
      if (!hadActivePlayback) {
        this.isPlaying = false;
        this._isPlayingTracked = false;
        return {
          success: false,
          error: 'no_active_playback',
          message: '当前没有可恢复的播放实例'
        };
      }

      await execAsync('npx @music163/ncm-cli resume', { 
        timeout: 5000,
        env: this.getEnv()
      }).catch(() => {});
      await this.applyOutputVolume();

      const resumedPlayback = await this.hasActivePlaybackProcess();
      if (!resumedPlayback) {
        this.isPlaying = false;
        this._isPlayingTracked = false;
        return {
          success: false,
          error: 'resume_no_effect',
          message: '恢复播放未生效'
        };
      }

      this.isPlaying = true;
      this._isPlayingTracked = true;
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
      
      const result = parseNcmJson(stdout);
      // ncm-cli state returns { success: true, state: { status, title, position, duration, ... } }
      if (result.success && result.state) {
        const playState = result.state;
        ncmPosition = playState.position || 0;
        ncmDuration = playState.duration || 0;
        const actualTitle = typeof playState.title === 'string' ? playState.title.trim() : '';
        
        // Calculate progress if playing
        if (playState.status === 'playing') {
          ncmPlaying = true;
          if (ncmDuration && ncmDuration > 0) {
            progress = (ncmPosition / ncmDuration) * 100;
          }
          
          if (actualTitle) {
            const [actualNamePart, ...actualArtistParts] = actualTitle.split(' - ');
            const actualName = actualNamePart?.trim() || actualTitle;
            const actualArtist = actualArtistParts.join(' - ').trim();
            const currentName = this.currentSong?.name?.trim();
            const currentArtist = this.currentSong?.artist?.trim();
            const titleMismatch = !currentName || currentName !== actualName;
            const artistMismatch = actualArtist && currentArtist && currentArtist !== actualArtist;

            if (titleMismatch || artistMismatch) {
              this.currentSong = {
                ...(this.currentSong || {}),
                id: this.currentSong?.id || this._currentSongId || actualTitle,
                originalId: this.currentSong?.originalId || this._currentSongId || null,
                name: actualName,
                artist: actualArtist || currentArtist || '',
                album: titleMismatch ? '' : (this.currentSong?.album || '')
              };
            }
          }

          // ncm-cli 的 title 可能返回实际播放器内部曲目或 ID，不能覆盖推荐队列的歌曲元信息。
          if (this.currentSong && ncmDuration > 0) {
            this.currentSong.duration = this.currentSong.duration || ncmDuration * 1000;
          }
          this.isPlaying = true;
          this._ncmStoppedCount = 0;
        } else if (playState.status === 'stopped' || playState.status === 'paused') {
          // 【临时修复】暂时不更新 isPlaying 为 false，避免 ncm-cli 误报导致频繁切歌
          // 完全移除临时日志，避免刷屏
          // 暂时不更新 isPlaying，不重置计数器，避免误报影响体验
        }
      } else {
        this.isPlaying = false;
        this._isPlayingTracked = false;
        this.currentSong = null;
        this._currentSongId = null;
      }
    } catch (error) {
      // ncm-cli not playing or not available
    }

    if (!ncmPlaying) {
      const hasActivePlayback = await this.hasActivePlaybackProcess();
      if (!hasActivePlayback) {
        this.isPlaying = false;
        this._isPlayingTracked = false;
        this.currentSong = null;
        this._currentSongId = null;
      }
    }
    
    // 【修复】确保不返回无效的歌曲数据
    const validCurrentSong = this.currentSong && (this.currentSong.id || this.currentSong.name) && this.currentSong.name 
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

module.exports = { MusicService, MpvWatchdog };
