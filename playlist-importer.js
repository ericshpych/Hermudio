// 收藏歌单导入与智能推荐系统
class PlaylistImporter {
  constructor() {
    this.API_BASE = 'http://localhost:6588';
    
    // 用户音乐偏好数据
    this.userProfile = {
      favoriteArtists: new Map(),      // 艺人 -> 权重
      favoriteGenres: new Map(),       // 风格 -> 权重
      favoriteEras: new Map(),         // 年代 -> 权重
      likedSongs: new Set(),           // 喜欢的歌曲
      skippedSongs: new Set(),         // 跳过的歌曲
      playHistory: [],                 // 播放历史
      timePreferences: new Map(),      // 时间段偏好
      moodPreferences: new Map(),      // 心情偏好
      importedPlaylists: []            // 导入的歌单
    };
    
    // 推荐算法配置
    this.recommendConfig = {
      explorationRate: 0.2,            // 探索新歌曲的比例
      diversityWeight: 0.3,            // 多样性权重
      recencyWeight: 0.2,              // 新鲜度权重
      preferenceWeight: 0.5            // 偏好权重
    };
    
    this.loadUserProfile();
  }
  
  // 从本地存储加载用户画像
  loadUserProfile() {
    try {
      const saved = localStorage.getItem('hermudio_user_profile');
      if (saved) {
        const data = JSON.parse(saved);
        this.userProfile.favoriteArtists = new Map(data.favoriteArtists || []);
        this.userProfile.favoriteGenres = new Map(data.favoriteGenres || []);
        this.userProfile.favoriteEras = new Map(data.favoriteEras || []);
        this.userProfile.likedSongs = new Set(data.likedSongs || []);
        this.userProfile.skippedSongs = new Set(data.skippedSongs || []);
        this.userProfile.playHistory = data.playHistory || [];
        this.userProfile.importedPlaylists = data.importedPlaylists || [];
        console.log('[PlaylistImporter] 用户画像已加载');
      }
    } catch (e) {
      console.error('[PlaylistImporter] 加载用户画像失败:', e);
    }
  }
  
  // 保存用户画像到本地存储
  saveUserProfile() {
    try {
      const data = {
        favoriteArtists: Array.from(this.userProfile.favoriteArtists.entries()),
        favoriteGenres: Array.from(this.userProfile.favoriteGenres.entries()),
        favoriteEras: Array.from(this.userProfile.favoriteEras.entries()),
        likedSongs: Array.from(this.userProfile.likedSongs),
        skippedSongs: Array.from(this.userProfile.skippedSongs),
        playHistory: this.userProfile.playHistory.slice(-100), // 只保留最近100条
        importedPlaylists: this.userProfile.importedPlaylists
      };
      localStorage.setItem('hermudio_user_profile', JSON.stringify(data));
    } catch (e) {
      console.error('[PlaylistImporter] 保存用户画像失败:', e);
    }
  }
  
  // ==================== 歌单导入功能 ====================
  
