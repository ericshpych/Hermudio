#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Rebuild index.html from scratch"""

def build_skill_grid(items, personal=False):
    bg = 'rgba(163,113,247,0.08)' if personal else 'rgba(88,166,255,0.08)'
    border = 'rgba(163,113,247,0.25)' if personal else 'rgba(88,166,255,0.15)'
    tag_bg = 'rgba(163,113,247,0.15)' if personal else 'rgba(88,166,255,0.12)'
    tag_color = '#a371f7' if personal else '#58a6ff'
    tag = '个人技能' if personal else '通用'
    rows = [items[i:i+4] for i in range(0, len(items), 4)]
    html = ''
    for row in rows:
        html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:10px;">'
        for name, desc in row:
            html += (
                '<div class="skill-item" style="background:' + bg + ';border:1px solid ' + border + ';border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:6px;">'
                '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">'
                '<span style="font-size:13px;font-weight:600;color:#f0f6fc;flex:1;min-width:0;">' + name + '</span>'
                '<span style="font-size:10px;padding:2px 6px;border-radius:6px;background:' + tag_bg + ';color:' + tag_color + ';white-space:nowrap;">' + tag + '</span>'
                '</div>'
                '<div style="font-size:12px;color:#8b949e;line-height:1.5;">' + desc + '</div>'
                '</div>'
            )
        html += '</div>'
    return html

skills_gen = [
    ("车况信息采集挖掘","自动引导完成车辆外观、内饰、底盘、里程等信息采集"),
    ("客户画像建立","根据车型、年限、配置自动生成专属验车清单"),
    ("获取用户意向","快速了解客户意向、预算范围和偏好"),
    ("动态定价模型","结合本地周转、车况残值、全国行情给出实时报价"),
    ("调价博弈模型","线上对话中自动根据用户描述给出预估价，锁定最优区间"),
    ("信任话术建议","针对用户对报价的不满，生成专业且有温度的解释"),
    ("手续自动核验","利用 OCR 技术快速核验过户文件"),
    ("车辆历史调研","调查车辆历史参保维保的信息和数据"),
    ("预检测能力","通过图片识别车辆细节，快速完成初检"),
    ("三方检测报告解读","识别并读取三方检测报告，提取关键信息"),
    ("收车审批链路","跨境贸易关税计算与 HS 编码自动归类"),
    ("收车订单","根据产品图片生成带技术标注的生产级 TechPack"),
    ("供需匹配商品","根据客户模糊描述，秒级匹配全库存中最优的车辆"),
    ("新车&二手车对比","分析目标车辆新车和二手车的价格与性能差异"),
    ("个性化推荐车源","根据客户模糊描述，秒级匹配全库存中最优的3辆车"),
    ("用户顾虑点挖掘","在沟通过程中持续挖掘用户顾虑点"),
    ("门店营销政策传达","传达门店营销政策并根据营销政策计算价格"),
    ("金融路由匹配","实时计算不同银行和金融机构的最优月供与返佣"),
    ("信审前置判断","基于客户画像初步评估信用风险及审批通过率"),
    ("到店邀约能力","让 Agent 具备到店邀约的能力和话术"),
    ("销售博弈模型","销售谈判策略与成交技巧，智能辅助决策"),
    ("检测报告解读","识别并读取检测报告，提取关键车况信息"),
    ("下单引导","为产品生成营销灵感、创意和增长策略，引导成交"),
    ("订单进度追踪","客户订单信息追踪，实时同步进度"),
    ("客户心理学","将心理学原理和行为科学应用于营销策略，提升转化"),
]
skills_pers = [
    ("到店接待情绪识别","精准洞察客户情绪，高效接待转化"),
    ("团队擅长销售车源","深耕车源运营，具备强销售能力"),
    ("淡旺季销售策略","把控淡旺季，定制差异化销售策略"),
]

gen_grid = build_skill_grid(skills_gen)
pers_grid = build_skill_grid(skills_pers, True)
gen_count = str(len(skills_gen))
pers_count = str(len(skills_pers))

# Build the complete HTML
parts = []

