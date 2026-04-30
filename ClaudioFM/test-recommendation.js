/**
 * 推荐引擎测试脚本
 * 使用 Mock 数据测试推荐逻辑
 */

const sqlite3 = require('sqlite3').verbose();
const { RecommendationEngine } = require('./src/recommendation-engine');
const { UserProfile } = require('./src/user-profile');

// Mock 音乐数据
const MOCK_SONGS = [
  { id: '1', name: '晴天', artist: '周杰伦', album: '叶惠美', styles: '流行,轻快' },
  { id: '2', name: '夜曲', artist: '周杰伦', album: '十一月的萧邦', styles: '流行,抒情' },
  { id: '3', name: '稻香', artist: '周杰伦', album: '魔杰座', styles: '流行,治愈' },
  { id: '4', name: '告白气球', artist: '周杰伦', album: '周杰伦的床边故事', styles: '流行,甜蜜' },
  { id: '5', name: '演员', artist: '薛之谦', album: '初学者', styles: '流行,伤感' },
  { id: '6', name: '成都', artist: '赵雷', album: '无法长大', styles: '民谣,安静' },
  { id: '7', name: '南山南', artist: '马頔', album: '孤岛', styles: '民谣,抒情' },
  { id: '8', name: '消愁', artist: '毛不易', album: '平凡的一天', styles: '民谣,治愈' },
  { id: '9', name: '爵士早餐', artist: 'Various Artists', album: 'Jazz Collection', styles: '爵士,轻音乐' },
  { id: '10', name: '深夜钢琴', artist: '钢琴大师', album: 'Piano Night', styles: '钢琴,轻音乐' },
  { id: '11', name: 'Morning Coffee', artist: 'Lo-Fi Beats', album: 'Chill Vibes', styles: '轻音乐,放松' },
  { id: '12', name: '雨声', artist: '自然音乐', album: 'Nature Sounds', styles: '轻音乐,白噪音' },
  { id: '13', name: '摇滚不死', artist: '摇滚乐队', album: 'Rock On', styles: '摇滚,激情' },
  { id: '14', name: '古典精选', artist: '交响乐团', album: 'Classical Best', styles: '古典,专注' },
  { id: '15', name: '电子迷幻', artist: 'DJ Max', album: 'Electronic Dreams', styles: '电子,迷幻' }
];

// 创建内存数据库
function createMockDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(':memory:', (err) => {
      if (err) {
        reject(err);
        return;
      }
      console.log('✓ Mock 内存数据库已创建');
      resolve(db);
    });
  });
}

// 初始化数据库表
function initTables(db) {
  return new Promise((resolve, reject) => {
    db.exec(`
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
      );

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
      );

      CREATE TABLE IF NOT EXISTS play_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        song_id TEXT NOT NULL,
        played_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS user_feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        song_id TEXT NOT NULL,
        song_name TEXT,
        artist TEXT,
        action TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `, (err) => {
      if (err) {
        reject(err);
        return;
      }
      console.log('✓ 数据库表已初始化');
      resolve();
    });
  });
}

