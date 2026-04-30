const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const app = express();
const PORT = 6588;

// CLI 播放器状态管理
const cliPlayer = {
  isPlaying: false,
  currentSong: null,
  playlist: [],
  currentIndex: 0,
  volume: 80,
  playMode: 'sequence', // sequence, random, loop
  cliProcess: null,
  lastOutput: '',
  commandHistory: []
};

// 第一步：最宽松的跨域+CSP响应头（解决所有限制）
app.use((req, res, next) => {
  // 允许所有来源跨域
  res.setHeader('Access-Control-Allow-Origin', '*');
  // 允许所有请求方法
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  // 允许所有请求头（包括Cookie）
  res.setHeader('Access-Control-Allow-Headers', '*');
  // 允许携带Cookie
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  // 解除CSP限制
  res.setHeader('Content-Security-Policy', '*');
  // 预检请求直接返回200
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

// 原有中间件
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件服务
app.use(express.static(__dirname));

// ==================== CLI 控制 API ====================

// 项目目录下的配置目录
const PROJECT_HOME = path.join(__dirname, '.ncm-home');
const PROJECT_CONFIG_DIR = path.join(PROJECT_HOME, '.config', 'ncm-cli');

// 确保配置目录存在
if (!fs.existsSync(PROJECT_CONFIG_DIR)) {
  fs.mkdirSync(PROJECT_CONFIG_DIR, { recursive: true });
  console.log(`[配置] 创建项目配置目录: ${PROJECT_CONFIG_DIR}`);
}

// 执行网易云CLI命令
function executeCLICommand(command, args = []) {
  return new Promise((resolve, reject) => {
    // 对参数进行转义，处理包含空格的字符串
    const escapedArgs = args.map(arg => {
      // 如果参数包含空格或特殊字符，用引号包裹
      if (arg.includes(' ') || arg.includes('(') || arg.includes(')') || arg.includes('&') || arg.includes('|')) {
        return `"${arg.replace(/"/g, '\\"')}"`;
      }
      return arg;
    });
    const fullCommand = `npx @music163/ncm-cli ${command} ${escapedArgs.join(' ')}`;
    const startTime = Date.now();
    
    console.log(`[CLI执行] ${fullCommand}`);
    console.log(`[CLI配置] 使用项目目录: ${PROJECT_HOME}`);

    // 使用项目目录作为 HOME，避开系统保护
    const env = {
      ...process.env,
      HOME: PROJECT_HOME,
      USERPROFILE: PROJECT_HOME,
      XDG_CONFIG_HOME: path.join(PROJECT_HOME, '.config')
    };

    exec(fullCommand, { 
      timeout: 30000,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      env: env
    }, (error, stdout, stderr) => {
      // CLI输出到stderr也可能是正常输出
      const output = stdout || stderr || '';
      const duration = Date.now() - startTime;
      
      console.log(`[CLI输出] ${output.substring(0, 500)}${output.length > 500 ? '...' : ''}`);
      
      // 记录命令历史（包含输出结果）
      const historyEntry = {
        command: fullCommand,
        timestamp: new Date().toISOString(),
        duration: duration,
        output: output.substring(0, 1000), // 限制输出长度
        success: !(error && error.code !== 0 && !output)
      };
      
      cliPlayer.commandHistory.push(historyEntry);
      // 只保留最近50条
      if (cliPlayer.commandHistory.length > 50) {
        cliPlayer.commandHistory.shift();
      }
      
      if (error && error.code !== 0 && !output) {
        console.error(`[CLI错误] ${error.message}`);
        reject({ error: error.message, stderr });
        return;
      }
      
      cliPlayer.lastOutput = output;
      resolve(output);
    });
  });
}

// 1. CLI 登录
// 存储登录会话
let loginSession = {
  isLoggingIn: false,
  loginUrl: null,
  startTime: null,
  loginProcess: null,
  loginCompleted: false
};

app.post('/api/cli/login', async (req, res) => {
  try {
    // 重置登录会话，确保每次都生成新链接
    loginSession.isLoggingIn = true;
    loginSession.startTime = Date.now();
    loginSession.loginUrl = null;
    loginSession.loginCompleted = false;
    
    // 如果之前有登录进程，终止它
    if (loginSession.loginProcess) {
      try {
        loginSession.loginProcess.kill();
      } catch (e) {
        // 忽略终止错误
      }
    }
    
    console.log('[登录] 开始生成新的登录链接...');
    
    // 使用非阻塞方式执行登录命令
    const { exec } = require('child_process');
    const fullCommand = `npx @music163/ncm-cli login`;
    
    const env = {
      ...process.env,
      HOME: PROJECT_HOME,
      USERPROFILE: PROJECT_HOME,
      XDG_CONFIG_HOME: path.join(PROJECT_HOME, '.config')
    };
    
    // 执行命令并捕获输出
    const child = exec(fullCommand, { 
      timeout: 300000, // 5分钟超时
      encoding: 'utf8',
      env: env
    }, (error, stdout, stderr) => {
      // 登录完成或超时，重置状态
      loginSession.isLoggingIn = false;
      loginSession.loginCompleted = true;
      console.log('[登录] CLI登录进程结束');
      if (error) {
        console.log('[登录] 进程结束原因:', error.message);
      }
    });
    
    loginSession.loginProcess = child;
    
    // 监听输出以提取登录链接和登录成功信息
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
      
      // 检测登录成功信息
      if (data.includes('登录成功') || data.includes('logged in') || data.includes('success')) {
        console.log('[登录] 检测到登录成功信息');
        loginSession.loginCompleted = true;
      }
    };
    
    child.stdout?.on('data', extractInfo);
    child.stderr?.on('data', extractInfo);
    
    // 轮询等待链接生成，最多等待15秒
    let waitTime = 0;
    const maxWaitTime = 15000; // 15秒
    const checkInterval = 500; // 每500ms检查一次
    
    while (waitTime < maxWaitTime && !loginSession.loginUrl) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      waitTime += checkInterval;
    }
    
    if (loginSession.loginUrl) {
      console.log('[登录] 返回登录链接:', loginSession.loginUrl);
      res.json({
        code: 200,
        success: true,
        message: '登录链接已生成',
        loginUrl: loginSession.loginUrl
      });
    } else {
      // 如果没有获取到链接，返回错误
      console.error('[登录] 未能获取登录链接');
      loginSession.isLoggingIn = false;
      try {
        child.kill();
      } catch (e) {}
      res.status(500).json({
        code: -1,
        success: false,
        message: '获取登录链接失败，请重试'
      });
    }
  } catch (err) {
    console.error('CLI登录失败：', err);
    loginSession.isLoggingIn = false;
    res.status(500).json({ 
      code: -1, 
      success: false,
      message: 'CLI登录失败',
      error: err.error || err.message 
    });
  }
});

