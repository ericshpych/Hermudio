#!/bin/bash

DB_PATH="$HOME/Library/Containers/com.tencent.QQMusicMac/Data/Library/Application Support/QQMusicMac/qqmusic.sqlite"
OUTPUT_DIR="./qqmusic_playlists"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "$OUTPUT_DIR"

echo "📀 正在从QQ音乐数据库提取歌单..."
echo "📁 数据库路径: $DB_PATH"
echo ""

extract_playlists() {
    local type=$1
    local type_name=$2
    
    echo "🔍 提取${type_name}歌单..."
    
    sqlite3 "$DB_PATH" "
    SELECT 
        f.folderid,
        f.folderName,
        f.foldercount,
        s.name,
        s.singer,
        s.album,
        fs.seq
    FROM NEWFOLDERS f
    JOIN NEWFOLDERSONGS fs ON f.seq = fs.seq
    JOIN SONGS s ON fs.id = s.id
    WHERE f.foldertype = ${type}
    ORDER BY f.folderid, fs.seq;
    " | awk -F'|' -v type_name="$type_name" '
    BEGIN {
        current_folder = ""
        folder_count = 0
    }
    {
        folder_id = $1
        folder_name = $2
        folder_total = $3
        song_name = $4
        singer = $5
        album = $6
        seq = $7
        
        if (folder_name != current_folder) {
            if (current_folder != "") {
                printf "\n"
            }
            current_folder = folder_name
            folder_count++
            print "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            printf "📁 歌单 #%d: %s\n", folder_count, folder_name
            print "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            print "序号 | 歌曲                          | 歌手                          | 专辑"
            print "────────────────────────────────────────────────────────────────────────────────"
        }
        
        printf "%4d | %-28s | %-28s | %s\n", seq, song_name, singer, album
    }
    END {
        print ""
    }
    '
}

cat > "$OUTPUT_DIR/歌单汇总_${TIMESTAMP}.txt" << 'HEADER'
╔══════════════════════════════════════════════════════════════════════════════════════╗
║                           📀 QQ音乐歌单整理                                       ║
║                         提取时间: TIMESTAMP_PLACEHOLDER                          ║
╚══════════════════════════════════════════════════════════════════════════════════════╝

HEADER

sed -i '' "s/TIMESTAMP_PLACEHOLDER/$(date '+%Y-%m-%d %H:%M:%S')/" "$OUTPUT_DIR/歌单汇总_${TIMESTAMP}.txt"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📥 收藏的歌单 (foldertype=2)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
extract_playlists 2 "收藏" | tee -a "$OUTPUT_DIR/歌单汇总_${TIMESTAMP}.txt"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✏️  自建的歌单 (foldertype=1)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
extract_playlists 1 "自建" | tee -a "$OUTPUT_DIR/歌单汇总_${TIMESTAMP}.txt"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "⚙️  系统歌单 (foldertype=0 - 最近播放等)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
extract_playlists 0 "系统" | tee -a "$OUTPUT_DIR/歌单汇总_${TIMESTAMP}.txt"

cat >> "$OUTPUT_DIR/歌单汇总_${TIMESTAMP}.txt" << 'FOOTER'

╔══════════════════════════════════════════════════════════════════════════════════════╗
║                                    使用说明                                          ║
╠══════════════════════════════════════════════════════════════════════════════════════╣
║ • 收藏的歌单：你在QQ音乐中收藏的他人创建的歌单                                      ║
║ • 自建的歌单：你亲自创建的歌单                                                      ║
║ • 系统歌单：QQ音乐自动生成（如最近播放、下载管理等）                                 ║
║                                                                                      ║
║ 💡 提示：你可以将此文件内容投喂给AI Agent进行音乐喜好学习                             ║
╚══════════════════════════════════════════════════════════════════════════════════════╝
FOOTER

echo ""
echo ""
echo "✅ 提取完成！"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📄 输出文件: $OUTPUT_DIR/歌单汇总_${TIMESTAMP}.txt"
echo ""
echo "文件包含:"
echo "  • 收藏的歌单 (foldertype=2)"
echo "  • 自建的歌单 (foldertype=1)"  
echo "  • 系统歌单 (foldertype=0)"
echo ""
echo "🎵 祝你音乐之旅愉快！"
echo ""