  // 解析网易云歌单链接
  async importNeteasePlaylist(playlistUrl) {
    try {
      // 从链接中提取歌单ID
      const match = playlistUrl.match(/playlist\/(\d+)/);
      if (!match) {
        throw new Error('无效的网易云歌单链接');
      }
      
      const playlistId = match[1];
      console.log('[PlaylistImporter] 导入歌单:', playlistId);
      
      // 使用ncm-cli获取歌单详情
      const response = await fetch(`${this.API_BASE}/api/cli/exec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'playlist',
          args: ['--id', playlistId, '--output', 'json']
        })
      });
      
      const data = await response.json();
      
      if (data.success && data.output) {
        const playlist = JSON.parse(data.output);
        await this.processImportedPlaylist(playlist);
        return { success: true, playlist };
      } else {
        throw new Error('获取歌单失败');
      }
    } catch (e) {
      console.error('[PlaylistImporter] 导入歌单失败:', e);
      return { success: false, error: e.message };
    }
  }
  
  // 从文本导入歌曲列表
  async importFromText(text, source = 'unknown') {
    try {
      // 解析文本中的歌曲信息
      // 支持格式：
      // 1. 歌曲名 - 艺人
      // 2. 艺人 - 歌曲名
      // 3. 歌曲名
      
      const lines = text.split('\n').filter(line => line.trim());
      const songs = [];
      
      for (const line of lines) {
        const song = this.parseSongLine(line);
        if (song) {
          songs.push(song);
        }
      }
      
      // 批量搜索歌曲获取详细信息
      const enrichedSongs = await this.enrichSongs(songs);
      
      // 更新用户画像
      this.updateProfileFromSongs(enrichedSongs, source);
      
      return { 
        success: true, 
        songs: enrichedSongs,
        count: enrichedSongs.length 
      };
    } catch (e) {
      console.error('[PlaylistImporter] 导入文本失败:', e);
      return { success: false, error: e.message };
    }
  }
  
  // 解析单行歌曲信息
  parseSongLine(line) {
    line = line.trim();
    
    // 尝试匹配 "歌曲名 - 艺人" 或 "艺人 - 歌曲名"
    const dashMatch = line.match(/^(.+?)\s*[-–—]\s*(.+)$/);
    if (dashMatch) {
      // 判断哪边是艺人（通常艺人名较短）
      const part1 = dashMatch[1].trim();
      const part2 = dashMatch[2].trim();
      
      if (part1.length < part2.length) {
        return { artist: part1, name: part2 };
      } else {
        return { name: part1, artist: part2 };
      }
    }
    
    // 只有歌曲名
    return { name: line, artist: '未知艺人' };
  }
  
  // 批量搜索歌曲获取详细信息
  async enrichSongs(songs) {
    const enriched = [];
    
    for (const song of songs.slice(0, 50)) { // 限制每次处理50首
      try {
        const response = await fetch(
          `${this.API_BASE}/api/cli/search?keyword=${encodeURIComponent(song.name + ' ' + song.artist)}&limit=1`
        );
        const data = await response.json();
        
        if (data.success && data.data.length > 0) {
          enriched.push(data.data[0]);
        }
        
        // 添加小延迟避免请求过快
        await new Promise(r => setTimeout(r, 100));
      } catch (e) {
        console.warn('[PlaylistImporter] 搜索歌曲失败:', song.name);
      }
    }
    
    return enriched;
  }
  
  // 处理导入的歌单
  async processImportedPlaylist(playlist) {
    if (!playlist.songs || !playlist.songs.length) return;
    
    // 记录导入的歌单
    this.userProfile.importedPlaylists.push({
      id: playlist.id,
      name: playlist.name,
      songCount: playlist.songs.length,
      importTime: Date.now()
    });
    
    // 更新用户画像
    this.updateProfileFromSongs(playlist.songs, playlist.name);
    
    this.saveUserProfile();
    console.log('[PlaylistImporter] 歌单处理完成:', playlist.name);
  }
  
  // ==================== 用户画像更新 ====================
  
  // 从歌曲列表更新用户画像
  updateProfileFromSongs(songs, source) {
    for (const song of songs) {
      // 更新艺人偏好
      if (song.artist) {
        const currentWeight = this.userProfile.favoriteArtists.get(song.artist) || 0;
        this.userProfile.favoriteArtists.set(song.artist, currentWeight + 1);
      }
      
      // 更新风格偏好（如果有风格信息）
      if (song.genre) {
        const currentWeight = this.userProfile.favoriteGenres.get(song.genre) || 0;
        this.userProfile.favoriteGenres.set(song.genre, currentWeight + 1);
      }
      
      // 更新年代偏好（如果有发行年份）
      if (song.year) {
        const era = this.getEraFromYear(song.year);
        const currentWeight = this.userProfile.favoriteEras.get(era) || 0;
        this.userProfile.favoriteEras.set(era, currentWeight + 1);
      }
    }
    
    this.saveUserProfile();
  }
  
  // 记录播放行为
  recordPlayBehavior(song, behavior) {
    const songKey = `${song.name}-${song.artist}`;
    
    switch (behavior) {
      case 'play':
        this.userProfile.playHistory.push({
          song: songKey,
          artist: song.artist,
          timestamp: Date.now()
        });
        break;
        
      case 'like':
        this.userProfile.likedSongs.add(songKey);
        this.boostArtistWeight(song.artist, 2);
        break;
        
      case 'skip':
        this.userProfile.skippedSongs.add(songKey);
        this.boostArtistWeight(song.artist, -1);
        break;
        
      case 'complete':
        this.boostArtistWeight(song.artist, 1);
        break;
    }
    
    this.saveUserProfile();
  }
  
  // 调整艺人权重
  boostArtistWeight(artist, delta) {
    const current = this.userProfile.favoriteArtists.get(artist) || 0;
    this.userProfile.favoriteArtists.set(artist, Math.max(0, current + delta));
  }
  
  // 根据年份获取年代
  getEraFromYear(year) {
    if (year < 1980) return '经典老歌';
    if (year < 1990) return '80年代';
    if (year < 2000) return '90年代';
    if (year < 2010) return '2000年代';
    if (year < 2020) return '2010年代';
    return '最新音乐';
  }
  
  // ==================== 智能推荐 ====================
  
  // 获取个性化推荐
  async getPersonalizedRecommendations(options = {}) {
    const {
      count = 10,
      mood = null,
      timeOfDay = null,
      excludePlayed = true
    } = options;
    
    try {
      // 1. 获取候选歌曲池
      const candidates = await this.getCandidateSongs();
      
      // 2. 计算每首歌的推荐分数
      const scored = candidates.map(song => ({
        song,
        score: this.calculateRecommendationScore(song, mood, timeOfDay)
      }));
      
      // 3. 过滤已播放的歌曲
      let filtered = scored;
      if (excludePlayed) {
        const playedSongs = new Set(
          this.userProfile.playHistory.map(h => h.song)
        );
        filtered = scored.filter(item => !playedSongs.has(
          `${item.song.name}-${item.song.artist}`
        ));
      }
      
      // 4. 排序并返回
      filtered.sort((a, b) => b.score - a.score);
      
      // 5. 添加一些随机性（探索）
      const recommendations = this.addExploration(filtered, count);
      
      return {
        success: true,
        songs: recommendations.map(r => r.song),
        scores: recommendations.map(r => ({
          song: r.song.name,
          score: r.score.toFixed(2)
        }))
      };
    } catch (e) {
      console.error('[PlaylistImporter] 获取推荐失败:', e);
      return { success: false, error: e.message };
    }
  }
  
  // 获取候选歌曲池
  async getCandidateSongs() {
    // 从多个来源获取候选歌曲
    const candidates = [];
    
    // 1. 从导入的歌单中获取
    for (const playlist of this.userProfile.importedPlaylists.slice(-5)) {
      try {
        const response = await fetch(
          `${this.API_BASE}/api/cli/search?keyword=${encodeURIComponent(playlist.name)}&limit=5`
        );
        const data = await response.json();
        if (data.success) {
          candidates.push(...data.data);
        }
      } catch (e) {
        console.warn('[PlaylistImporter] 获取歌单歌曲失败:', playlist.name);
      }
    }
    
    // 2. 根据喜欢的艺人搜索相似歌曲
    const topArtists = this.getTopArtists(3);
    for (const artist of topArtists) {
      try {
        const response = await fetch(
          `${this.API_BASE}/api/cli/search?keyword=${encodeURIComponent(artist)}&limit=5`
        );
        const data = await response.json();
        if (data.success) {
          candidates.push(...data.data);
        }
      } catch (e) {
        console.warn('[PlaylistImporter] 搜索艺人失败:', artist);
      }
    }
    
    // 3. 获取每日推荐作为补充
    try {
      const response = await fetch(`${this.API_BASE}/api/cli/recommend/songs`);
      const data = await response.json();
      if (data.success) {
        candidates.push(...data.data);
      }
    } catch (e) {
      console.warn('[PlaylistImporter] 获取每日推荐失败');
    }
    
    // 去重
    const seen = new Set();
    return candidates.filter(song => {
      const key = `${song.name}-${song.artist}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  
  // 计算推荐分数
  calculateRecommendationScore(song, mood, timeOfDay) {
    let score = 0;
    const songKey = `${song.name}-${song.artist}`;
    
    // 1. 艺人偏好分数 (0-50)
    if (song.artist) {
      const artistWeight = this.userProfile.favoriteArtists.get(song.artist) || 0;
      const maxArtistWeight = Math.max(...this.userProfile.favoriteArtists.values(), 1);
      score += (artistWeight / maxArtistWeight) * 50 * this.recommendConfig.preferenceWeight;
    }
    
    // 2. 风格偏好分数 (0-30)
    if (song.genre) {
      const genreWeight = this.userProfile.favoriteGenres.get(song.genre) || 0;
      const maxGenreWeight = Math.max(...this.userProfile.favoriteGenres.values(), 1);
      score += (genreWeight / maxGenreWeight) * 30 * this.recommendConfig.preferenceWeight;
    }
    
    // 3. 跳过惩罚 (-20)
    if (this.userProfile.skippedSongs.has(songKey)) {
      score -= 20;
    }
    
    // 4. 喜欢奖励 (+15)
    if (this.userProfile.likedSongs.has(songKey)) {
      score += 15;
    }
    
    // 5. 新鲜度分数 (0-10)
    const isNew = !this.userProfile.playHistory.some(h => h.song === songKey);
    if (isNew) {
      score += 10 * this.recommendConfig.recencyWeight;
    }
    
    // 6. 心情匹配 (0-20)
    if (mood && song.mood === mood) {
      score += 20;
    }
    
    return score;
  }
  
  // 添加探索性推荐
  addExploration(scoredSongs, count) {
    const explorationCount = Math.floor(count * this.recommendConfig.explorationRate);
    const exploitationCount = count - explorationCount;
    
    // 按分数选择
    const topSongs = scoredSongs.slice(0, exploitationCount);
    
    // 随机选择探索歌曲
    const remaining = scoredSongs.slice(exploitationCount);
    const explorationSongs = [];
    
    for (let i = 0; i < explorationCount && remaining.length > 0; i++) {
      const randomIndex = Math.floor(Math.random() * remaining.length);
      explorationSongs.push(remaining.splice(randomIndex, 1)[0]);
    }
    
    // 合并并打乱顺序
    const combined = [...topSongs, ...explorationSongs];
    return this.shuffleArray(combined);
  }
  
  // 获取Top艺人
  getTopArtists(count) {
    return Array.from(this.userProfile.favoriteArtists.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, count)
      .map(([artist]) => artist);
  }
  
  // 打乱数组
  shuffleArray(array) {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
  }
  
  // 获取用户画像摘要
  getUserProfileSummary() {
    return {
      topArtists: this.getTopArtists(5),
      topGenres: Array.from(this.userProfile.favoriteGenres.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([genre]) => genre),
      totalPlayed: this.userProfile.playHistory.length,
      likedCount: this.userProfile.likedSongs.size,
      importedPlaylists: this.userProfile.importedPlaylists.length
    };
  }
  
  // 清空用户画像
  clearProfile() {
    this.userProfile = {
      favoriteArtists: new Map(),
      favoriteGenres: new Map(),
      favoriteEras: new Map(),
      likedSongs: new Set(),
      skippedSongs: new Set(),
      playHistory: [],
      timePreferences: new Map(),
      moodPreferences: new Map(),
      importedPlaylists: []
    };
    this.saveUserProfile();
    console.log('[PlaylistImporter] 用户画像已清空');
  }
}

// 创建全局实例
const playlistImporter = new PlaylistImporter();
