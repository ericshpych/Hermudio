#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
QQ音乐歌单提取工具
直接从Mac版QQ音乐的SQLite数据库中提取歌单和歌曲信息
"""

import sqlite3
import os
from datetime import datetime
from pathlib import Path

class QQMusicPlaylistExtractor:
    def __init__(self):
        self.home = os.path.expanduser("~")
        self.db_path = os.path.join(
            self.home,
            "Library/Containers/com.tencent.QQMusicMac/Data/Library/Application Support/QQMusicMac/qqmusic.sqlite"
        )
        self.output_dir = Path("./qqmusic_playlists")
        self.output_dir.mkdir(exist_ok=True)
        
    def extract_playlists(self):
        """提取所有歌单和歌曲"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        playlists = {}
        
        cursor.execute("""
            SELECT 
                f.folderid,
                f.folderName,
                f.foldertype,
                f.foldercount,
                s.name,
                s.singer,
                s.album,
                fs.seq
            FROM NEWFOLDERS f
            JOIN NEWFOLDERSONGS fs ON f.seq = fs.seq
            JOIN SONGS s ON fs.id = s.id
            WHERE f.foldertype IN (1, 2, 0)
            ORDER BY f.foldertype DESC, f.folderid, fs.seq
        """)
        
        for row in cursor.fetchall():
            folderid, folderName, foldertype, foldercount, song_name, singer, album, seq = row
            
            if folderName not in playlists:
                playlists[folderName] = {
                    'type': foldertype,
                    'type_name': self._get_type_name(foldertype),
                    'total': foldercount,
                    'songs': []
                }
            
            if song_name and song_name.strip():
                playlists[folderName]['songs'].append({
                    'name': song_name.strip(),
                    'singer': singer.strip() if singer else '',
                    'album': album.strip() if album else '',
                    'seq': seq
                })
        
        conn.close()
        return playlists
    
    def _get_type_name(self, foldertype):
        """获取歌单类型名称"""
        type_names = {
            0: '系统歌单',
            1: '自建歌单',
            2: '收藏歌单'
        }
        return type_names.get(foldertype, f'类型{foldertype}')
    
    def generate_report(self):
        """生成格式化报告"""
        playlists = self.extract_playlists()
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        
        report_lines = []
        
        # Header
        report_lines.append("═" * 80)
        report_lines.append("                      📀 QQ音乐歌单整理报告")
        report_lines.append(f"                      提取时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        report_lines.append("═" * 80)
        report_lines.append("")
        
        # Group by type
        by_type = {0: [], 1: [], 2: []}
        for name, data in playlists.items():
            by_type[data['type']].append((name, data))
        
        type_names = {
            2: ('🎵 收藏的歌单', '你在QQ音乐中收藏的他人创建的歌单'),
            1: ('✏️  自建的歌单', '你亲自创建和管理的歌单'),
            0: ('⚙️  系统歌单', 'QQ音乐自动生成的功能性列表（最近播放等）')
        }
        
        total_songs = 0
        
        for foldertype in [2, 1, 0]:
            if not by_type[foldertype]:
                continue
                
            type_title, type_desc = type_names[foldertype]
            
            report_lines.append("─" * 80)
            report_lines.append(f"{type_title}")
            report_lines.append(f"说明: {type_desc}")
            report_lines.append("─" * 80)
            report_lines.append("")
            
            for idx, (folderName, data) in enumerate(by_type[foldertype], 1):
                if not data['songs']:
                    continue
                    
                total_songs += len(data['songs'])
                
                report_lines.append(f"  📁 歌单 #{idx}: {folderName}")
                report_lines.append(f"     歌曲数量: {len(data['songs'])}首")
                report_lines.append("")
                report_lines.append("     ┌" + "─" * 77 + "┐")
                report_lines.append("     │ 序号 | 歌曲名称                              | 歌手                                    │")
                report_lines.append("     ├" + "─" * 77 + "┤")
                
                for song_idx, song in enumerate(data['songs'], 1):
                    song_name = song['name'][:30].ljust(30)
                    singer = song['singer'][:35].ljust(35) if song['singer'] else ''.ljust(35)
                    line = f"     │ {song_idx:3d}  │ {song_name} │ {singer} │"
                    report_lines.append(line)
                
                report_lines.append("     └" + "─" * 77 + "┘")
                report_lines.append("")
        
        # Summary
        report_lines.append("═" * 80)
        report_lines.append("📊 统计信息")
        report_lines.append("─" * 80)
        report_lines.append(f"  • 总歌单数: {len(playlists)}个")
        report_lines.append(f"  • 总歌曲数: {total_songs}首")
        report_lines.append(f"  • 收藏歌单: {len(by_type[2])}个")
        report_lines.append(f"  • 自建歌单: {len(by_type[1])}个")
        report_lines.append(f"  • 系统歌单: {len(by_type[0])}个")
        report_lines.append("")
        report_lines.append("💡 使用说明:")
        report_lines.append("  此文件可作为AI Agent的音乐喜好学习素材")
        report_lines.append("═" * 80)
        
        # Save report
        report_content = '\n'.join(report_lines)
        report_file = self.output_dir / f"歌单汇总_{timestamp}.txt"
        report_file.write_text(report_content, encoding='utf-8')
        
        # Also save a simple version for AI
        simple_file = self.output_dir / f"AI训练数据_{timestamp}.txt"
        simple_lines = [f"QQ音乐歌单整理 - {datetime.now().strftime('%Y-%m-%d')}\n"]
        simple_lines.append("=" * 80 + "\n\n")
        
        for idx, (folderName, data) in enumerate(playlists.items(), 1):
            if not data['songs']:
                continue
            simple_lines.append(f"歌单{idx}: {folderName} ({len(data['songs'])}首)\n")
            for song in data['songs']:
                simple_lines.append(f"  - {song['name']} - {song['singer']}\n")
            simple_lines.append("\n")
        
        simple_file.write_text(''.join(simple_lines), encoding='utf-8')
        
        print("\n✅ 提取完成！")
        print("═" * 80)
        print(f"📄 详细报告: {report_file}")
        print(f"📄 AI训练数据: {simple_file}")
        print(f"\n📊 统计:")
        print(f"   • 总歌单数: {len(playlists)}个")
        print(f"   • 总歌曲数: {total_songs}首")
        print("\n🎵 祝你音乐之旅愉快！\n")
        
        return report_file, simple_file

if __name__ == "__main__":
    extractor = QQMusicPlaylistExtractor()
    extractor.generate_report()
