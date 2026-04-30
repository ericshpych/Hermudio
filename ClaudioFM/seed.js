const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./data/hermudio.db');

const songs = [
  ['1', '晴天', '周杰伦', '叶惠美', '流行,轻快', 10],
  ['2', '夜曲', '周杰伦', '十一月的萧邦', '流行,抒情', 8],
  ['3', '稻香', '周杰伦', '魔杰座', '流行,治愈', 15],
  ['4', '告白气球', '周杰伦', '周杰伦的床边故事', '流行,甜蜜', 12],
  ['5', '成都', '赵雷', '无法长大', '民谣,安静', 20],
  ['6', '南山南', '马頔', '孤岛', '民谣,抒情', 6],
  ['7', '消愁', '毛不易', '平凡的一天', '民谣,治愈', 18],
  ['8', '爵士早餐', 'Various Artists', 'Jazz Collection', '爵士,轻音乐', 5],
  ['9', '深夜钢琴', '钢琴大师', 'Piano Night', '钢琴,轻音乐', 25],
  ['10', '雨声', '自然音乐', 'Nature Sounds', '轻音乐,白噪音', 30]
];

db.serialize(() => {
  const stmt = db.prepare('INSERT OR REPLACE INTO local_library (song_id, song_name, artist, album, styles, can_play, play_count) VALUES (?, ?, ?, ?, ?, 1, ?)');
  songs.forEach(s => stmt.run(s));
  stmt.finalize(() => {
    console.log('Seeded ' + songs.length + ' songs');
    db.close();
  });
});