# Part 1: DOCTYPE + head + CSS
parts.append('''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>智慧门店驾驶舱</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0d1117; color: #e6edf3; height: 100vh; overflow: hidden; }
.app { display: flex; height: 100vh; overflow: hidden; }
.left-nav { width: 200px; flex-shrink: 0; background: #161b22; border-right: 1px solid #21262d; display: flex; flex-direction: column; }
.nav-header { padding: 16px 14px 14px; border-bottom: 1px solid #21262d; }
.nav-brand { display: flex; align-items: center; gap: 10px; }
.nav-brand-icon { width: 36px; height: 36px; border-radius: 10px; background: linear-gradient(135deg, #388bfd, #1f6feb); display: flex; align-items: center; justify-content: center; font-size: 16px; }
.nav-brand-text { font-size: 15px; font-weight: 700; color: #f0f6fc; }
.nav-subtitle { font-size: 11px; color: #8b949e; }
.nav-items { flex: 1; padding: 8px; display: flex; flex-direction: column; gap: 2px; overflow-y: auto; }
.nav-item { height: 44px; border-radius: 10px; display: flex; align-items: center; gap: 10px; padding: 0 12px; cursor: pointer; color: #8b949e; font-size: 14px; transition: all 0.15s; position: relative; }
.nav-item:hover { background: rgba(88,166,255,0.08); color: #e6edf3; }
.nav-item.active { background: rgba(88,166,255,0.12); color: #58a6ff; }
.nav-item.active::before { content: ''; position: absolute; left: 0; top: 50%; transform: translateY(-50%); width: 3px; height: 22px; background: #58a6ff; border-radius: 0 3px 3px 0; }
.nav-icon-wrap { width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.nav-label { font-size: 14px; font-weight: 500; white-space: nowrap; }
.nav-divider { height: 1px; background: #21262d; margin: 6px 10px; }
.nav-footer { padding: 10px; border-top: 1px solid #21262d; }
.nav-user-btn { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px; cursor: pointer; }
.nav-user-btn:hover { background: rgba(88,166,255,0.08); }
.nav-user-avatar { width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #388bfd, #1f6feb); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; color: white; }
.nav-user-info { flex: 1; min-width: 0; }
.nav-user-name { font-size: 13px; font-weight: 600; color: #f0f6fc; }
.nav-user-role { font-size: 11px; color: #8b949e; }
.role-popup { position: fixed; bottom: 20px; left: 212px; width: 300px; background: #161b22; border: 1px solid #30363d; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.6); z-index: 300; display: none; }
.role-popup.show { display: block; }
.role-popup-header { padding: 16px; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid #21262d; }
.role-popup-avatar { width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, rgba(88,166,255,0.2), rgba(110,64,201,0.2)); display: flex; align-items: center; justify-content: center; font-size: 18px; }
.role-popup-name { font-size: 14px; font-weight: 600; color: #f0f6fc; }
.role-popup-role { font-size: 11px; color: #8b949e; }
.role-popup-section { padding: 12px; }
.role-popup-title { font-size: 11px; color: #484f58; margin-bottom: 8px; text-transform: uppercase; }
.role-popup-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 8px; cursor: pointer; margin-bottom: 4px; }
.role-popup-item:hover { background: rgba(88,166,255,0.08); }
.role-popup-item.active { background: rgba(88,166,255,0.12); }
.role-popup-item-icon { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 14px; flex-shrink: 0; }
.role-popup-item-info { flex: 1; }
.role-popup-item-name { font-size: 13px; font-weight: 600; color: #f0f6fc; }
.role-popup-item-desc { font-size: 11px; color: #8b949e; }
.role-popup-check { color: #58a6ff; font-size: 14px; visibility: hidden; }
.role-popup-item.active .role-popup-check { visibility: visible; }
.main-area { flex: 1; overflow: hidden; position: relative; }
.page { position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; flex-direction: column; overflow: hidden; }
.page.hidden { display: none; }
#page-chat { position: absolute; top: 0; left: 0; width: calc(100% - 300px); height: 100%; background: #0d1117; }
#page-team { position: absolute; top: 0; left: 0; width: calc(100% - 300px); height: 100%; background: #0d1117; }
/* Pages WITH right panel (chat, team): reserve 300px */
#page-chat, #page-team { position: absolute; top: 0; left: 0; width: calc(100% - 300px); height: 100%; background: #0d1117; }
/* Pages WITHOUT right panel (task, skill, plugin, memory): full width */
#page-task, #page-skill, #page-plugin, #page-memory { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: #0d1117; }
.page-header { height: 56px; flex-shrink: 0; background: #161b22; border-bottom: 1px solid #21262d; display: flex; align-items: center; padding: 0 24px; gap: 12px; }
.page-header-title { font-size: 16px; font-weight: 700; color: #f0f6fc; }
.page-header-sub { font-size: 13px; color: #484f58; }
.page-header-actions { margin-left: auto; display: flex; gap: 8px; }
.page-body { flex: 1; overflow-y: auto; padding: 24px; min-height: 0; }
.agent-bar { height: 48px; flex-shrink: 0; background: #161b22; border-bottom: 1px solid #21262d; display: flex; align-items: center; padding: 0 16px; gap: 10px; }
.agent-selector { display: none; align-items: center; gap: 10px; cursor: pointer; padding: 8px 14px; border-radius: 10px; border: 1px solid #30363d; background: #0d1117; transition: all 0.2s; position: relative; }
.agent-chip { display: none; align-items: center; gap: 8px; padding: 6px 12px; border-radius: 20px; background: rgba(88,166,255,0.1); border: 1px solid rgba(88,166,255,0.2); cursor: pointer; }
.agent-chip-avatar { width: 24px; height: 24px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 11px; }
.agent-chip-name { font-size: 12px; color: #58a6ff; font-weight: 500; }
.agent-sel-avatar { width: 36px; height: 36px; border-radius: 10px; background: linear-gradient(135deg, rgba(88,166,255,0.2), rgba(110,64,201,0.2)); display: flex; align-items: center; justify-content: center; font-size: 16px; position: relative; }
.agent-sel-dot { position: absolute; bottom: -2px; right: -2px; width: 10px; height: 10px; border-radius: 50%; background: #3fb950; border: 2px solid #0d1117; }
.chat-header { height: 56px; flex-shrink: 0; background: #161b22; border-bottom: 1px solid #21262d; display: flex; align-items: center; padding: 0 16px; gap: 12px; }
.chat-header-info { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.chat-header-name { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 700; color: #f0f6fc; }
.chat-header-status { font-size: 11px; color: #8b949e; }
.chat-header-actions { display: flex; gap: 8px; }
.icon-btn { width: 32px; height: 32px; border-radius: 8px; background: none; border: 1px solid #30363d; color: #8b949e; cursor: pointer; display: none; align-items: center; justify-content: center; font-size: 14px; transition: all 0.15s; }
.icon-btn:hover { background: rgba(248,81,73,0.1); border-color: rgba(248,81,73,0.3); color: #f85149; }
.chat-body { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: #0d1117; }
.messages { flex: 1; overflow-y: auto; padding: 20px 24px; display: flex; flex-direction: column; }
.pending-alert { display: none; margin: 0 16px 12px; background: rgba(248,81,73,0.1); border: 1px solid rgba(248,81,73,0.3); border-radius: 10px; padding: 10px 14px; align-items: center; gap: 10px; cursor: pointer; transition: background 0.15s; }
.pending-alert.show { display: flex; }
.pending-alert:hover { background: rgba(248,81,73,0.15); }
.pending-alert-icon { font-size: 14px; }
.pending-alert-text { flex: 1; font-size: 13px; color: #f0f6fc; font-weight: 500; }
.pending-alert-action { font-size: 12px; color: #f85149; font-weight: 500; white-space: nowrap; }
.skill-quick-bar { display: flex; gap: 8px; padding: 10px 20px; background: #161b22; border-bottom: 1px solid #21262d; flex-shrink: 0; overflow-x: auto; }
.skill-quick-btn { display: flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 20px; background: rgba(88,166,255,0.08); border: 1px solid rgba(88,166,255,0.15); color: #58a6ff; font-size: 12px; font-weight: 500; cursor: pointer; white-space: nowrap; transition: all 0.15s; flex-shrink: 0; }
.skill-quick-btn:hover { background: rgba(88,166,255,0.15); border-color: rgba(88,166,255,0.3); }
.skill-quick-btn.active { background: rgba(88,166,255,0.2); border-color: #58a6ff; }
.kpi-table-header { padding: 14px 20px 10px; }
.kpi-table-title { font-size: 15px; font-weight: 700; color: #f0f6fc; margin-bottom: 4px; }
.kpi-table-meta { font-size: 11px; color: #484f58; }
.kpi-table-wrap { overflow-x: auto; padding: 0 20px 16px; }
.kpi-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.kpi-table th { text-align: left; padding: 8px 12px; background: rgba(88,166,255,0.06); border-bottom: 1px solid #21262d; color: #8b949e; font-weight: 600; font-size: 12px; white-space: nowrap; }
.kpi-table td { padding: 10px 12px; border-bottom: 1px solid #21262d; color: #e6edf3; }
.kpi-table tr:hover td { background: rgba(88,166,255,0.03); }
.kpi-status { padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 500; }
.kpi-status.ok { background: rgba(63,185,80,0.1); color: #3fb950; }
.kpi-status.warn { background: rgba(210,153,34,0.1); color: #d29922; }
.kpi-status.error { background: rgba(248,81,73,0.1); color: #f85149; }
.next-step-section { padding: 0 20px 16px; }
.next-step-title { font-size: 13px; font-weight: 700; color: #f0f6fc; margin-bottom: 10px; }
.next-step-list { display: flex; flex-direction: column; gap: 8px; }
.next-step-item { display: flex; align-items: flex-start; gap: 12px; padding: 12px 14px; background: rgba(88,166,255,0.05); border: 1px solid rgba(88,166,255,0.1); border-radius: 10px; cursor: pointer; transition: all 0.15s; }
.next-step-item:hover { background: rgba(88,166,255,0.1); border-color: rgba(88,166,255,0.2); }
.next-step-icon { font-size: 16px; flex-shrink: 0; margin-top: 2px; }
.next-step-content { flex: 1; }
.next-step-label { font-size: 11px; color: #58a6ff; font-weight: 600; margin-bottom: 2px; }
.next-step-desc { font-size: 12px; color: #8b949e; line-height: 1.5; }
.next-step-desc strong { color: #e6edf3; }
.chat-input-area { flex-shrink: 0; padding: 14px 20px 16px; background: #161b22; border-top: 1px solid #21262d; }
.chat-input-hint { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-size: 12px; color: #484f58; }
.input-row { display: flex; gap: 10px; align-items: flex-end; }
.chat-input { flex: 1; background: #0d1117; border: 1px solid #30363d; border-radius: 10px; padding: 10px 14px; color: #e6edf3; font-size: 14px; resize: none; outline: none; line-height: 1.5; min-height: 44px; max-height: 120px; overflow-y: auto; transition: border-color 0.15s; }
.chat-input:focus { border-color: #58a6ff; }
.send-btn { width: 44px; height: 44px; border-radius: 10px; background: #388bfd; border: none; color: white; font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: opacity 0.15s; }
.send-btn:hover { opacity: 0.85; }
.right-panel { position: fixed; top: 0; right: 0; width: 300px; height: 100vh; background: #161b22; border-left: 1px solid #21262d; z-index: 200; overflow-y: auto; display: flex; flex-direction: column; }
.right-panel.hidden { display: none !important; }
.right-panel-header { height: 56px; flex-shrink: 0; border-bottom: 1px solid #21262d; display: flex; align-items: center; padding: 0 16px; background: #161b22; }
.right-panel-title { font-size: 13px; font-weight: 700; color: #f0f6fc; flex: 1; }
.right-panel-body { flex: 1; overflow-y: auto; }
.panel-section { padding: 14px 16px; border-bottom: 1px solid #21262d; }
.panel-section-title { font-size: 12px; font-weight: 700; color: #8b949e; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
.panel-task-item { display: flex; align-items: center; gap: 10px; padding: 8px 0; cursor: pointer; }
.panel-task-item:hover { opacity: 0.8; }
.panel-task-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.panel-task-dot.red { background: #f85149; }
.panel-task-dot.orange { background: #d29922; }
.panel-task-dot.blue { background: #58a6ff; }
.panel-task-info { flex: 1; min-width: 0; }
.panel-task-name { font-size: 12px; font-weight: 600; color: #f0f6fc; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.panel-task-meta { font-size: 11px; color: #8b949e; }
.panel-task-time { font-size: 11px; color: #484f58; white-space: nowrap; }
.panel-sched-item { display: flex; align-items: center; gap: 10px; padding: 8px 0; }
.panel-sched-icon { width: 30px; height: 30px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 14px; flex-shrink: 0; }
.panel-sched-info { flex: 1; }
.panel-sched-name { font-size: 12px; font-weight: 600; color: #e6edf3; margin-bottom: 2px; }
.panel-sched-time { font-size: 11px; color: #8b949e; }
.panel-sched-status { padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 600; white-space: nowrap; }
.panel-sched-status.on { background: rgba(63,185,80,0.1); color: #3fb950; }
.panel-sched-status.off { background: rgba(139,148,158,0.1); color: #8b949e; }
.team-kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
.team-kpi-card { background: rgba(88,166,255,0.06); border: 1px solid rgba(88,166,255,0.1); border-radius: 10px; padding: 12px; text-align: center; }
.team-kpi-value { font-size: 20px; font-weight: 700; color: #f0f6fc; margin-bottom: 2px; }
.team-kpi-label { font-size: 11px; color: #8b949e; }
.team-member-row { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid #21262d; }
.team-member-avatar { width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: white; flex-shrink: 0; }
.team-member-info { flex: 1; }
.team-member-name { font-size: 13px; font-weight: 600; color: #f0f6fc; }
.team-member-meta { font-size: 11px; color: #8b949e; }
.team-member-status { display: flex; align-items: center; gap: 4px; font-size: 11px; }
.team-member-status.online { color: #3fb950; }
.team-member-status.offline { color: #8b949e; }
.team-member-dot { width: 6px; height: 6px; border-radius: 50%; }
.team-member-dot.online { background: #3fb950; }
.team-member-dot.offline { background: #8b949e; }
.kpi-row { display: grid; gap: 12px; margin-bottom: 20px; }
.kpi-row-3 { grid-template-columns: repeat(3, 1fr); }
.kpi-row-4 { grid-template-columns: repeat(4, 1fr); }
.kpi-row-5 { grid-template-columns: repeat(5, 1fr); }
.kpi-card { background: #161b22; border: 1px solid #21262d; border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 4px; }
.kpi-card-label { font-size: 11px; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px; }
.kpi-card-value { font-size: 22px; font-weight: 700; color: #f0f6fc; }
.kpi-card-sub { font-size: 11px; color: #484f58; }
.kpi-card-value.warn { color: #d29922; }
.kpi-card-value.error { color: #f85149; }
.kpi-card-value.ok { color: #3fb950; }
.filter-bar { display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; align-items: center; }
.filter-btn { padding: 7px 14px; border-radius: 8px; background: #161b22; border: 1px solid #30363d; color: #8b949e; font-size: 13px; cursor: pointer; transition: all 0.15s; }
.filter-btn:hover { border-color: #58a6ff; color: #58a6ff; }
.filter-btn.active { background: rgba(88,166,255,0.12); border-color: #58a6ff; color: #58a6ff; }
.search-box { display: flex; align-items: center; gap: 8px; background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 7px 14px; margin-left: auto; }
.search-input { background: none; border: none; color: #e6edf3; font-size: 13px; outline: none; width: 180px; }
.task-list { display: flex; flex-direction: column; gap: 8px; }
.task-item { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: #161b22; border: 1px solid #21262d; border-radius: 10px; cursor: pointer; transition: all 0.15s; }
.task-item:hover { border-color: #30363d; }
.sched-toggle { width: 36px; height: 20px; border-radius: 10px; cursor: pointer; position: relative; transition: background 0.2s; }
.sched-toggle.active { background: #3fb950; }
.sched-toggle:not(.active) { background: #30363d; }
.btn { padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; border: none; transition: opacity 0.15s; }
.btn:hover { opacity: 0.85; }
.btn-primary { background: #388bfd; color: white; }
.btn-secondary { background: #21262d; color: #8b949e; border: 1px solid #30363d; }
</style>
</head>
<body>
''')