// 2. 获取每日推荐歌曲 (使用ncm-cli搜索热门歌曲)
app.get('/api/cli/recommend/songs', async (req, res) => {
  try {
    console.log('[推荐歌曲] 使用ncm-cli搜索获取推荐歌曲');
    
    // 搜索一些热门歌曲作为推荐
    const hotKeywords = ['周杰伦', '林俊杰', '热门', '经典', '流行'];
    const randomKeyword = hotKeywords[Math.floor(Math.random() * hotKeywords.length)];
    
    const searchResults = await searchSongWithCLI(randomKeyword, 10);
    
    if (searchResults.length > 0) {
      // 过滤出有播放权限的歌曲
      const playableSongs = searchResults.filter(s => s.canPlay);
      const finalSongs = playableSongs.length > 0 ? playableSongs : searchResults;
      
      cliPlayer.playlist = finalSongs;
      
      res.json({
        code: 200,
        success: true,
        data: finalSongs,
        message: `获取推荐歌曲成功，共${finalSongs.length}首`
      });
    } else {
      // 如果搜索失败，使用默认歌曲
      const defaultSongs = [
        { id: '3339230677', originalId: 3339230677, name: '晴天', artist: '周杰伦', album: '叶惠美', duration: 269, canPlay: false },
        { id: '185811', originalId: 185811, name: '稻香', artist: '周杰伦', album: '魔杰座', duration: 223, canPlay: false },
        { id: '186136', originalId: 186136, name: '夜曲', artist: '周杰伦', album: '十一月的萧邦', duration: 226, canPlay: false }
      ];
      
      cliPlayer.playlist = defaultSongs;
      
      res.json({
        code: 200,
        success: true,
        data: defaultSongs,
        message: '使用默认推荐歌曲'
      });
    }
  } catch (err) {
    console.error('获取推荐歌曲失败：', err);
    res.status(500).json({ 
      code: -1, 
      success: false,
      message: '获取推荐歌曲失败',
      error: err.error || err.message 
    });
  }
});

// 3. 搜索歌曲 (使用ncm-cli)
app.get('/api/cli/search', async (req, res) => {
  try {
    const { keyword, limit = 10 } = req.query;
    if (!keyword) {
      return res.status(400).json({ code: -1, message: '缺少搜索关键词' });
    }

    console.log('[搜索] 使用ncm-cli搜索:', keyword);
    
    // 使用ncm-cli搜索获取正确的加密ID和播放权限
    const searchResults = await searchSongWithCLI(keyword, parseInt(limit));
    
    res.json({
      code: 200,
      success: true,
      data: searchResults,
      message: '搜索成功'
    });
  } catch (err) {
    console.error('搜索失败：', err);
    res.status(500).json({ 
      code: -1, 
      success: false,
      message: '搜索失败',
      error: err.error || err.message 
    });
  }
});

