// DJ 电台全屏视图控制器
class DJView {
  constructor() {
    this.isActive = false;
    this.canvas = null;
    this.ctx = null;
    this.animationId = null;
    this.audioData = new Array(64).fill(0);
    this.waveOffset = 0;
    this.currentTranscript = '';
    this.isSpeaking = false;
    this.currentSong = null;
    this.progress = 0;
    this.volume = 80;
    this.isPlaying = false;
  }

  // 创建 DJ 视图
  create() {
    if (document.getElementById('dj-fullscreen-view')) return;

    const djView = document.createElement('div');
    djView.id = 'dj-fullscreen-view';
    djView.className = 'dj-fullscreen-view';
    djView.innerHTML = `
      <!-- 流体渐变背景 -->
      <div class="dj-fluid-bg">
        <div class="gradient-blob blob-1"></div>
        <div class="gradient-blob blob-2"></div>
        <div class="gradient-blob blob-3"></div>
        <div class="gradient-blob blob-4"></div>
      </div>
      
      <!-- 音频可视化画布 -->
      <canvas id="dj-visualizer" class="dj-visualizer"></canvas>
      
      <!-- 主内容区 -->
      <div class="dj-content">
        <!-- 顶部栏 -->
        <div class="dj-header">
          <div class="dj-station-info">
            <div class="dj-live-indicator">
              <span class="live-dot"></span>
              <span class="live-text">LIVE</span>
            </div>
            <div class="dj-station-name">HERMUDIO</div>
          </div>
          <div class="dj-time" id="djFullscreenTime">--:--</div>
          <button class="dj-close-btn" id="djCloseBtn" title="退出DJ模式">✕</button>
        </div>
        
        <!-- 中央卡片 -->
        <div class="dj-card">
          <div class="dj-card-header">
            <div class="dj-avatar">
              <div class="dj-avatar-inner">
                <span>🎙️</span>
              </div>
              <div class="dj-avatar-ring"></div>
            </div>
            <div class="dj-info">
              <div class="dj-name">Hermes DJ</div>
              <div class="dj-status" id="djStatusText">正在播放</div>
            </div>
            <div class="dj-weather-badge" id="djWeatherBadge">
              <span class="weather-icon">🌤</span>
              <span class="weather-text">--</span>
            </div>
          </div>
          
          <div class="dj-card-body">
            <div class="dj-transcript-area">
              <div class="transcript-label">DJ 正在说</div>
              <div class="transcript-text" id="djTranscriptText">
                欢迎来到 Hermudio，我是你的专属 DJ。让我为你推荐今天的好音乐...
              </div>
            </div>
            
            <div class="dj-song-info" id="djSongInfo">
              <div class="song-cover-placeholder">
                <div class="cover-wave">
                  <span></span><span></span><span></span><span></span>
                </div>
              </div>
              <div class="song-meta">
                <div class="song-name" id="djFullscreenSongName">--</div>
                <div class="song-artist" id="djFullscreenArtist">--</div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- 底部迷你播放器 -->
        <div class="dj-mini-player">
          <div class="mini-progress">
            <div class="progress-bar">
              <div class="progress-fill" id="djFullscreenProgress"></div>
            </div>
            <div class="time-display">
              <span id="djFullscreenCurrTime">0:00</span>
              <span id="djFullscreenTotalTime">0:00</span>
            </div>
          </div>
          
          <div class="mini-controls">
            <button class="mini-btn" id="djFullscreenPrev">⏮</button>
            <button class="mini-btn play-btn" id="djFullscreenPlay">▶</button>
            <button class="mini-btn" id="djFullscreenNext">⏭</button>
            <div class="mini-volume">
              <span>🔊</span>
              <div class="volume-bar">
                <div class="volume-fill" id="djFullscreenVolume"></div>
              </div>
            </div>
            <button class="mini-btn" id="djFullscreenMode" title="切换模式">🔁</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(djView);
    this.bindEvents();
    this.initVisualizer();
    this.startClock();
  }

  // 绑定事件
  bindEvents() {
    const closeBtn = document.getElementById('djCloseBtn');
    if (closeBtn) {
      closeBtn.onclick = () => this.hide();
    }

    // 播放控制
    const playBtn = document.getElementById('djFullscreenPlay');
    const prevBtn = document.getElementById('djFullscreenPrev');
    const nextBtn = document.getElementById('djFullscreenNext');

    if (playBtn) {
      playBtn.onclick = async () => {
        if (this.isPlaying) {
          await CLIController.pause();
        } else {
          await CLIController.play();
        }
      };
    }

    if (prevBtn) {
      prevBtn.onclick = async () => {
        await CLIController.prev();
      };
    }

    if (nextBtn) {
      nextBtn.onclick = async () => {
        await CLIController.next();
      };
    }

    // 音量控制
    const volumeBar = document.querySelector('.mini-volume .volume-bar');
    if (volumeBar) {
      volumeBar.onclick = (e) => {
        const rect = volumeBar.getBoundingClientRect();
        const percent = Math.round(((e.clientX - rect.left) / rect.width) * 100);
        CLIController.setVolume(percent);
      };
    }

    // 进度条控制
    const progressBar = document.querySelector('.mini-progress .progress-bar');
    if (progressBar) {
      progressBar.onclick = (e) => {
        // 这里可以添加跳转功能
        console.log('进度条点击');
      };
    }
  }

  // 初始化音频可视化
  initVisualizer() {
    this.canvas = document.getElementById('dj-visualizer');
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext('2d');
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
    
    this.startAnimation();
  }

  // 调整画布大小
  resizeCanvas() {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  // 开始动画
  startAnimation() {
    const animate = () => {
      if (!this.isActive) return;
      
      this.drawVisualizer();
      this.animationId = requestAnimationFrame(animate);
    };
    animate();
  }

  // 绘制音频可视化
  drawVisualizer() {
    if (!this.ctx || !this.canvas) return;

    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    ctx.clearRect(0, 0, width, height);

    // 生成模拟音频数据
    this.waveOffset += 0.05;
    for (let i = 0; i < this.audioData.length; i++) {
      const baseValue = Math.sin(this.waveOffset + i * 0.2) * 0.5 + 0.5;
      const noise = Math.random() * 0.3;
      this.audioData[i] = Math.max(0, Math.min(1, baseValue * 0.7 + noise * 0.3));
      
      // 如果正在播放，增加波动
      if (this.isPlaying) {
        this.audioData[i] *= (0.5 + Math.random() * 0.5);
      }
    }

    const barCount = 64;
    const barWidth = width / barCount;
    const centerY = height / 2;

    // 绘制波形
    for (let i = 0; i < barCount; i++) {
      const value = this.audioData[i];
      const barHeight = value * height * 0.4;
      
      const x = i * barWidth;
      
      // 渐变颜色
      const gradient = ctx.createLinearGradient(0, centerY - barHeight, 0, centerY + barHeight);
      gradient.addColorStop(0, 'rgba(74, 222, 128, 0.3)');
      gradient.addColorStop(0.5, 'rgba(96, 165, 250, 0.5)');
      gradient.addColorStop(1, 'rgba(74, 222, 128, 0.3)');
      
      ctx.fillStyle = gradient;
      
      // 上下对称的波形
      ctx.fillRect(x + 2, centerY - barHeight / 2, barWidth - 4, barHeight);
    }

    // 绘制中心线
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();
  }

  // 启动时钟
  startClock() {
    const updateTime = () => {
      const timeEl = document.getElementById('djFullscreenTime');
      if (timeEl) {
        timeEl.textContent = new Date().toTimeString().slice(0, 5);
      }
    };
    updateTime();
    this.clockInterval = setInterval(updateTime, 1000);
  }

  // 显示 DJ 视图
  show() {
    this.create();
    const view = document.getElementById('dj-fullscreen-view');
    if (view) {
      view.classList.add('active');
      this.isActive = true;
      this.startAnimation();
    }
  }

  // 隐藏 DJ 视图
  hide() {
    const view = document.getElementById('dj-fullscreen-view');
    if (view) {
      view.classList.remove('active');
      this.isActive = false;
      if (this.animationId) {
        cancelAnimationFrame(this.animationId);
      }
    }
    
    // 触发退出回调
    if (this.onClose) {
      this.onClose();
    }
  }

  // 更新 DJ 话术
  updateTranscript(text, speaking = false) {
    this.currentTranscript = text;
    this.isSpeaking = speaking;
    
    const transcriptEl = document.getElementById('djTranscriptText');
    if (transcriptEl) {
      transcriptEl.textContent = text;
      if (speaking) {
        transcriptEl.classList.add('speaking');
      } else {
        transcriptEl.classList.remove('speaking');
      }
    }
  }

  // 更新歌曲信息
  updateSongInfo(song) {
    this.currentSong = song;
    
    const nameEl = document.getElementById('djFullscreenSongName');
    const artistEl = document.getElementById('djFullscreenArtist');
    
    if (nameEl) nameEl.textContent = song.name || '--';
    if (artistEl) artistEl.textContent = song.artist || '--';
  }

  // 更新播放状态
  updatePlayState(isPlaying) {
    this.isPlaying = isPlaying;
    
    const playBtn = document.getElementById('djFullscreenPlay');
    const statusText = document.getElementById('djStatusText');
    
    if (playBtn) {
      playBtn.textContent = isPlaying ? '⏸' : '▶';
    }
    if (statusText) {
      statusText.textContent = isPlaying ? '正在播放' : '已暂停';
    }
  }

  // 更新进度
  updateProgress(current, total) {
    this.progress = total > 0 ? (current / total) * 100 : 0;
    
    const progressEl = document.getElementById('djFullscreenProgress');
    const currTimeEl = document.getElementById('djFullscreenCurrTime');
    const totalTimeEl = document.getElementById('djFullscreenTotalTime');
    
    if (progressEl) {
      progressEl.style.width = this.progress + '%';
    }
    if (currTimeEl) {
      currTimeEl.textContent = this.formatTime(current);
    }
    if (totalTimeEl) {
      totalTimeEl.textContent = this.formatTime(total);
    }
  }

  // 更新音量
  updateVolume(volume) {
    this.volume = volume;
    
    const volumeEl = document.getElementById('djFullscreenVolume');
    if (volumeEl) {
      volumeEl.style.width = volume + '%';
    }
  }

  // 更新天气
  updateWeather(weather, icon) {
    const badge = document.getElementById('djWeatherBadge');
    if (badge) {
      const iconEl = badge.querySelector('.weather-icon');
      const textEl = badge.querySelector('.weather-text');
      if (iconEl) iconEl.textContent = icon || '🌤';
      if (textEl) textEl.textContent = weather || '--';
    }
  }

  // 格式化时间
  formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // 销毁
  destroy() {
    this.hide();
    if (this.clockInterval) {
      clearInterval(this.clockInterval);
    }
    const view = document.getElementById('dj-fullscreen-view');
    if (view) {
      view.remove();
    }
  }
}

// 创建全局实例
const djView = new DJView();