# Part 2: .app div
parts.append('''<div class="app">
<!-- Left Nav -->
<div class="left-nav">
<div class="nav-header">
<div class="nav-brand">
<div class="nav-brand-icon">🚗</div>
<div>
<div class="nav-brand-text">智慧门店</div>
<div class="nav-subtitle">懂车帝 · 望京店</div>
</div>
</div>
</div>
<div class="nav-items">
<div class="nav-item active" id="nav-chat" onclick="switchPage('chat')">
<div class="nav-icon-wrap" style="background: rgba(88,166,255,0.12)">
<svg fill="none" height="16" viewBox="0 0 24 24" width="16"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="#58a6ff" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>
</div>
<span class="nav-label">工作台</span>
</div>
<div class="nav-item" id="nav-task" onclick="switchPage('task')">
<div class="nav-icon-wrap" style="background: rgba(63,185,80,0.1)">
<svg fill="none" height="16" viewBox="0 0 24 24" width="16"><path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" stroke="#3fb950" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>
</div>
<span class="nav-label">任务</span>
</div>
<div class="nav-item" id="nav-skill" onclick="switchPage('skill')">
<div class="nav-icon-wrap" style="background: rgba(110,64,201,0.1)">
<svg fill="none" height="16" viewBox="0 0 24 24" width="16"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" stroke="#a371f7" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>
</div>
<span class="nav-label">技能</span>
</div>
<div class="nav-item" id="nav-plugin" onclick="switchPage('plugin')">
<div class="nav-icon-wrap" style="background: rgba(210,153,34,0.1)">
<svg fill="none" height="16" viewBox="0 0 24 24" width="16"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="#d29922" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>
</div>
<span class="nav-label">插件</span>
</div>
<div class="nav-divider"></div>
<div class="nav-item" id="nav-team" onclick="switchPage('team')">
<div class="nav-icon-wrap" style="background: rgba(63,185,80,0.1)">
<svg fill="none" height="16" viewBox="0 0 24 24" width="16"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" stroke="#3fb950" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>
</div>
<span class="nav-label">团队</span>
</div>
<div class="nav-item" id="nav-memory" onclick="switchPage('memory')">
<div class="nav-icon-wrap" style="background: rgba(248,81,73,0.08)">
<svg fill="none" height="16" viewBox="0 0 24 24" width="16"><path d="M12 2a9 9 0 0 1 9 9c0 3.1-1.6 5.8-4 7.4V22H7v-3.6A9 9 0 0 1 12 2z" stroke="#f85149" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>
</div>
<span class="nav-label">记忆</span>
</div>
</div>
<div class="nav-footer">
<div class="nav-user-btn" onclick="toggleRolePopup()">
<div class="nav-user-avatar">张</div>
<div class="nav-user-info">
<div class="nav-user-name">张明</div>
<div class="nav-user-role">店长</div>
</div>
</div>
</div>
</div>
<!-- Main Area -->
<div class="main-area">
''')