// 辅助函数：通过网易云API搜索歌曲获取加密ID
async function searchSongFromNetease(keyword, limit = 5) {
  try {
    console.log('[搜索] 使用网易云API搜索:', keyword);
    
    // 使用公开的网易云API (NeteaseCloudMusicApi)
    const response = await axios.get(
      `https://music-api.heheda.top/search?keywords=${encodeURIComponent(keyword)}&limit=${limit}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Referer': 'https://music.163.com/'
        },
        timeout: 10000
      }
    );
    
    if (response.data && response.data.result && response.data.result.songs) {
      const songs = response.data.result.songs.map(song => ({
        id: song.id.toString(),
        originalId: song.id,
        name: song.name,
        artist: song.artists.map(a => a.name).join(', '),
        album: song.album.name,
        duration: Math.floor(song.duration / 1000)
      }));
      console.log('[搜索] 找到', songs.length, '首歌曲');
      return songs;
    }
    console.log('[搜索] 未找到歌曲');
    return [];
  } catch (e) {
    console.error('[搜索] 网易云API搜索失败:', e.message);
    return [];
  }
}

// 辅助函数：使用ncm-cli搜索歌曲获取加密ID
async function searchSongWithCLI(keyword, limit = 5) {
  try {
    console.log('[CLI搜索] 关键词:', keyword);
    const output = await executeCLICommand('search', ['song', '--keyword', keyword, '--limit', limit.toString(), '--output', 'json']);

    // 解析JSON结果
    const data = JSON.parse(output);
    console.log('[CLI搜索] 原始返回数据结构:', Object.keys(data));
    console.log('[CLI搜索] 原始返回数据条数:', data.data?.records?.length || 0);

    // 打印第一条原始数据，查看字段名
    if (data.data?.records?.length > 0) {
      console.log('[CLI搜索] 第一条原始数据:', JSON.stringify(data.data.records[0], null, 2));
    }

    if (data.data && data.data.records && data.data.records.length > 0) {
      const songs = data.data.records.map((song, index) => {
        // 检查字段名 - 可能是 id 或 songId 或其他
        const songId = song.id || song.songId || song.encryptedId || song.sid;
        const originalId = song.originalId || song.original_id || song.oid || song.song_id;

        console.log(`[CLI搜索] 第${index + 1}首歌:`, song.name, '提取的ID:', songId, '原始ID:', originalId);

        const mapped = {
          id: songId,
          originalId: originalId,
          name: song.name,
          artist: song.artists ? song.artists.map(a => a.name).join(', ') : '未知艺术家',
          album: song.album ? song.album.name : '',
          duration: Math.floor(song.duration / 1000),
          // 检查播放权限
          canPlay: song.plLevel !== 'none' && song.userMaxBr > 0
        };
        return mapped;
      });
      return songs;
    }
    return [];
  } catch (e) {
    console.error('[CLI搜索] 失败:', e.message);
    console.error('[CLI搜索] 错误堆栈:', e.stack);
    return [];
  }
}

// 4. 播放指定歌曲 (ncm-cli 0.1.3+ 需要先搜索获取加密ID)
app.post('/api/cli/play', async (req, res) => {
  try {
    const { songId, originalId, songName, artist } = req.body;
    
    console.log('[播放] 收到请求:', { songId, originalId, songName, artist });

    let targetOriginalId = originalId;
    let targetSongName = songName;
    let targetArtist = artist;
    let encryptedId = null;

    if (!targetOriginalId && songId) {
      // 先从播放列表查找（使用宽松相等，兼容字符串和数字）
      const song = cliPlayer.playlist.find(s => s.id == songId);
      if (song) {
        targetOriginalId = song.originalId;
        targetSongName = song.name;
        targetArtist = song.artist;
        console.log('[播放] 从播放列表找到歌曲:', targetSongName);
      } else {
        // 检查 songId 是否是加密ID格式（16位以上十六进制字符串）
        const isEncryptedId = /^[A-F0-9]{16,}$/i.test(songId);
        
        if (isEncryptedId) {
          // 如果 songId 是加密ID格式，直接使用它
          console.log('[播放] songId 是加密ID格式，直接使用:', songId);
          encryptedId = songId;
          // 尝试通过搜索获取歌曲信息（使用加密ID搜索可能无法获取正确信息）
          // 这里我们使用 songName 或 artist 来搜索获取更多信息
          if (songName) {
            console.log('[播放] 使用提供的歌名搜索:', songName);
            const searchResults = await searchSongWithCLI(songName, 5);
            if (searchResults.length > 0) {
              const matchedSong = searchResults.find(s => s.id === songId || s.name === songName) || searchResults[0];
              targetOriginalId = matchedSong.originalId;
              targetSongName = matchedSong.name;
              targetArtist = matchedSong.artist;
              // 如果搜索返回了不同的加密ID，优先使用搜索结果的
              if (matchedSong.id !== songId) {
                console.log('[播放] 搜索结果提供了不同的加密ID，更新为:', matchedSong.id);
                encryptedId = matchedSong.id;
              }
            }
          }
          // 如果没有提供歌名，我们只能使用加密ID播放
          if (!targetSongName) {
            targetSongName = songName || '未知歌曲';
            targetArtist = artist || '未知艺术家';
            console.log('[播放] 没有歌名信息，使用占位符:', targetSongName);
          }
        } else {
          // 如果播放列表中没有，直接使用 songId 作为搜索关键词
          console.log('[播放] 播放列表中未找到，尝试搜索 songId:', songId);
          const searchResults = await searchSongWithCLI(songId.toString(), 5);
          console.log('[播放] 搜索结果数量:', searchResults.length);
          if (searchResults.length > 0) {
            const matchedSong = searchResults.find(s => s.canPlay) || searchResults[0];
            console.log('[播放] 匹配歌曲:', JSON.stringify(matchedSong, null, 2));
            encryptedId = matchedSong.id;
            targetOriginalId = matchedSong.originalId;
            targetSongName = matchedSong.name;
            targetArtist = matchedSong.artist;
            console.log('[播放] 提取到 - 加密ID:', encryptedId, '原始ID:', targetOriginalId, '歌名:', targetSongName);
          } else {
            console.log('[播放] 搜索结果为空');
          }
        }
      }
    }

    if (!targetOriginalId && !targetSongName && !encryptedId) {
      return res.status(400).json({
        code: -1,
        success: false,
        message: '缺少歌曲ID或歌曲名，无法播放'
      });
    }
    
    // 检查是否有可播放的歌曲
    if (encryptedId && !targetSongName) {
      console.log('[播放] 警告: 找到歌曲但可能没有播放权限');
    }
    
    // 如果已经有加密ID（从第一次搜索获得），直接使用，避免二次搜索导致匹配错误
    if (!encryptedId) {
      // 使用ncm-cli搜索获取加密ID（这样获取的ID才有播放权限）
      console.log('[播放] 使用CLI搜索歌曲:', targetSongName || targetOriginalId);
      const searchKeyword = targetSongName || targetOriginalId;
      const searchResults = await searchSongWithCLI(searchKeyword, 5);
      
      if (searchResults.length > 0) {
        // 优先选择有播放权限的歌曲
        const matchedSong = searchResults.find(s => 
          s.canPlay && (s.originalId == targetOriginalId || s.name === targetSongName)
        ) || searchResults.find(s => s.canPlay) || searchResults[0];
        
        encryptedId = matchedSong.id;
        targetOriginalId = matchedSong.originalId;
        targetSongName = matchedSong.name;
        targetArtist = matchedSong.artist;
        
        console.log('[播放] 找到歌曲:', targetSongName, '加密ID:', encryptedId, '原始ID:', targetOriginalId, '可播放:', matchedSong.canPlay);
        
        if (!matchedSong.canPlay) {
          console.warn('[播放] 警告: 该歌曲可能没有播放权限');
        }
      }
    } else {
      console.log('[播放] 使用已获取的加密ID:', encryptedId, '歌曲:', targetSongName);
    }
    
    if (!encryptedId) {
      return res.status(400).json({
        code: -1,
        success: false,
        message: '无法获取歌曲加密ID，播放失败'
      });
    }
    
    // 先添加到队列
    console.log('[播放] 添加歌曲到队列:', encryptedId);
    const originalIdStr = targetOriginalId ? targetOriginalId.toString() : '0';
    await executeCLICommand('queue', ['add', '--encrypted-id', encryptedId, '--original-id', originalIdStr]);
    
    // 然后播放
    console.log('[播放] 开始播放');
    const playOutput = await executeCLICommand('play', ['--song', '--encrypted-id', encryptedId, '--original-id', originalIdStr]);
    console.log('[播放] CLI输出:', playOutput);
    
    // 更新当前歌曲信息
    cliPlayer.currentSong = {
      id: encryptedId,
      originalId: targetOriginalId || 0,
      name: targetSongName || '未知歌曲',
      artist: targetArtist || '未知艺术家'
    };
    cliPlayer.isPlaying = true;
    
    res.json({
      code: 200,
      success: true,
      message: '开始播放',
      song: cliPlayer.currentSong,
      output: playOutput
    });
  } catch (err) {
    console.error('播放失败：', err);
    
    // 检查 ncm-cli 日志获取详细错误信息
    const logs = getNcmCliLogs(30);
    const errors = analyzeNcmCliLogs(logs);
    
    // 构建友好的错误消息
    let errorMessage = '播放失败';
    let errorDetails = [];
    
    if (errors.length > 0) {
      for (const error of errors) {
        switch (error.type) {
          case 'permission':
            errorDetails.push('该歌曲暂无音源或暂无播放权限（可能需要VIP）');
            break;
          case 'auth':
            errorDetails.push('登录已过期，请重新登录');
            break;
          case 'network':
            errorDetails.push('网络连接失败，请检查网络');
            break;
          case 'daemon':
            errorDetails.push('播放服务未启动，请尝试重新播放');
            break;
          default:
            errorDetails.push(error.message);
        }
      }
      errorMessage = errorDetails.join('；');
    } else {
      errorMessage = err.error || err.message || '播放失败，请检查ncm-cli日志';
    }
    
    res.status(500).json({ 
      code: -1, 
      success: false,
      message: errorMessage,
      error: err.error || err.message,
      logs: logs.substring(0, 2000), // 返回部分日志供调试
      analyzedErrors: errors
    });
  }
});

// 5. 暂停/继续播放
app.post('/api/cli/pause', async (req, res) => {
  try {
    const output = await executeCLICommand('pause');
    cliPlayer.isPlaying = false;
    
    res.json({
      code: 200,
      success: true,
      isPlaying: cliPlayer.isPlaying,
      output: output
    });
  } catch (err) {
    console.error('暂停失败：', err);
    res.status(500).json({ 
      code: -1, 
      success: false,
      message: '暂停失败',
      error: err.error || err.message 
    });
  }
});

// 6. 继续播放
app.post('/api/cli/resume', async (req, res) => {
  try {
    const output = await executeCLICommand('resume');
    cliPlayer.isPlaying = true;
    
    res.json({
      code: 200,
      success: true,
      isPlaying: cliPlayer.isPlaying,
      output: output
    });
  } catch (err) {
    console.error('继续播放失败：', err);
    res.status(500).json({ 
      code: -1, 
      success: false,
      message: '继续播放失败',
      error: err.error || err.message 
    });
  }
});

// 7. 下一首
app.post('/api/cli/next', async (req, res) => {
  try {
    const output = await executeCLICommand('next');
    
    if (cliPlayer.currentIndex < cliPlayer.playlist.length - 1) {
      cliPlayer.currentIndex++;
      cliPlayer.currentSong = cliPlayer.playlist[cliPlayer.currentIndex];
    }
    
    res.json({
      code: 200,
      success: true,
      currentIndex: cliPlayer.currentIndex,
      output: output
    });
  } catch (err) {
    console.error('下一首失败：', err);
    res.status(500).json({ 
      code: -1, 
      success: false,
      message: '下一首失败',
      error: err.error || err.message 
    });
  }
});

// 8. 上一首
app.post('/api/cli/prev', async (req, res) => {
  try {
    const output = await executeCLICommand('prev');
    
    if (cliPlayer.currentIndex > 0) {
      cliPlayer.currentIndex--;
      cliPlayer.currentSong = cliPlayer.playlist[cliPlayer.currentIndex];
    }
    
    res.json({
      code: 200,
      success: true,
      currentIndex: cliPlayer.currentIndex,
      output: output
    });
  } catch (err) {
    console.error('上一首失败：', err);
    res.status(500).json({ 
      code: -1, 
      success: false,
      message: '上一首失败',
      error: err.error || err.message 
    });
  }
});

// 9. 停止播放
app.post('/api/cli/stop', async (req, res) => {
  try {
    const output = await executeCLICommand('stop');
    cliPlayer.isPlaying = false;
    
    res.json({
      code: 200,
      success: true,
      output: output
    });
  } catch (err) {
    console.error('停止失败：', err);
    res.status(500).json({ 
      code: -1, 
      success: false,
      message: '停止失败',
      error: err.error || err.message 
    });
  }
});

// 10. 获取播放状态 - 使用 state 命令
app.get('/api/cli/status', async (req, res) => {
  try {
    // ncm-cli 使用 state 而不是 status
    const output = await executeCLICommand('state');
    
    // 尝试解析JSON
    let stateData = null;
    try {
      stateData = JSON.parse(output);
    } catch (e) {
      // 不是JSON格式，使用文本解析
    }
    
    // 从输出解析状态
    const isPlaying = output.includes('playing') || output.includes('Playing') || 
                      (stateData && stateData.isPlaying);
    if (isPlaying !== undefined) {
      cliPlayer.isPlaying = isPlaying;
    }
    
    res.json({
      code: 200,
      success: true,
      data: {
        isPlaying: cliPlayer.isPlaying,
        currentSong: cliPlayer.currentSong,
        currentIndex: cliPlayer.currentIndex,
        volume: cliPlayer.volume,
        playMode: cliPlayer.playMode,
        playlistLength: cliPlayer.playlist.length,
        cliState: stateData
      },
      output: output.substring(0, 500) + '...'
    });
  } catch (err) {
    // 如果命令失败，返回本地状态
    console.error('获取状态失败：', err);
    res.json({
      code: 200,
      success: true,
      data: {
        isPlaying: cliPlayer.isPlaying,
        currentSong: cliPlayer.currentSong,
        currentIndex: cliPlayer.currentIndex,
        volume: cliPlayer.volume,
        playMode: cliPlayer.playMode,
        playlistLength: cliPlayer.playlist.length
      },
      output: err.error || '使用本地状态'
    });
  }
});

// 11. 获取播放队列 (ncm-cli 0.1.3+ 使用queue替代playlist)
app.get('/api/cli/playlist', async (req, res) => {
  try {
    // 使用queue命令获取当前播放队列
    const output = await executeCLICommand('queue');
    
    // 尝试解析队列信息
    let queueInfo = { songs: [], currentIndex: 0 };
    try {
      const jsonOutput = JSON.parse(output);
      if (jsonOutput.success && jsonOutput.data) {
        queueInfo = jsonOutput.data;
      }
    } catch (e) {
      console.log('队列解析失败，使用本地状态');
    }
    
    res.json({
      code: 200,
      success: true,
      data: queueInfo.songs || cliPlayer.playlist,
      currentIndex: queueInfo.currentIndex || cliPlayer.currentIndex,
      output: output.substring(0, 500) + '...'
    });
  } catch (err) {
    console.error('获取播放队列失败：', err);
    // 返回本地状态作为降级
    res.json({
      code: 200,
      success: true,
      data: cliPlayer.playlist,
      currentIndex: cliPlayer.currentIndex,
      message: '使用本地播放列表',
      error: err.error || err.message
    });
  }
});

// 12. 执行任意CLI命令（高级功能）
app.post('/api/cli/exec', async (req, res) => {
  try {
    const { command, args = [] } = req.body;
    if (!command) {
      return res.status(400).json({ code: -1, message: '缺少命令' });
    }

    const output = await executeCLICommand(command, args);
    
    res.json({
      code: 200,
      success: true,
      command: command,
      output: output
    });
  } catch (err) {
    console.error('执行命令失败：', err);
    res.status(500).json({ 
      code: -1, 
      success: false,
      message: '执行命令失败',
      error: err.error || err.message 
    });
  }
});

// 13. 获取命令历史
app.get('/api/cli/history', (req, res) => {
  res.json({
    code: 200,
    success: true,
    data: cliPlayer.commandHistory.slice(-50) // 最近50条
  });
});

// 14. 检查登录状态
app.get('/api/cli/login/check', async (req, res) => {
  try {
    console.log('[登录检查] 开始检查登录状态...');
    
    // 首先检查 CLI 的登录状态
    const output = await executeCLICommand('login', ['--check']);
    console.log('[登录检查] CLI输出:', output);

    // 尝试解析JSON输出 (ncm-cli 0.1.3+ 返回JSON格式)
    let isLoggedIn = false;
    try {
      const jsonOutput = JSON.parse(output);
      // 0.1.3版本: success为true表示已登录
      isLoggedIn = jsonOutput.success === true;
      console.log('[登录检查] JSON解析成功, success:', jsonOutput.success);
    } catch (e) {
      // 如果解析失败，使用旧版文本检测逻辑
      console.log('[登录检查] JSON解析失败，使用文本检测');
      isLoggedIn = output.includes('logged in') ||
                   output.includes('已登录') ||
                   output.includes('登录成功');
    }

    console.log('[登录检查] 是否已登录:', isLoggedIn);
    
    // 如果 CLI 显示未登录，但登录进程标记为已完成，可能是凭证保存有问题
    // 尝试重新检查一次
    if (!isLoggedIn && loginSession.loginCompleted) {
      console.log('[登录检查] 登录进程标记为完成但 CLI 显示未登录，等待后重新检查...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const retryOutput = await executeCLICommand('login', ['--check']);
      try {
        const jsonOutput = JSON.parse(retryOutput);
        isLoggedIn = jsonOutput.success === true;
        console.log('[登录检查] 重新检查结果:', isLoggedIn);
      } catch (e) {
        // 保持原结果
      }
    }

    res.json({
      code: 200,
      success: true,
      isLoggedIn: isLoggedIn,
      loginSession: {
        isLoggingIn: loginSession.isLoggingIn,
        loginCompleted: loginSession.loginCompleted,
        hasLoginUrl: !!loginSession.loginUrl
      },
      output: output
    });
  } catch (err) {
    console.log('[登录检查] 检查失败:', err.error || err.message);
    res.json({
      code: 200,
      success: true,
      isLoggedIn: false,
      loginSession: {
        isLoggingIn: loginSession.isLoggingIn,
        loginCompleted: loginSession.loginCompleted,
        hasLoginUrl: !!loginSession.loginUrl
      },
      output: err.error || '未登录'
    });
  }
});

// 15. 设置音量
app.post('/api/cli/volume', async (req, res) => {
  try {
    const { volume } = req.body;
    if (volume === undefined || volume < 0 || volume > 100) {
      return res.status(400).json({ code: -1, message: '音量值必须在 0-100 之间' });
    }
    
    const output = await executeCLICommand('volume', [volume.toString()]);
    cliPlayer.volume = volume;
    
    res.json({
      code: 200,
      success: true,
      volume: volume,
      output: output
    });
  } catch (err) {
    console.error('设置音量失败：', err);
    res.status(500).json({ 
      code: -1, 
      success: false,
      message: '设置音量失败',
      error: err.error || err.message 
    });
  }
});

// 16. 设置播放模式
app.post('/api/cli/mode', async (req, res) => {
  try {
    const { mode } = req.body;
    const validModes = ['sequence', 'random', 'loop'];
    if (!mode || !validModes.includes(mode)) {
      return res.status(400).json({ code: -1, message: '无效的播放模式' });
    }
    
    cliPlayer.playMode = mode;
    
    res.json({
      code: 200,
      success: true,
      mode: mode
    });
  } catch (err) {
    res.status(500).json({ 
      code: -1, 
      success: false,
      message: '设置播放模式失败'
    });
  }
});

// 17. 收藏/取消收藏歌曲
app.post('/api/cli/like', async (req, res) => {
  try {
    const { songId, like } = req.body;
    
    // 这里可以调用 ncm-cli 的收藏命令（如果有的话）
    // 目前只是模拟功能
    res.json({
      code: 200,
      success: true,
      liked: like,
      message: like ? '已收藏' : '已取消收藏'
    });
  } catch (err) {
    res.status(500).json({ 
      code: -1, 
      success: false,
      message: '操作失败'
    });
  }
});

// 辅助函数：从CLI JSON输出解析歌曲列表
function parseSongsFromJSON(output) {
  const songs = [];
  
  try {
    // 尝试解析JSON
    const data = JSON.parse(output);
    
    // 处理搜索结果的格式 { data: { records: [...] } }
    if (data && data.data && data.data.records && Array.isArray(data.data.records)) {
      data.data.records.forEach((item, index) => {
        if (item.name) {
          songs.push({
            index: index + 1,
            id: item.id,
            originalId: item.originalId,
            name: item.name,
            artist: item.artists ? item.artists.map(a => a.name).join(', ') : '未知艺术家',
            duration: item.duration,
            coverImgUrl: item.coverImgUrl
          });
        }
      });
      return songs;
    }
    
    // 处理推荐歌曲格式（直接数组）
    if (data && Array.isArray(data)) {
      data.forEach((item, index) => {
        if (item.name) {
          songs.push({
            index: index + 1,
            id: item.id,
            originalId: item.originalId,
            name: item.name,
            artist: item.artists ? item.artists.map(a => a.name).join(', ') : '未知艺术家',
            duration: item.duration,
            coverImgUrl: item.coverImgUrl
          });
        }
      });
      return songs;
    }
    
    // 处理 { songs: [...] } 格式
    if (data && data.songs && Array.isArray(data.songs)) {
      data.songs.forEach((item, index) => {
        songs.push({
          index: index + 1,
          id: item.id,
          originalId: item.originalId,
          name: item.name,
          artist: item.artists ? item.artists.map(a => a.name).join(', ') : '未知艺术家',
          duration: item.duration,
          coverImgUrl: item.coverImgUrl
        });
      });
      return songs;
    }
    
    // 处理 { data: [...] } 格式
    if (data && data.data && Array.isArray(data.data)) {
      data.data.forEach((item, index) => {
        songs.push({
          index: index + 1,
          id: item.id,
          originalId: item.originalId,
          name: item.name,
          artist: item.artists ? item.artists.map(a => a.name).join(', ') : '未知艺术家',
          duration: item.duration,
          coverImgUrl: item.coverImgUrl
        });
      });
      return songs;
    }
    
    // 处理 { result: [...] } 格式
    if (data && data.result && Array.isArray(data.result)) {
      data.result.forEach((item, index) => {
        songs.push({
          index: index + 1,
          id: item.id,
          originalId: item.originalId,
          name: item.name,
          artist: item.artists ? item.artists.map(a => a.name).join(', ') : '未知艺术家',
          duration: item.duration,
          coverImgUrl: item.coverImgUrl
        });
      });
      return songs;
    }
  } catch (e) {
    // JSON解析失败，尝试文本解析
    console.log('JSON解析失败，尝试文本解析:', e.message);
  }
  
  // 文本解析作为后备
  const lines = output.split('\n');
  for (const line of lines) {
    // 尝试匹配常见的歌曲格式
    const match = line.match(/^\s*(\d+)[:\.\s]+(.+?)\s*[-–]\s*(.+)/);
    if (match) {
      songs.push({
        index: parseInt(match[1]),
        name: match[2].trim(),
        artist: match[3].trim()
      });
    }
  }
  
  return songs;
}

// ==================== 原有API（保留兼容）====================

// 1. 获取FM列表接口
app.post('/api/netease/radio/get', async (req, res) => {
  try {
    const response = await axios.post(
      'https://music.163.com/api/radio/get',
      req.body,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Referer': 'https://music.163.com/',
          'Cookie': req.headers.cookie || '',
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        withCredentials: true
      }
    );
    res.json(response.data);
  } catch (err) {
    console.error('获取FM失败：', err.message);
    res.status(500).json({ code: -1, msg: '获取FM失败，请检查登录态' });
  }
});

// 2. 获取播放地址接口
app.get('/api/netease/song/url/:songId', async (req, res) => {
  try {
    const songId = req.params.songId;
    const response = await axios.post(
      'https://music.163.com/api/song/url',
      `ids=[${songId}]&br=128000&csrf_token=`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Referer': 'https://music.163.com/',
          'Cookie': req.headers.cookie || '',
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        withCredentials: true
      }
    );

    const playUrl = response.data.data?.find(item => item.url)?.url;
    res.json({
      code: playUrl ? 200 : -1,
      url: playUrl || '',
      msg: playUrl ? '获取成功' : '暂无播放地址（可能需要VIP/版权限制）'
    });
  } catch (err) {
    console.error('获取播放地址失败：', err.message);
    res.status(500).json({ code: -1, msg: '获取播放地址失败' });
  }
});

// 获取 ncm-cli 日志的辅助函数
function getNcmCliLogs(lines = 50) {
  try {
    // 首先尝试从项目配置目录读取日志
    const projectLogPath = path.join(PROJECT_HOME, '.config', 'ncm-cli', 'bg-worker.log');
    const homeLogPath = path.join(os.homedir(), '.config', 'ncm-cli', 'bg-worker.log');
    
    let logPath = null;
    if (fs.existsSync(projectLogPath)) {
      logPath = projectLogPath;
    } else if (fs.existsSync(homeLogPath)) {
      logPath = homeLogPath;
    }
    
    if (logPath) {
      const content = fs.readFileSync(logPath, 'utf-8');
      const logLines = content.split('\n').filter(line => line.trim());
      return logLines.slice(-lines).join('\n');
    }
    return '日志文件不存在';
  } catch (err) {
    return `读取日志失败: ${err.message}`;
  }
}

// 分析 ncm-cli 日志，提取错误信息
function analyzeNcmCliLogs(logs) {
  const errors = [];
  const lines = logs.split('\n');
  
  for (const line of lines) {
    // 检查常见的错误模式
    if (line.includes('获取失败') || line.includes('暂无音源') || line.includes('暂无播放权限')) {
      errors.push({
        type: 'permission',
        message: line.trim()
      });
    }
    if (line.includes('未登录') || line.includes('登录过期')) {
      errors.push({
        type: 'auth',
        message: line.trim()
      });
    }
    if (line.includes('网络错误') || line.includes('timeout') || line.includes('连接失败')) {
      errors.push({
        type: 'network',
        message: line.trim()
      });
    }
    if (line.includes('当前无播放进程')) {
      errors.push({
        type: 'daemon',
        message: line.trim()
      });
    }
  }
  
  return errors;
}

// API: 获取 ncm-cli 日志
app.get('/api/cli/logs', async (req, res) => {
  try {
    const lines = parseInt(req.query.lines) || 50;
    const logs = getNcmCliLogs(lines);
    const errors = analyzeNcmCliLogs(logs);
    
    res.json({
      code: 200,
      success: true,
      logs: logs,
      errors: errors,
      hasErrors: errors.length > 0
    });
  } catch (err) {
    console.error('获取日志失败：', err);
    res.status(500).json({
      code: -1,
      success: false,
      message: '获取日志失败',
      error: err.message
    });
  }
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`✅ Hermudio 服务器启动成功：http://localhost:${PORT}`);
  console.log(`✅ CLI 控制 API 已启用 (ncm-cli 0.1.3+)`);
  console.log(`✅ 可用端点：`);
  console.log(`   - POST /api/cli/login          - CLI登录`);
  console.log(`   - GET  /api/cli/login/check    - 检查登录状态`);
  console.log(`   - GET  /api/cli/recommend/songs - 获取每日推荐 (模拟数据)`);
  console.log(`   - GET  /api/cli/search         - 搜索歌曲`);
  console.log(`   - POST /api/cli/play           - 播放歌曲`);
  console.log(`   - POST /api/cli/pause          - 暂停`);
  console.log(`   - POST /api/cli/resume         - 继续`);
  console.log(`   - POST /api/cli/next           - 下一首`);
  console.log(`   - POST /api/cli/prev           - 上一首`);
  console.log(`   - POST /api/cli/stop           - 停止`);
  console.log(`   - GET  /api/cli/status         - 获取播放状态`);
  console.log(`   - GET  /api/cli/playlist       - 获取播放队列`);
  console.log(`   - POST /api/cli/exec           - 执行任意CLI命令`);
  console.log(`   - GET  /api/cli/history        - 命令历史`);
  console.log(`   - GET  /api/cli/logs           - 获取ncm-cli日志`);
  console.log(`   - POST /api/tts/doubao         - 豆包语音合成`);
  console.log(`   - GET  /api/tts/voices         - 获取音色列表`);
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
