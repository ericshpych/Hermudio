#!/usr/bin/env python3
"""
模式切换 TTS 暂停/恢复自动化测试
"""
from playwright.sync_api import sync_playwright
import time

def test_mode_switch():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        # 监听控制台日志
        logs = []
        page.on("console", lambda msg: logs.append(f"[{msg.type}] {msg.text}"))
        
        print("=" * 70)
        print("🎵 模式切换 TTS 暂停/恢复测试")
        print("=" * 70)
        
        # 访问测试页面
        print("\n1. 访问测试页面...")
        page.goto('http://localhost:8888/test-mode-switch.html')
        page.wait_for_load_state('networkidle')
        time.sleep(1)
        
        # 获取初始状态
        mode = page.locator('#currentMode').text_content()
        print(f"   初始模式: {mode}")
        
        # 测试1: 开始播放 TTS
        print("\n2. 开始播放 TTS...")
        page.click('button:has-text("开始播放 TTS")')
        time.sleep(2)  # 等待 TTS 开始
        
        # 检查 TTS 是否正在播放
        tts_speaking = page.locator('#ttsSpeaking').text_content()
        print(f"   TTS 播放状态: {tts_speaking}")
        
        if tts_speaking == "是":
            print("   ✅ TTS 开始播放成功")
        else:
            print("   ⚠️  TTS 可能未开始播放")
        
        # 测试2: 切换到聊天模式
        print("\n3. 切换到聊天模式...")
        page.click('button:has-text("切换到聊天模式")')
        time.sleep(1)
        
        # 检查模式是否切换
        mode = page.locator('#currentMode').text_content()
        print(f"   当前模式: {mode}")
        
        # 检查 TTS 是否暂停
        tts_paused = page.locator('#ttsPaused').text_content()
        print(f"   TTS 暂停状态: {tts_paused}")
        
        # 检查日志
        page_logs = page.locator('#logs').text_content()
        
        if "切换到聊天模式" in page_logs and "Hermes TTS 已暂停" in page_logs:
            print("   ✅ 切换到聊天模式时 TTS 自动暂停成功")
        else:
            print("   ⚠️  未检测到 TTS 暂停日志")
        
        # 测试3: 切换回电台模式
        print("\n4. 切换回电台模式...")
        page.click('button:has-text("切换回电台模式")')
        time.sleep(1)
        
        # 检查模式是否切换
        mode = page.locator('#currentMode').text_content()
        print(f"   当前模式: {mode}")
        
        # 检查 TTS 是否恢复
        tts_paused = page.locator('#ttsPaused').text_content()
        print(f"   TTS 暂停状态: {tts_paused}")
        
        page_logs = page.locator('#logs').text_content()
        
        if "切换回电台模式" in page_logs and "Hermes TTS 已恢复" in page_logs:
            print("   ✅ 切换回电台模式时 TTS 自动恢复成功")
        else:
            print("   ⚠️  未检测到 TTS 恢复日志")
        
        # 等待一段时间让 TTS 继续播放
        time.sleep(3)
        
        # 输出完整日志
        print("\n" + "=" * 70)
        print("📋 完整测试日志:")
        print("=" * 70)
        print(page_logs)
        
        browser.close()
        
        print("\n" + "=" * 70)
        print("✅ 测试完成")
        print("=" * 70)
        
        # 返回测试结果
        return "Hermes TTS 已暂停" in page_logs and "Hermes TTS 已恢复" in page_logs

if __name__ == "__main__":
    success = test_mode_switch()
    exit(0 if success else 1)