# Part 3: Page chat
parts.append('''<!-- CHAT PAGE -->
<div class="page" id="page-chat">
<div class="agent-bar">
<div class="agent-chip"><div class="agent-chip-avatar" style="background: linear-gradient(135deg, #388bfd, #1f6feb)">店</div><span class="agent-chip-name">张明</span></div>
<div class="agent-chip"><div class="agent-chip-avatar" style="background: linear-gradient(135deg, rgba(88,166,255,0.2), rgba(110,64,201,0.2))">收</div><span class="agent-chip-name">李婷</span></div>
<div class="agent-chip"><div class="agent-chip-avatar" style="background: linear-gradient(135deg, rgba(63,185,80,0.2), rgba(63,185,80,0.1))">销</div><span class="agent-chip-name">赵磊</span></div>
<div class="agent-chip"><div class="agent-chip-avatar" style="background: linear-gradient(135deg, rgba(210,153,34,0.2), rgba(210,153,34,0.1))">车</div><span class="agent-chip-name">王芳</span></div>
</div>
<div class="chat-header">
<div class="chat-header-info">
<div class="chat-header-name">
<span id="chatHeaderName">店长·张明</span>
<span style="font-size: 12px; font-weight: 400; color: #484f58; margin-left: 8px;">数据权限：懂车帝望京店·定价数据</span>
</div>
<div class="chat-header-status">在线 · 可访问定价数据、车源数据</div>
</div>
<div class="chat-header-actions">
<button class="icon-btn" title="清除会话" style="display: none">🗑️</button>
</div>
</div>
<div class="chat-body">
<div class="messages" id="messages">
<div id="pendingAlert" class="pending-alert">
<span class="pending-alert-icon">🔔</span>
<span class="pending-alert-text" id="pendingAlertText"></span>
<span class="pending-alert-action" onclick="switchPage('task')">去处理 →</span>
</div>
<div style="display:flex;align-items:center;gap:10px;padding:0 0 12px 0;">
<div onclick="switchPage('task')" style="display:inline-flex;align-items:center;gap:8px;padding:6px 14px;background:rgba(248,81,73,0.12);border:1px solid rgba(248,81,73,0.3);border-radius:20px;cursor:pointer;font-size:13px;font-weight:600;color:#f85149;">
🔔 有5个待完成事项
</div>
</div>
<div id="defaultKpiPanel">
<div class="kpi-table-header">
<div class="kpi-table-title">📋 今日核心指标 · 2026年4月28日</div>
<div class="kpi-table-meta">数据更新时间：09:00 · 懂车帝望京店</div>
</div>
<div class="kpi-table-wrap">
<table class="kpi-table">
<thead><tr><th>指标维度</th><th>今日数据</th><th>目标</th><th>完成率</th><th>状态</th></tr></thead>
<tbody>
<tr><td>今日收车</td><td>3 台</td><td>5 台</td><td><span style="color: #58a6ff; font-weight: 600;">60%</span></td><td><span class="kpi-status warn">⚠️ 关注</span></td></tr>
<tr><td>今日销售</td><td>2 台</td><td>3 台</td><td><span style="color: #58a6ff; font-weight: 600;">67%</span></td><td><span class="kpi-status warn">⚠️ 关注</span></td></tr>
<tr><td>当前库存</td><td>42 台</td><td>—</td><td>周转 18 天</td><td><span class="kpi-status ok">✅ 正常</span></td></tr>
<tr><td>本月利润</td><td>¥38.6 万</td><td>¥50 万</td><td><span style="color: #d29922; font-weight: 600;">77%</span></td><td><span class="kpi-status warn">⚠️ 关注</span></td></tr>
<tr><td>新增线索</td><td>23 条</td><td>30 条</td><td><span style="color: #3fb950; font-weight: 600;">77%</span></td><td><span class="kpi-status ok">✅ 正常</span></td></tr>
<tr><td>到店转化</td><td>12 组</td><td>15 组</td><td><span style="color: #d29922; font-weight: 600;">80%</span></td><td><span class="kpi-status warn">⚠️ 关注</span></td></tr>
</tbody>
</table>
</div>
<div class="next-step-section">
<div class="next-step-title">💡 下一步行为推荐</div>
<div class="next-step-list">
<div class="next-step-item" onclick="sendTaskAssign('收车进度确认', '李婷')">
<span class="next-step-icon">📲</span>
<div class="next-step-content">
<div class="next-step-label">任务分派</div>
<div class="next-step-desc">向 <strong>@李婷</strong> 分派「收车进度确认」任务，推进今日收车目标达成</div>
</div>
</div>
<div class="next-step-item" onclick="sendTaskAssign('销售跟进', '赵磊')">
<span class="next-step-icon">📞</span>
<div class="next-step-content">
<div class="next-step-label">任务分派</div>
<div class="next-step-desc">向 <strong>@赵磊</strong> 分派「高意向客户跟进」任务，促进到店转化</div>
</div>
</div>
<div class="next-step-item" onclick="initiateMeeting()">
<span class="next-step-icon">📅</span>
<div class="next-step-content">
<div class="next-step-label">发起会议</div>
<div class="next-step-desc">发起「每日夕会」进度沟通会议，同步收车/销售进度与次日计划</div>
</div>
</div>
</div>
</div>
</div>
<div id="chatMessagesArea"></div>
</div>
<div class="chat-input-area">
<div class="chat-input-hint">
<span id="inputHint">💬 张明 正在等待您的指令</span>
<span onclick="openContext('setting')" style="color: #58a6ff; cursor: pointer;">⚙️ 调整偏好</span>
</div>
<div class="input-row">
<textarea class="chat-input" id="chatInput" placeholder="输入消息... (Enter 发送，Shift+Enter 换行)" rows="1"></textarea>
<button class="send-btn" onclick="sendMessage()">↑</button>
</div>
</div>
</div>
</div>
''')

