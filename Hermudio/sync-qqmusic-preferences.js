/**
 * 同步 QQ 音乐偏好到 Hermudio 数据库
 * 
 * 从 QQ 音乐数据中提取：
 * - 喜欢的艺人（周杰伦、滨崎步、陈奕迅、王菲、beyond、久石让等）
 * - 喜欢的风格（爵士、流行、古典、轻音乐等）
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// QQ 音乐数据分析结果
const qqMusicPreferences = {
  // 主要艺人（根据播放次数排序）
  preferredArtists: [
    '滨崎步', '周杰伦', '陈奕迅', '王菲', 'Beyond', 
    '久石让', '宫崎骏', 'Nujabes', 'Cafe Music BGM channel',
    'Bob James', 'Nathan East', '山本剛', 'Eddie Higgins'
  ],
  
  // 主要风格
  preferredStyles: [
    '爵士', '流行', '轻音乐', '古典', '钢琴', 
    'Bossa Nova', '纯音乐', '咖啡厅音乐', 'Jazz'
  ],
  
  // 不喜欢的（根据之前的反馈）
  dislikedStyles: [
    '电子', '嘻哈', '说唱', '白噪音', '虫鸣'
  ]
};

async function syncPreferences() {
  const dbPath = path.join(__dirname, 'data', 'hermudio.db');
  
  console.log('Opening database:', dbPath);
  
  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Error opening database:', err);
      process.exit(1);
    }
    console.log('Connected to SQLite database');
  });

  const userId = 'default';
  const now = new Date().toISOString();
  
  // 准备数据
  const prefs = {
    preferredStyles: qqMusicPreferences.preferredStyles,
    preferredArtists: qqMusicPreferences.preferredArtists,
    dislikedStyles: qqMusicPreferences.dislikedStyles,
    playHistory: [],
    skipPatterns: {},
    favoriteTimes: {},
    createdAt: now,
    updatedAt: now
  };

  console.log('\n将要同步的偏好设置:');
  console.log('喜欢的艺人:', prefs.preferredArtists.join(', '));
  console.log('喜欢的风格:', prefs.preferredStyles.join(', '));
  console.log('不喜欢的风格:', prefs.dislikedStyles.join(', '));
  console.log('');

  // 更新数据库
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO user_profiles 
      (user_id, preferred_styles, preferred_artists, disliked_styles, 
       play_history, skip_patterns, favorite_times, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      userId,
      JSON.stringify(prefs.preferredStyles),
      JSON.stringify(prefs.preferredArtists),
      JSON.stringify(prefs.dislikedStyles),
      JSON.stringify(prefs.playHistory),
      JSON.stringify(prefs.skipPatterns),
      JSON.stringify(prefs.favoriteTimes),
      prefs.createdAt,
      prefs.updatedAt,
      (err) => {
        if (err) {
          console.error('Error updating preferences:', err);
          reject(err);
        } else {
          console.log('✅ 用户偏好已成功同步到数据库!');
          console.log('');
          console.log('下次推荐将基于这些真实偏好：');
          console.log('- 艺人：周杰伦、滨崎步、陈奕迅、王菲等');
          console.log('- 风格：爵士、流行、轻音乐、古典、钢琴');
          console.log('- 排除：电子、嘻哈、说唱、白噪音');
          resolve();
        }
      }
    );

    stmt.finalize();
  }).finally(() => {
    db.close();
  });
}

// 执行同步
syncPreferences().catch(console.error);