// 插入 Mock 歌曲数据
function insertMockSongs(db) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT INTO local_library (song_id, song_name, artist, album, styles, can_play, play_count)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `);

    MOCK_SONGS.forEach((song, index) => {
      const playCount = Math.floor(Math.random() * 50); // 随机播放次数
      stmt.run(song.id, song.name, song.artist, song.album, song.styles, playCount);
    });

    stmt.finalize((err) => {
      if (err) {
        reject(err);
        return;
      }
      console.log(`✓ 已插入 ${MOCK_SONGS.length} 首 Mock 歌曲`);
      resolve();
    });
  });
}

// 创建测试用户画像
async function createTestUserProfile(userProfile) {
  await userProfile.updatePreferences('test-user', {
    preferredStyles: ['流行', '轻音乐', '民谣'],
    preferredArtists: ['周杰伦', '赵雷'],
    dislikedStyles: ['摇滚'],
    playHistory: [
      { songId: '1', timestamp: new Date().toISOString(), completed: true },
      { songId: '6', timestamp: new Date().toISOString(), completed: true }
    ]
  });
  console.log('✓ 测试用户画像已创建');
}

// 测试场景推荐
async function testSceneRecommendation(engine, userId) {
  console.log('\n📍 测试场景推荐:');
  console.log('─────────────────');
  
  const recommendation = await engine.getRecommendation({ userId });
  
  if (recommendation && recommendation.song) {
    console.log(`✓ 推荐歌曲: ${recommendation.song.name} - ${recommendation.song.artist}`);
    console.log(`  来源: ${recommendation.source}`);
    console.log(`  理由: ${recommendation.reason}`);
  } else {
    console.log('✗ 未获取到推荐');
  }
  
  return recommendation;
}

// 测试风格推荐
async function testStyleRecommendation(engine) {
  console.log('\n🎵 测试风格推荐:');
  console.log('─────────────────');
  
  const styles = ['jazz', 'piano', 'pop', 'folk'];
  
  for (const style of styles) {
    const recommendation = await engine.recommendByStyle(style);
    if (recommendation && recommendation.song) {
      console.log(`✓ ${style}风格: ${recommendation.song.name} - ${recommendation.song.artist}`);
    } else {
      console.log(`✗ ${style}风格: 未找到推荐`);
    }
  }
}

// 测试特定歌曲推荐
async function testSpecificSongRecommendation(engine) {
  console.log('\n🎯 测试特定歌曲推荐:');
  console.log('─────────────────');
  
  const queries = ['晴天', '成都', '告白气球', '不存在的歌曲'];
  
  for (const query of queries) {
    const recommendation = await engine.recommendSpecificSong(query);
    if (recommendation && recommendation.song) {
      console.log(`✓ "${query}": ${recommendation.song.name} - ${recommendation.song.artist}`);
    } else {
      console.log(`✗ "${query}": 未找到`);
    }
  }
}

// 测试艺人推荐
async function testArtistRecommendation(engine) {
  console.log('\n👤 测试艺人推荐:');
  console.log('─────────────────');
  
  const artists = ['周杰伦', '赵雷', '毛不易', '不存在的艺人'];
  
  for (const artist of artists) {
    const recommendation = await engine.recommendByArtist(artist);
    if (recommendation && recommendation.song) {
      console.log(`✓ "${artist}": ${recommendation.song.name}`);
    } else {
      console.log(`✗ "${artist}": 未找到`);
    }
  }
}

// 测试聊天推荐
async function testChatRecommendation(engine) {
  console.log('\n💬 测试聊天推荐:');
  console.log('─────────────────');
  
  const messages = [
    '播放轻音乐',
    '我想听爵士',
    '来首周杰伦的歌',
    '播放《晴天》',
    '随便推荐一首'
  ];
  
  for (const message of messages) {
    const recommendation = await engine.getChatRecommendation(message);
    if (recommendation && recommendation.song) {
      console.log(`✓ "${message}": ${recommendation.song.name} - ${recommendation.song.artist}`);
    } else {
      console.log(`✗ "${message}": 未找到推荐`);
    }
  }
}

// 测试用户画像学习
async function testUserProfileLearning(userProfile) {
  console.log('\n👤 测试用户画像学习:');
  console.log('─────────────────');
  
  // 记录反馈
  await userProfile.recordFeedback('test-user', '1', { name: '晴天', artist: '周杰伦', style: '流行' }, 'like');
  console.log('✓ 已记录喜欢: 晴天');
  
  await userProfile.recordFeedback('test-user', '5', { name: '演员', artist: '薛之谦', style: '伤感' }, 'dislike');
  console.log('✓ 已记录不喜欢: 演员');
  
  // 获取更新后的画像
  const profile = await userProfile.getPreferences('test-user');
  console.log('\n更新后的用户画像:');
  console.log(`  喜欢的风格: ${profile.preferredStyles.join(', ')}`);
  console.log(`  喜欢的艺人: ${profile.preferredArtists.join(', ')}`);
  console.log(`  不喜欢的风格: ${profile.dislikedStyles.join(', ')}`);
  
  // 获取统计
  const stats = await userProfile.getStats('test-user');
  console.log('\n用户统计:');
  console.log(`  独特歌曲数: ${stats.uniqueSongs}`);
  console.log(`  喜欢: ${stats.likes}`);
  console.log(`  不喜欢: ${stats.dislikes}`);
}

// 运行所有测试
async function runTests() {
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║     Hermudio 推荐引擎测试                      ║');
  console.log('╚════════════════════════════════════════════════╝\n');
  
  let db;
  
  try {
    // 1. 创建 Mock 数据库
    db = await createMockDatabase();
    
    // 2. 初始化表
    await initTables(db);
    
    // 3. 插入 Mock 数据
    await insertMockSongs(db);
    
    // 4. 初始化服务
    const userProfile = new UserProfile(db);
    const engine = new RecommendationEngine(db, userProfile);
    
    // 5. 创建测试用户
    await createTestUserProfile(userProfile);
    
    // 6. 运行各项测试
    await testSceneRecommendation(engine, 'test-user');
    await testStyleRecommendation(engine);
    await testSpecificSongRecommendation(engine);
    await testArtistRecommendation(engine);
    await testChatRecommendation(engine);
    await testUserProfileLearning(userProfile);
    
    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║     所有测试完成!                              ║');
    console.log('╚════════════════════════════════════════════════╝');
    
  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    console.error(error.stack);
  } finally {
    if (db) {
      db.close();
      console.log('\n✓ 数据库已关闭');
    }
  }
}

// 执行测试
runTests();