# Part 4: Task page
parts.append('''<!-- TASK PAGE -->
<div class="page hidden" id="page-task">
<div class="page-header">
<span class="page-header-title" id="taskPageTitle">📋 任务中心</span>
<span class="page-header-sub" id="taskPageSub">张明 · 2026年4月</span>
<div class="page-header-actions"><button class="btn btn-primary" onclick="switchPage('chat')">+ 新建任务</button></div>
</div>
<div class="page-body">
<div class="kpi-row kpi-row-5" id="taskKpiRow" style="grid-template-columns: repeat(5, 1fr)"></div>
<div style="background: #161b22; border: 1px solid #21262d; border-radius: 12px; padding: 16px; margin-bottom: 20px;">
<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">
<div style="font-size: 14px; font-weight: 700; color: #f0f6fc;">⏰ 定时任务</div>
<button style="padding: 5px 12px; font-size: 12px; background: rgba(88,166,255,0.1); border: 1px solid rgba(88,166,255,0.3); color: #58a6ff; border-radius: 6px; cursor: pointer;">+ 添加</button>
</div>
<div id="scheduledTasksList">
<div class="scheduled-task" data-id="st1" style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:#0d1117;border:1px solid #21262d;border-radius:8px;margin-bottom:8px;">
<div style="width:36px;height:36px;border-radius:8px;background:rgba(210,153,34,0.1);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">🎯</div>
<div style="flex:1;min-width:0;"><div style="font-size:13px;color:#e6edf3;font-weight:500;margin-bottom:2px;">今日目标任务下发</div><div style="font-size:11px;color:#8b949e;">每日 09:00 自动推送</div></div>
<div style="display:flex;align-items:center;gap:8px;flex-shrink:0;"><div style="font-size:12px;color:#3fb950;background:rgba(63,185,80,0.1);padding:3px 8px;border-radius:12px;">已启用</div><div class="sched-toggle active" onclick="toggleTask(this)" style="width:36px;height:20px;background:#3fb950;border-radius:10px;cursor:pointer;position:relative;"><div style="position:absolute;top:2px;right:2px;width:16px;height:16px;background:white;border-radius:50%;"></div></div></div>
</div>
<div class="scheduled-task" data-id="st2" style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:#0d1117;border:1px solid #21262d;border-radius:8px;margin-bottom:8px;">
<div style="width:36px;height:36px;border-radius:8px;background:rgba(88,166,255,0.1);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">📊</div>
<div style="flex:1;min-width:0;"><div style="font-size:13px;color:#e6edf3;font-weight:500;margin-bottom:2px;">每日晚间销售盘点</div><div style="font-size:11px;color:#8b949e;">每日 18:00 自动推送</div></div>
<div style="display:flex;align-items:center;gap:8px;flex-shrink:0;"><div style="font-size:12px;color:#3fb950;background:rgba(63,185,80,0.1);padding:3px 8px;border-radius:12px;">已启用</div><div class="sched-toggle active" onclick="toggleTask(this)" style="width:36px;height:20px;background:#3fb950;border-radius:10px;cursor:pointer;position:relative;"><div style="position:absolute;top:2px;right:2px;width:16px;height:16px;background:white;border-radius:50%;"></div></div></div>
</div>
<div class="scheduled-task" data-id="st3" style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:#0d1117;border:1px solid #21262d;border-radius:8px;margin-bottom:8px;">
<div style="width:36px;height:36px;border-radius:8px;background:rgba(63,185,80,0.1);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">📋</div>
<div style="flex:1;min-width:0;"><div style="font-size:13px;color:#e6edf3;font-weight:500;margin-bottom:2px;">销售周度报告</div><div style="font-size:11px;color:#8b949e;">每周五 09:00 自动推送</div></div>
<div style="display:flex;align-items:center;gap:8px;flex-shrink:0;"><div style="font-size:12px;color:#3fb950;background:rgba(63,185,80,0.1);padding:3px 8px;border-radius:12px;">已启用</div><div class="sched-toggle active" onclick="toggleTask(this)" style="width:36px;height:20px;background:#3fb950;border-radius:10px;cursor:pointer;position:relative;"><div style="position:absolute;top:2px;right:2px;width:16px;height:16px;background:white;border-radius:50%;"></div></div></div>
</div>
<div class="scheduled-task" data-id="st4" style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:#0d1117;border:1px solid #21262d;border-radius:8px;margin-bottom:8px;">
<div style="width:36px;height:36px;border-radius:8px;background:rgba(188,140,255,0.1);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">🎪</div>
<div style="flex:1;min-width:0;"><div style="font-size:13px;color:#e6edf3;font-weight:500;margin-bottom:2px;">市场活动盘点</div><div style="font-size:11px;color:#8b949e;">每周五 08:00 自动推送</div></div>
<div style="display:flex;align-items:center;gap:8px;flex-shrink:0;"><div style="font-size:12px;color:#3fb950;background:rgba(63,185,80,0.1);padding:3px 8px;border-radius:12px;">已启用</div><div class="sched-toggle active" onclick="toggleTask(this)" style="width:36px;height:20px;background:#3fb950;border-radius:10px;cursor:pointer;position:relative;"><div style="position:absolute;top:2px;right:2px;width:16px;height:16px;background:white;border-radius:50%;"></div></div></div>
</div>
<div class="scheduled-task" data-id="st5" style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:#0d1117;border:1px solid #21262d;border-radius:8px;margin-bottom:8px;">
<div style="width:36px;height:36px;border-radius:8px;background:rgba(248,81,73,0.1);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">📈</div>
<div style="flex:1;min-width:0;"><div style="font-size:13px;color:#e6edf3;font-weight:500;margin-bottom:2px;">销售月报告</div><div style="font-size:11px;color:#8b949e;">每月月底 15:00 自动推送</div></div>
<div style="display:flex;align-items:center;gap:8px;flex-shrink:0;"><div style="font-size:12px;color:#3fb950;background:rgba(63,185,80,0.1);padding:3px 8px;border-radius:12px;">已启用</div><div class="sched-toggle active" onclick="toggleTask(this)" style="width:36px;height:20px;background:#3fb950;border-radius:10px;cursor:pointer;position:relative;"><div style="position:absolute;top:2px;right:2px;width:16px;height:16px;background:white;border-radius:50%;"></div></div></div>
</div>
<div class="scheduled-task" data-id="st6" style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:#0d1117;border:1px solid #21262d;border-radius:8px;margin-bottom:8px;">
<div style="width:36px;height:36px;border-radius:8px;background:rgba(210,153,34,0.15);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">⭐</div>
<div style="flex:1;min-width:0;"><div style="font-size:13px;color:#e6edf3;font-weight:500;margin-bottom:2px;">服务满意度盘点</div><div style="font-size:11px;color:#8b949e;">每周五 18:00 自动推送</div></div>
<div style="display:flex;align-items:center;gap:8px;flex-shrink:0;"><div style="font-size:12px;color:#3fb950;background:rgba(63,185,80,0.1);padding:3px 8px;border-radius:12px;">已启用</div><div class="sched-toggle active" onclick="toggleTask(this)" style="width:36px;height:20px;background:#3fb950;border-radius:10px;cursor:pointer;position:relative;"><div style="position:absolute;top:2px;right:2px;width:16px;height:16px;background:white;border-radius:50%;"></div></div></div>
</div>
</div>
</div>
<div class="filter-bar">
<div class="filter-btn active">全部</div>
<div class="filter-btn">待决策</div>
<div class="filter-btn">进行中</div>
<div class="filter-btn">已完成</div>
<div class="search-box"><span style="font-size: 13px; color: #484f58;">🔍</span><input class="search-input" placeholder="搜索任务..."/></div>
</div>
<div class="task-list" id="taskList"></div>
</div>
</div>
''')

