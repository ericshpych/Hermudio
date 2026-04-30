/**
 * Seed data for Hermudio
 * 初始化数据库测试数据
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'hermudio.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Database connection failed:', err);
    process.exit(1);
  }
  console.log('Connected to SQLite database');
});

const songs = [
  { id: '1', name: '晴天', artist: '周杰伦', album: '叶惠美', styles: '流行,轻快', playCount: 10 },
  { id: '2', name: '夜曲', artist: '周杰伦', album: '十一月的萧邦', styles: '流行,抒情', playCount: 8 },
  { id: '3', name: '稻香', artist: '周杰伦', album: '魔杰座', styles: '流行,治愈', playCount: 15 },
  { id: '4', name: '告白气球', artist: '周杰伦', album: '周杰伦的床边故事', styles: '流行,甜蜜', playCount: 12 },
  { id: '5', name: '演员', artist: '薛之谦', album: '初学者', styles: '流行,伤感', playCount: 9 },
  { id: '6', name: '成都', artist: '赵雷', album: '无法长大', styles: '民谣,安静', playCount: 20 },
  { id: '7', name: '南山南', artist: '马頔', album: '孤岛', styles: '民谣,抒情', playCount: 6 },
  { id: '8', name: '消愁', artist: '毛不易', album: '平凡的一天', styles: '民谣,治愈', playCount: 18 },
  { id: '9', name: '爵士早餐', artist: 'Various Artists', album: 'Jazz Collection', styles: '爵士,轻音乐', playCount: 5 },
  { id: '10', name: '深夜钢琴', artist: '钢琴大师', album: 'Piano Night', styles: '钢琴,轻音乐', playCount: 25 },
  { id: '11', name: 'Morning Coffee', artist: 'Lo-Fi Beats', album: 'Chill Vibes', styles: '轻音乐,放松', playCount: 7 },
  { id: '12', name: '雨声', artist: '自然音乐', album: 'Nature Sounds', styles: '轻音乐,白噪音', playCount: 30 },
  { id: '13', name: '摇滚不死', artist: '摇滚乐队', album: 'Rock On', styles: '摇滚,激情', playCount: 4 },
  { id: '14', name: '古典精选', artist: '交响乐团', album: 'Classical Best', styles: '古典,专注', playCount: 3 },
  { id: '15', name: '电子迷幻', artist: 'DJ Max', album: 'Electronic Dreams', styles: '电子,迷幻', playCount: 2 }
];

function seedDatabase() {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO local_library 
      (song_id, song_name, artist, album, styles, can_play, play_count)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `);

    let count = 0;
    songs.forEach((song) => {
      stmt.run(song.id, song.name, song.artist, song.album, song.styles, song.playCount, (err) => {
        if (err) {
          console.error(`Error inserting ${song.name}:`, err);
        } else {
          count++;
        }
      });
    });

    stmt.finalize((err) => {
      if (err) {
        reject(err);
      } else {
        console.log(`✓ Successfully seeded ${count} songs`);
        resolve();
      }
    });
  });
}

async function main() {
  try {
    await seedDatabase();
    console.log('\nDatabase seeding completed!');
  } catch (error) {
    console.error('Seeding failed:', error);
  } finally {
    db.close();
  }
}

main();