# Part 5: Skill page
parts.append('''<!-- SKILL PAGE -->
<div class="page hidden" id="page-skill">
<div class="page-header">
<span class="page-header-title">🛠️ 技能库</span>
<span class="page-header-sub">分身技能配置与管理</span>
</div>
<div class="page-body" style="padding: 20px; overflow-y: auto; flex: 1; min-height: 0;">
<div style="margin-bottom: 28px;">
<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">
<div style="font-size: 14px; font-weight: 700; color: #f0f6fc;">通用技能库</div>
<div style="font-size: 11px; padding: 2px 8px; border-radius: 10px; background: rgba(88,166,255,0.1); color: #58a6ff;">''' + gen_count + ''' 项</div>
</div>
''' + gen_grid + '''
</div>
<div>
<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">
<div style="font-size: 14px; font-weight: 700; color: #f0f6fc;">个人技能库</div>
<div style="font-size: 11px; padding: 2px 8px; border-radius: 10px; background: rgba(163,113,247,0.15); color: #a371f7;">''' + pers_count + ''' 项</div>
</div>
''' + pers_grid + '''
</div>
</div>
</div>
''')

# Part 6: Plugin + Memory pages
parts.append('''<!-- PLUGIN PAGE -->
<div class="page hidden" id="page-plugin">
<div class="page-header"><span class="page-header-title">🔌 插件中心</span><span class="page-header-sub">扩展分身能力</span></div>
<div class="page-body">
<div style="text-align: center; padding: 60px 0; color: #484f58;">
<div style="font-size: 48px; margin-bottom: 16px;">🔌</div>
<div style="font-size: 16px; font-weight: 600; color: #8b949e; margin-bottom: 8px;">插件中心</div>
<div style="font-size: 13px;">插件功能开发中，敬请期待</div>
</div>
</div>
</div>
<!-- MEMORY PAGE -->
<div class="page hidden" id="page-memory">
<div class="page-header"><span class="page-header-title">🧠 记忆中心</span><span class="page-header-sub">分身记忆配置</span></div>
<div class="page-body">
<div style="text-align: center; padding: 60px 0; color: #484f58;">
<div style="font-size: 48px; margin-bottom: 16px;">🧠</div>
<div style="font-size: 16px; font-weight: 600; color: #8b949e; margin-bottom: 8px;">记忆中心</div>
<div style="font-size: 13px;">记忆配置功能开发中，敬请期待</div>
</div>
</div>
</div>
<!-- TEAM PAGE -->
<div class="page hidden" id="page-team">
<div class="chat-header">
<div class="chat-header-info">
<div class="chat-header-name"><span>👥 望京店工作群</span></div>
<div class="chat-header-status">3 个在线</div>
</div>
</div>
<div class="chat-body">
<div class="messages" id="teamChatMessages"></div>
<div class="chat-input-area">
<div class="chat-input-hint"><span>💬 望京店工作群</span></div>
<div class="input-row">
<textarea class="chat-input" id="teamChatInput" placeholder="输入消息... (Enter 发送)" rows="1"></textarea>
<button class="send-btn" onclick="sendTeamMessage()">↑</button>
</div>
</div>
</div>
</div>
</div><!-- end main-area -->
<!-- RIGHT PANEL -->
<div class="right-panel" id="rightPanel">
<div class="right-panel-header"><span class="right-panel-title" id="rightPanelTitle">📋 工作台</span></div>
<div class="right-panel-body" id="rightPanelBody"></div>
</div>
</div><!-- end app -->
<!-- ROLE POPUP -->
<div class="role-popup" id="rolePopup">
<div class="role-popup-header">
<div class="role-popup-avatar">张</div>
<div><div class="role-popup-name">张明</div><div class="role-popup-role">当前：店长</div></div>
</div>
<div class="role-popup-section">
<div class="role-popup-title">切换身份</div>
<div class="role-popup-item active" onclick="switchRole('manager', this)">
<div class="role-popup-item-icon" style="background: linear-gradient(135deg, rgba(88,166,255,0.2), rgba(110,64,201,0.2))">店</div>
<div class="role-popup-item-info"><div class="role-popup-item-name">店长</div><div class="role-popup-item-desc">综合管理 · 门店经营</div></div>
<span class="role-popup-check">✓</span>
</div>
<div class="role-popup-item" onclick="switchRole('sales_mgr', this)">
<div class="role-popup-item-icon" style="background: linear-gradient(135deg, rgba(63,185,80,0.2), rgba(63,185,80,0.1))">销</div>
<div class="role-popup-item-info"><div class="role-popup-item-name">销售主管</div><div class="role-popup-item-desc">销售管理 · 顾问业绩</div></div>
<span class="role-popup-check">✓</span>
</div>
<div class="role-popup-item" onclick="switchRole('car_mgr', this)">
<div class="role-popup-item-icon" style="background: linear-gradient(135deg, rgba(210,153,34,0.2), rgba(210,153,34,0.1))">车</div>
<div class="role-popup-item-info"><div class="role-popup-item-name">车源主管</div><div class="role-popup-item-desc">车源管理 · 库龄监控</div></div>
<span class="role-popup-check">✓</span>
</div>
<div class="role-popup-item" onclick="switchRole('pricing', this)">
<div class="role-popup-item-icon" style="background: linear-gradient(135deg, rgba(163,113,247,0.2), rgba(110,64,201,0.1))">定</div>
<div class="role-popup-item-info"><div class="role-popup-item-name">定价专员</div><div class="role-popup-item-desc">收车定价 · 利润把控</div></div>
<span class="role-popup-check">✓</span>
</div>
</div>
<div class="role-popup-section">
<div onclick="toggleRolePopup()" style="font-size: 12px; color: #484f58; padding: 6px 8px; cursor: pointer; border-radius: 6px;">退出登录</div>
</div>
</div>
<script src="app.js"></script>
</body>
</html>''')

html = ''.join(parts)

# Write to file
with open('/Users/bytedance/hermes-workspace/mvp-dashboard/demo-plan-d/index.html', 'w', encoding='utf-8') as f:
    f.write(html)

# Verify div balance
depth = 0
for i in range(len(html)):
    if html[i:i+5] == '<div ' or html[i:i+6] == '<div>':
        depth += 1
    elif html[i:i+6] == '</div>':
        depth -= 1

print('File saved: {} chars, {} lines'.format(len(html), html.count('\n')))
print('Final div depth:', depth)
print('</html> in content:', '</html>' in html)
