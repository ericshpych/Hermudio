
// ================================================================
// ROLE SYSTEM
// ================================================================
var CURRENT_ROLE = 'store';  // default: 店长
var CURRENT_AGENT_ID = 'zhaolei';  // current agent id for right panel

var ROLES = {
  store: {
    name: '张明', title: '店长', avatar: '张', avatarBg: 'linear-gradient(135deg,#388bfd,#58a6ff)',
    welcomeName: '张明', welcomeTitle: '上午好，张明！今日门店经营状况已同步 🟢',
    welcomeBody: '今日收车任务 <span class="stat">3台</span>，已完成 <span class="stat">1台</span>，待跟进 <span class="stat">2台</span>。<br>销售目标完成率 <span class="stat">72%</span>，收车目标完成率 <span class="stat">60%</span>。<br>另有 <span class="stat">2条</span> 异常预警需要关注。',
    agent: { name: '收车专家·李婷', status: '在线', role: 'AI分身 · 在线' },
    taskTitle: '📋 任务中心',
    taskSub: '张明 · 2026年4月',
    kpis: [
      { num: '72%', label: '收车完成率', sub: '目标80%', cls: '' },
      { num: '68%', label: '销售完成率', sub: '目标85%', cls: 'warn' },
      { num: '¥128k', label: '今日利润', sub: '较昨日+12%', cls: 'up' },
      { num: '3', label: '异常预警', sub: '需关注', cls: 'danger' },
      { num: '8', label: '待决策项', sub: '3项紧急', cls: 'warn' },
    ],
    tasks: [
      { urgent: true, name: '审核宝马320Li 2019款报价', tags: ['urgent','agent'], meta: '车主报价¥165,000 · 溢价8.5%', time: '今天 16:00' },
      { pending: true, name: '审核奥迪A4L 2021款报价', tags: ['agent'], meta: '车主报价¥228,000 · 风控预警', time: '今天 14:00' },
      { name: '跟进王先生购车意向', tags: ['self'], meta: '意向宝马320Li · 预算20-25万', time: '今天 18:00' },
    ]
  },
  sales: {
    name: '王芳', title: '销售主管', avatar: '王', avatarBg: 'linear-gradient(135deg,#d29922,#f0a500)',
    welcomeName: '销售主管·赵磊', welcomeTitle: '上午好，王芳！今日销售情况已同步 🟢',
    welcomeBody: '今日新增线索 <span class="stat">15条</span>，已联系 <span class="stat">10条</span>，意向客户 <span class="stat">5条</span>。<br>本周成交 <span class="stat">8台</span>，目标完成率 <span class="stat">72%</span>。<br>建议跟进 <span class="stat">2位</span> 高意向客户。',
    agent: { name: '销售主管·赵磊', status: '在线', role: 'AI分身 · 在线' },
    taskTitle: '📋 销售任务',
    taskSub: '王芳 · 2026年4月',
    kpis: [
      { num: '15', label: '今日新线索', sub: '较昨日+3', cls: 'up' },
      { num: '72%', label: '目标完成率', sub: '本周目标12台', cls: '' },
      { num: '5', label: '高意向客户', sub: '待跟进', cls: 'warn' },
      { num: '3', label: '今日成交', sub: '目标5台', cls: '' },
      { num: '8', label: '本周完成', sub: '目标11台', cls: '' },
    ],
    tasks: [
      { urgent: true, name: '晨会：跟进王先生购车意向', tags: ['self'], meta: '意向宝马320Li · 预算20-25万', time: '今天 09:30' },
      { pending: true, name: '夕会：客户张总报价确认', tags: ['self'], meta: '报价¥228,000 · 等待回复', time: '今天 18:00' },
      { name: '新增线索：李女士 Model Y', tags: ['self'], meta: '预算30-35万 · 有置换', time: '今天 10:00' },
    ]
  },
  sourcing: {
    name: '李婷', title: '车源主管', avatar: '李', avatarBg: 'linear-gradient(135deg,#238636,#3fb950)',
    welcomeName: '运营主管·王芳', welcomeTitle: '上午好，李婷！车源情况已更新 🟢',
    welcomeBody: '今日新增车源 <span class="stat">12台</span>，已审核 <span class="stat">8台</span>，待审核 <span class="stat">4台</span>。<br>本周车源转化率 <span class="stat">68%</span>，长库龄车 <span class="stat">3台</span> 需要关注。',
    agent: { name: '运营主管·王芳', status: '在线', role: 'AI分身 · 在线' },
    taskTitle: '📋 车源任务',
    taskSub: '李婷 · 2026年4月',
    kpis: [
      { num: '12', label: '今日新增车源', sub: '较昨日+2', cls: 'up' },
      { num: '68%', label: '车源转化率', sub: '目标70%', cls: '' },
      { num: '3', label: '长库龄车', sub: '需定价调整', cls: 'danger' },
      { num: '8', label: '待审核车源', sub: '今日新上架', cls: 'warn' },
      { num: '4', label: '已完成审核', sub: '通过率75%', cls: 'up' },
    ],
    tasks: [
      { urgent: true, name: '长库龄：大众帕萨特2020款定价调整', tags: ['urgent','agent'], meta: '库龄89天，建议降价5%', time: '今天 11:00' },
      { pending: true, name: '审核新上架：宝马530Le', tags: ['agent'], meta: '定价¥328,000 · 待确认', time: '今天 14:00' },
      { name: '库存盘点：本周周转率分析', tags: ['self'], meta: '自动生成库存报告', time: '今天 16:00' },
    ]
  },
  pricing: {
    name: '张伟', title: '定价专员', avatar: '张', avatarBg: 'linear-gradient(135deg,#8b5cf6,#a371f7)',
    welcomeName: '收车专家·李婷', welcomeTitle: '上午好，张伟！今日收车情况已同步 🟢',
    welcomeBody: '今日收车任务 <span class="stat">3台</span>，已完成 <span class="stat">1台</span>，待跟进 <span class="stat">2台</span>。<br>当前有一台 <span class="stat">宝马320Li 2019款</span> 等待您决策，建议报价 <span class="stat">¥158,000</span>。',
    agent: { name: '收车专家·李婷', status: '在线', role: 'AI分身 · 在线' },
    taskTitle: '📋 定价任务',
    taskSub: '张伟 · 2026年4月',
    kpis: [
      { num: '60%', label: '收车完成率', sub: '目标30台', cls: '' },
      { num: '72%', label: '出价准确率', sub: '近30天', cls: 'up' },
      { num: '4.2%', label: '平均溢价率', sub: '较上月-0.8%', cls: 'up' },
      { num: '8.5天', label: '平均周转天数', sub: '目标7天内', cls: 'warn' },
      { num: '2', label: '待决策', sub: '含1项紧急', cls: 'danger' },
    ],
    tasks: [
      { urgent: true, name: '审核宝马320Li 2019款报价', tags: ['urgent','agent'], meta: '车主报价¥165,000 · 偏离阈值¥13,000', time: '今天 16:00' },
      { pending: true, name: '审核奥迪A4L 2021款报价', tags: ['agent'], meta: '车主报价¥228,000 · 风控预警', time: '今天 14:00' },
      { name: '跟进客户王先生意向', tags: ['self'], meta: '意向宝马320Li · 预算20-25万', time: '今天 18:00' },
    ]
  }
};

function switchRole(roleId, el) {
  // Update active state in popup
  if (el) {
    document.querySelectorAll('.role-popup-item').forEach(function(item) { item.classList.remove('active'); });
    el.classList.add('active');
  }
  // Update popup header
  var roleNames = { manager: '店长', sales_mgr: '销售主管', car_mgr: '车源主管', pricing: '定价专员' };
  var roleName = roleNames[roleId] || roleId;
  var popup = document.getElementById('rolePopup');
  if (popup) {
    var nameEl = popup.querySelector('.role-popup-name');
    var roleEl = popup.querySelector('.role-popup-role');
    if (nameEl) nameEl.textContent = '张明';
    if (roleEl) roleEl.textContent = '当前：' + roleName;
  }
  // Call selectAgent with the appropriate agent for this role
  var agentMap = { manager: 'manager', sales_mgr: 'zhaolei', car_mgr: 'wangfang', pricing: 'liting' };
  var agentId = agentMap[roleId] || roleId;
  selectAgent(agentId, roleName + '·张明', '在线');
  // Close popup
  toggleRolePopup();
}

function switchPage(page) {
  document.querySelectorAll('.page').forEach(function(p) { p.classList.add('hidden'); });
  document.getElementById('page-' + page).classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(function(n) { n.classList.remove('active'); });
  document.getElementById('nav-' + page).classList.add('active');
  closeContext();

  // Right panel: show/hide + render content
  var rp = document.querySelector('.right-panel');
  if (page === 'chat' || page === 'team') {
    rp.classList.remove('hidden');
    renderRightPanel(CURRENT_AGENT_ID, page);
  } else {
    rp.classList.add('hidden');
  }
}

// ================================================================
// ROLE POPUP
// ================================================================
function toggleRolePopup() {
  document.getElementById('rolePopup').classList.toggle('show');
}

// ================================================================
// AGENT SELECTOR
// ================================================================
function toggleAgentDropdown() {
  document.getElementById('agentDropdown').classList.toggle('show');
}
function selectAgent(id, name, status) {
  CURRENT_AGENT_ID = id;
  var ad = document.getElementById('agentDropdown');
  if (ad) ad.classList.remove('show');
  var can = document.getElementById('currentAgentName');
  if (can) can.textContent = name;
  var car = document.getElementById('currentAgentRole');
  if (car) car.textContent = 'AI分身 · ' + status;
  var chn = document.getElementById('chatHeaderName');
  if (chn) chn.textContent = name;
  var wn = document.getElementById('welcomeName');
  if (wn) wn.textContent = name;
  var ih = document.getElementById('inputHint');
  if (ih) ih.textContent = '💬 ' + name + ' 正在等待您的指令';
  renderDashboard(id);
  renderMainKpiTable(id);
  renderRightPanel(id, 'chat');
}
// ================================================================
// AGENT DASHBOARD DATA
// ================================================================
var DASHBOARD_DATA = {
  liting: {
    shift: '懂车帝望京店 · 定价专员',
    kpis: [
      { label: '今日收车', value: '3台', sub: '目标5台', color: 'blue', trend: '+1 vs昨日' },
      { label: '待定价车源', value: '8台', sub: '平均等待2.3天', color: 'purple', trend: '' },
      { label: '本周收车额', value: '¥47.2万', sub: '环比+12%', color: 'green', trend: 'up' },
      { label: '长库龄(>45天)', value: '5台', sub: '需调价', color: 'red', trend: '' },
    ],
    roleSectionTitle: '📊 今日收车明细',
    roleTable: {
      headers: ['车型', '报价', '状态', '利润空间'],
      rows: [
        ['宝马320Li 2019款', '¥158,000', '待决策', '<span class="dash-badge orange">¥4,200</span>'],
        ['特斯拉Model 3 2022款', '¥168,000', '谈判中', '<span class="dash-badge orange">¥5,800</span>'],
        ['奥迪A4L 2021款', '¥175,000', '已成交', '<span class="dash-badge green">¥6,500</span>'],
        ['宝马X3 2020款', '¥182,000', '风控预警', '<span class="dash-badge red">需复核</span>'],
      ]
    }
  },
  wangfang: {
    shift: '懂车帝望京店 · 车源主管',
    kpis: [
      { label: '当前库存', value: '42台', sub: '环比+3台', color: 'blue', trend: '' },
      { label: '在途收车', value: '6台', sub: '本周到店', color: 'purple', trend: '' },
      { label: '库龄异常(>60天)', value: '7台', sub: '需调价处理', color: 'red', trend: '' },
      { label: '本月收车额', value: '¥128万', sub: '目标¥150万', color: 'green', trend: 'up' },
    ],
    roleSectionTitle: '📦 库龄分布',
    roleTable: {
      headers: ['库龄区间', '车辆数', '平均利润', '预警等级'],
      rows: [
        ['0-30天', '23台', '¥6,800', '<span class="dash-badge green">正常</span>'],
        ['31-45天', '12台', '¥5,200', '<span class="dash-badge blue">关注</span>'],
        ['46-60天', '5台', '¥3,100', '<span class="dash-badge orange">预警</span>'],
        ['60天以上', '7台', '¥1,200', '<span class="dash-badge red">严重</span>'],
      ]
    }
  },
  zhaolei: {
    shift: '懂车帝望京店 · 销售主管',
    kpis: [
      { label: '本月销量', value: '18台', sub: '目标25台', color: 'blue', trend: '' },
      { label: '在店客流', value: '47组', sub: '今日截至14:00', color: 'cyan', trend: '' },
      { label: '试驾转化率', value: '62%', sub: '目标65%', color: 'green', trend: '' },
      { label: 'DCC线索', value: '34条', sub: '待跟进12条', color: 'purple', trend: '' },
    ],
    roleSectionTitle: '👥 顾问业绩排行',
    roleTable: {
      headers: ['顾问', '本月成交', '线索跟进', '状态'],
      rows: [
        ['张伟', '6台', '8条/2未联系', '<span class="dash-badge green">正常</span>'],
        ['李娜', '5台', '10条/3未联系', '<span class="dash-badge blue">跟进中</span>'],
        ['王鹏', '4台', '7条/5未联系', '<span class="dash-badge orange">待激活</span>'],
        ['赵雪', '3台', '9条/2未联系', '<span class="dash-badge green">正常</span>'],
      ]
    }
  },
  manager: {
    shift: '懂车帝望京店 · 店长',
    kpis: [
      { label: '今日收车', value: '3台', sub: '目标5台', color: 'blue', trend: '' },
      { label: '今日销量', value: '2台', sub: '目标3台', color: 'cyan', trend: '' },
      { label: '当前库存', value: '42台', sub: '周转18天', color: 'purple', trend: '' },
      { label: '本月利润', value: '¥38.6万', sub: '目标¥50万', color: 'green', trend: '' },
    ],
    roleSectionTitle: '⚠️ 今日待关注',
    roleTable: {
      headers: ['事项', '类型', '紧急度', '负责人'],
      rows: [
        ['宝马X3 2020款定价复核', '风控', '<span class="dash-badge red">紧急</span>', '李婷'],
        ['长库龄7台需调价', '库存', '<span class="dash-badge orange">重要</span>', '王芳'],
        ['DCC线索积压12条', '销售', '<span class="dash-badge blue">一般</span>', '赵磊'],
        ['周报待提交(周五14:00)', '运营', '<span class="dash-badge orange">提醒</span>', '张明'],
      ]
    }
  }
};

function renderDashboard(agentId) {
  var data = DASHBOARD_DATA[agentId];
  if (!data) return;

  // Date
  var now = new Date();
  var dateStr = now.getFullYear() + '年' + (now.getMonth()+1) + '月' + now.getDate() + '日 ' + ['周日','周一','周二','周三','周四','周五','周六'][now.getDay()];
  var ddEl = document.getElementById('dashDate');
  if (ddEl) ddEl.textContent = dateStr;
  var dsEl = document.getElementById('dashShift');
  if (dsEl) dsEl.textContent = data.shift;

  // KPI cards
  var grid = document.getElementById('dashKpiGrid');
  var colors = ['blue','green','purple','orange','red','cyan'];
  var html = '';
  for (var i = 0; i < data.kpis.length; i++) {
    var kpi = data.kpis[i];
    var trendHtml = '';
    if (kpi.trend) {
      var isUp = kpi.trend.indexOf('+') >= 0 || kpi.trend.indexOf('up') >= 0;
      trendHtml = '<span class="dash-kpi-trend ' + (isUp ? 'up' : 'down') + '">' + kpi.trend + '</span>';
    }
    html += '<div class="dash-kpi-card ' + (kpi.color || colors[i]) + '">' +
      '<div class="dash-kpi-label">' + kpi.label + '</div>' +
      '<div class="dash-kpi-value">' + kpi.value + trendHtml + '</div>' +
      '<div class="dash-kpi-sub">' + (kpi.sub || '') + '</div></div>';
  }
  if (grid) grid.innerHTML = html;

  // Role section table
  var rs = document.getElementById('dashRoleSection');
  var t = data.roleTable;
  var thHtml = '<tr>';
  for (var j = 0; j < t.headers.length; j++) thHtml += '<th>' + t.headers[j] + '</th>';
  thHtml += '</tr>';
  var trHtml = '';
  for (var r = 0; r < t.rows.length; r++) {
    trHtml += '<tr>';
    for (var c = 0; c < t.rows[r].length; c++) {
      var cell = t.rows[r][c];
      trHtml += (c === 0 ? '<td><strong>' + cell + '</strong></td>' : '<td class="num">' + cell + '</td>');
    }
    trHtml += '</tr>';
  }
  if (rs) rs.innerHTML = '<div class="dash-role-title">' + data.roleSectionTitle + '</div>' +
    '<table class="dash-table"><thead>' + thHtml + '</thead><tbody>' + trHtml + '</tbody></table>';
}

// Render the main chat area KPI table based on agent
function renderMainKpiTable(agentId) {
  var data = DASHBOARD_DATA[agentId];
  if (!data || !data.kpis) return;

  var rows = '';
  if (agentId === 'manager') {
    // Manager: 6-row table
    var kpiMap = [
      { label: '今日收车', value: '3 台', target: '5 台', rate: '60%', rateColor: '#58a6ff', status: 'warn' },
      { label: '今日销售', value: '2 台', target: '3 台', rate: '67%', rateColor: '#58a6ff', status: 'warn' },
      { label: '当前库存', value: '42 台', target: '—', rate: '周转 18 天', rateColor: '#e6edf3', status: 'ok' },
      { label: '本月利润', value: '¥38.6 万', target: '¥50 万', rate: '77%', rateColor: '#d29922', status: 'warn' },
      { label: '新增线索', value: '23 条', target: '30 条', rate: '77%', rateColor: '#3fb950', status: 'ok' },
      { label: '到店转化', value: '12 组', target: '15 组', rate: '80%', rateColor: '#d29922', status: 'warn' },
    ];
    kpiMap.forEach(function(k) {
      var statusIcon = k.status === 'ok' ? '✅ 正常' : '⚠️ 关注';
      rows += '<tr><td>' + k.label + '</td><td>' + k.value + '</td><td>' + k.target + '</td><td><span style="color:' + k.rateColor + ';font-weight:600;">' + k.rate + '</span></td><td><span class="kpi-status ' + k.status + '">' + statusIcon + '</span></td></tr>';
    });
  } else {
    // Sales supervisor: 4-row table
    var rateMap = {
      '本月销量': ['18 台', '25 台', '72%', '#58a6ff', 'warn'],
      '在店客流': ['47 组', '—', '今日截至14:00', '#e6edf3', 'ok'],
      '试驾转化率': ['62%', '目标65%', '—', '#d29922', 'warn'],
      'DCC线索': ['34 条', '—', '待跟进12条', '#f85149', 'warn'],
    };
    data.kpis.forEach(function(kpi) {
      var info = rateMap[kpi.label] || [kpi.value, kpi.sub || '—', '—', '#e6edf3', 'ok'];
      var statusIcon = info[4] === 'ok' ? '✅ 正常' : '⚠️ 关注';
      rows += '<tr><td>' + kpi.label + '</td><td>' + info[0] + '</td><td>' + info[1] + '</td><td><span style="color:' + info[3] + ';font-weight:600;">' + info[2] + '</span></td><td><span class="kpi-status ' + info[4] + '">' + statusIcon + '</span></td></tr>';
    });
  }
  var tableBody = document.querySelector('#defaultKpiPanel tbody');
  if (tableBody) tableBody.innerHTML = rows;
}


// ================================================================
// RIGHT PANEL (always visible)
// ================================================================
var RIGHT_PANEL_DATA = {
  manager: {
    title: '店长工作台',
    tasks: [
      { name: '宝马X3 2020款定价复核', type: '风控', priority: 'red', meta: '李婷·待处理', time: '今天 10:30' },
      { name: '长库龄7台需调价', type: '库存', priority: 'orange', meta: '王芳·处理中', time: '今天 09:00' },
      { name: 'DCC线索积压12条', type: '销售', priority: 'blue', meta: '赵磊·待跟进', time: '今天 11:00' },
      { name: '周报待提交(周五14:00)', type: '运营', priority: 'blue', meta: '张明·待完成', time: '周五 14:00' },
    ],
    schedTasks: [
      { icon: '📊', bg: 'rgba(88,166,255,0.1)', name: '昨日经营数据汇总', time: '08:30', status: 'on' },
      { icon: '📋', bg: 'rgba(110,64,201,0.1)', name: '今日经营总结', time: '18:00', status: 'on' },
      { icon: '⚠️', bg: 'rgba(210,153,34,0.1)', name: '库龄异常预警', time: '09:00', status: 'on' },
      { icon: '📈', bg: 'rgba(63,185,80,0.1)', name: '周报自动生成', time: '周五14:00', status: 'off' },
    ]
  },
  liting: {
    title: '收车专家工作台',
    tasks: [
      { name: '宝马320Li 2019款报价决策', type: '收车', priority: 'red', meta: '待决策', time: '今天 14:00' },
      { name: '特斯拉Model 3 谈判跟进', type: '收车', priority: 'orange', meta: '谈判中', time: '今天' },
      { name: '库龄>45天车辆调价', type: '定价', priority: 'blue', meta: '5台待处理', time: '本周' },
    ],
    schedTasks: [
      { icon: '📊', bg: 'rgba(88,166,255,0.1)', name: '今日收车日报', time: '18:00', status: 'on' },
      { icon: '⚠️', bg: 'rgba(210,153,34,0.1)', name: '异常报价预警', time: '09:00', status: 'on' },
    ]
  },
  wangfang: {
    title: '车源主管工作台',
    tasks: [
      { name: '60天以上库龄车辆调价', type: '库存', priority: 'red', meta: '7台待处理', time: '本周' },
      { name: '新到车源入库登记', type: '运营', priority: 'blue', meta: '6台在途', time: '本周' },
      { name: '库龄分布报告', type: '数据', priority: 'blue', meta: '已生成', time: '昨天' },
    ],
    schedTasks: [
      { icon: '📦', bg: 'rgba(110,64,201,0.1)', name: '库龄日报', time: '09:00', status: 'on' },
      { icon: '📊', bg: 'rgba(88,166,255,0.1)', name: '收车进度报告', time: '18:00', status: 'on' },
    ]
  },
  zhaolei: {
    title: '销售主管工作台',
    tasks: [
      { name: '每日客户盘点', type: '客户', priority: 'red', meta: '待人工介入', time: '今天' },
      { name: '高意向客户攻坚', type: '客户', priority: 'orange', meta: '待人工介入', time: '今天' },
      { name: '每日过程指标监控', type: '数据', priority: 'orange', meta: '4指标异常', time: '今天' },
      { name: '管理预警', type: '管理', priority: 'red', meta: '3分身异常', time: '今天' },
      { name: '车辆百亿补贴申请', type: '审核', priority: 'orange', meta: '待审核', time: '今天' },
    ],
    schedTasks: [
      { icon: '🎯', bg: 'rgba(88,166,255,0.1)', name: '今日目标任务下发', time: '09:00', status: 'on' },
      { icon: '📊', bg: 'rgba(63,185,80,0.1)', name: '每日晚间销售盘点', time: '18:00', status: 'on' },
      { icon: '📋', bg: 'rgba(110,64,201,0.1)', name: '销售周度报告', time: '周五09:00', status: 'on' },
      { icon: '🎪', bg: 'rgba(210,153,34,0.1)', name: '市场活动盘点', time: '周五08:00', status: 'on' },
      { icon: '📈', bg: 'rgba(163,113,247,0.1)', name: '销售月报告', time: '月底15:00', status: 'on' },
      { icon: '⭐', bg: 'rgba(248,81,73,0.1)', name: '服务满意度盘点', time: '周五18:00', status: 'on' },
    ]
  }
};

function renderRightPanel(agentId, page) {
  page = page || 'chat';
  var body = document.getElementById('rightPanelBody');
  var title = document.getElementById('rightPanelTitle');

  if (page === 'team') {
    // 团队视角：显示今日概况
    if (title) title.textContent = '📊 团队概况';
    var html = '<div class="panel-section"><div class="panel-section-title">今日概况</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
    var kpis = [
      { num: '3台', label: '今日收车', color: '#f0f6fc' },
      { num: '2台', label: '今日销售', color: '#f0f6fc' },
      { num: '7台', label: '库龄预警', color: '#d29922' },
      { num: '1条', label: '紧急待办', color: '#f85149' },
    ];
    kpis.forEach(function(k) {
      html += '<div style="background:#0d1117;border:1px solid #21262d;border-radius:8px;padding:10px;text-align:center;">' +
        '<div style="font-size:22px;font-weight:700;color:' + k.color + ';">' + k.num + '</div>' +
        '<div style="font-size:10px;color:#8b949e;margin-top:2px;">' + k.label + '</div></div>';
    });
    html += '</div></div>';

    // 团队成员
    html += '<div class="panel-section"><div class="panel-section-title">团队成员</div>';
    var members = [
      { name: '李婷', role: '收车专家', color: '#388bfd', online: true, inProgress: 2, total: 3, currentTask: '特斯拉Model Y报价谈判中', taskStatus: 'orange' },
      { name: '王芳', role: '车源主管', color: '#3fb950', online: true, inProgress: 1, total: 4, currentTask: '宝马X3库存调整中', taskStatus: 'blue' },
      { name: '赵磊', role: '销售主管', color: '#d29922', online: false, inProgress: 3, total: 5, currentTask: '高意向客户待跟进', taskStatus: 'red' },
    ];
    members.forEach(function(m) {
      var statusColor = m.online ? '#3fb950' : '#8b949e';
      var statusBg = m.online ? 'rgba(63,185,80,0.1)' : 'rgba(139,148,158,0.1)';
      var taskStatusColor = m.taskStatus === 'red' ? '#f85149' : m.taskStatus === 'orange' ? '#d29922' : '#58a6ff';
      var taskStatusBg = m.taskStatus === 'red' ? 'rgba(248,81,73,0.1)' : m.taskStatus === 'orange' ? 'rgba(210,153,34,0.1)' : 'rgba(88,166,255,0.1)';
      html += '<div class="panel-agent-row" onclick="openTeamChat(\'' + m.name + '\')" style="flex-direction:column;align-items:stretch;gap:6px;padding:10px 0;border-bottom:1px solid #21262d;">' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
        '<div class="panel-agent-avatar" style="background:' + m.color + ';width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:white;flex-shrink:0;">' + m.name.charAt(0) + '</div>' +
        '<div style="flex:1;min-width:0;">' +
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">' +
        '<span style="font-size:13px;font-weight:600;color:#f0f6fc;">' + m.name + '</span>' +
        '<span style="font-size:10px;padding:1px 6px;border-radius:8px;background:' + statusBg + ';color:' + statusColor + ';">' + (m.online ? '在线' : '离线') + '</span>' +
        '</div>' +
        '<div style="font-size:11px;color:#8b949e;">' + m.role + '</div>' +
        '</div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:6px;padding-left:40px;">' +
        '<span style="font-size:10px;color:#8b949e;white-space:nowrap;">任务进展</span>' +
        '<span style="font-size:11px;font-weight:600;color:#e6edf3;">' + m.inProgress + '/' + m.total + '</span>' +
        '<div style="flex:1;height:4px;background:#21262d;border-radius:2px;">' +
        '<div style="width:' + Math.round(m.inProgress/m.total*100) + '%;height:100%;background:' + m.color + ';border-radius:2px;"></div>' +
        '</div>' +
        '</div>' +
        '<div style="padding-left:40px;display:flex;align-items:center;gap:6px;">' +
        '<span style="font-size:10px;padding:2px 6px;border-radius:6px;background:' + taskStatusBg + ';color:' + taskStatusColor + ';white-space:nowrap;">进行中</span>' +
        '<span style="font-size:11px;color:#8b949e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + m.currentTask + '</span>' +
        '</div>';
    });
    html += '</div>';

    // 本周任务分布
    html += '<div class="panel-section"><div class="panel-section-title">本周任务分布</div>';
    var dist = [
      { label: '收车', pct: '65%', w: '65%', bg: '#388bfd' },
      { label: '销售', pct: '50%', w: '50%', bg: '#3fb950' },
      { label: '定价', pct: '40%', w: '40%', bg: '#a371f7' },
    ];
    dist.forEach(function(d) {
      html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
        '<div style="width:40px;font-size:11px;color:#8b949e;text-align:right;">' + d.label + '</div>' +
        '<div style="flex:1;height:6px;background:#21262d;border-radius:3px;">' +
        '<div style="width:' + d.w + ';height:100%;background:' + d.bg + ';border-radius:3px;"></div></div>' +
        '<div style="width:28px;font-size:10px;color:#e6edf3;">' + d.pct + '</div></div>';
    });
    html += '</div>';

    if (body) body.innerHTML = html;
    return;
  }

  // 默认：店长个人工作台
  var data = RIGHT_PANEL_DATA[agentId];
  if (!data) data = RIGHT_PANEL_DATA['zhaolei'];
  if (title) title.textContent = data.title;

  var html = '';

  // Tasks section
  html += '<div class="panel-section"><div class="panel-section-title">今日待办 (' + data.tasks.length + ')</div>';
  if (data.tasks.length === 0) {
    html += '<div class="panel-empty">暂无待办事项</div>';
  } else {
    data.tasks.forEach(function(t) {
      var badge = '<span style="font-size:10px;padding:2px 6px;border-radius:8px;margin-left:4px;background:' +
        (t.priority==='red'?'rgba(248,81,73,0.15)':t.priority==='orange'?'rgba(210,153,34,0.15)':'rgba(88,166,255,0.1)') +
        ';color:' + (t.priority==='red'?'#f85149':t.priority==='orange'?'#d29922':'#58a6ff') + ';">' + t.type + '</span>';
      html += '<div class="panel-task-item" onclick="openTaskChat(\'' + t.name.replace(/'/g, "\'") + '\', \'' + t.meta + '\')">' +
        '<div class="panel-task-dot ' + t.priority + '"></div>' +
        '<div class="panel-task-info"><div class="panel-task-name">' + t.name + badge + '</div>' +
        '<div class="panel-task-meta">' + t.meta + '</div></div>' +
        '<div class="panel-task-time">' + t.time + '</div></div>';
    });
  }
  html += '</div>';

  // Scheduled tasks section
  html += '<div class="panel-section"><div class="panel-section-title">定时任务</div>';
  data.schedTasks.forEach(function(s) {
    html += '<div class="panel-sched-item">' +
      '<div class="panel-sched-icon" style="background:' + s.bg + ';">' + s.icon + '</div>' +
      '<div class="panel-sched-info"><div class="panel-sched-name">' + s.name + '</div>' +
      '<div class="panel-sched-time">每日 ' + s.time + '</div></div>' +
      '<span class="panel-sched-status ' + (s.status === 'on' ? 'on' : 'off') + '">' + (s.status === 'on' ? '启用' : '暂停') + '</span></div>';
  });
  html += '</div>';

  // Team members section (for 店长)
  if (agentId === 'manager') {
    html += '<div class="panel-section"><div class="panel-section-title">团队成员</div>';
    var members = [
      { name: '李婷', role: '收车专家', color: '#388bfd', online: true },
      { name: '王芳', role: '车源主管', color: '#3fb950', online: true },
      { name: '赵磊', role: '销售主管', color: '#d29922', online: false },
    ];
    members.forEach(function(m) {
      html += '<div class="panel-agent-row" onclick="openTeamChat(\'' + m.name + '\')">' +
        '<div class="panel-agent-avatar" style="background:' + m.color + ';">' + m.name.charAt(0) + '</div>' +
        '<div class="panel-agent-name">' + m.name + '</div>' +
        '<div class="panel-agent-role">' + m.role + '</div>' +
        '<div class="panel-agent-status ' + (m.online ? 'online' : 'offline') + '"></div></div>';
    });
    html += '</div>';
  }

  if (body) body.innerHTML = html;
}

function openTaskChat(taskName, assignee) {
  appendMessage('user', '请问「' + taskName + '」的当前进展如何？');
  setTimeout(function() {
    appendMessage('agent', '已收到您的任务沟通请求。正在查询「' + taskName + '」的最新进展...\n\n初步判断：该任务目前处于正常推进状态。');
  }, 800);
}

function openTeamChat(memberName) {
  appendMessage('user', '@' + memberName + ' 请汇报一下当前工作进展');
  setTimeout(function() {
    appendMessage('agent', '@张明 ' + memberName + ' 正在处理中，预计今天16:00前完成。');
  }, 800);
}



// ================================================================
// CONTEXT PANEL
// ================================================================
function openContext(type) {
  // Right panel is always visible - just switch pages
  if (type === 'task') {
    title.textContent = '📋 待办任务';
    body.innerHTML = '<div class="ctx-section"><div class="ctx-section-title">⚡ 待决策</div><div class="ctx-card" style="padding:12px;margin-bottom:8px;cursor:pointer;border:1px solid #f85149;border-radius:8px;" onclick="switchPage(\'task\')"><div style="font-size:13px;font-weight:600;color:#e6edf3;margin-bottom:4px;">特斯拉Model Y 报价决策</div><div style="font-size:12px;color:#8b949e;">车主报价¥238,000 · 连续失败3次</div></div><div class="ctx-card" style="padding:12px;cursor:pointer;border:1px solid #d29922;border-radius:8px;" onclick="switchPage(\'task\')"><div style="font-size:13px;font-weight:600;color:#e6edf3;margin-bottom:4px;">奥迪A4L 报价确认</div><div style="font-size:12px;color:#8b949e;">目标¥218,000 · 谈判中</div></div></div><div class="ctx-section"><div class="ctx-section-title">📋 进行中</div><div class="ctx-card" style="padding:12px;margin-bottom:8px;" onclick="switchPage(\'task\')"><div style="font-size:13px;font-weight:600;color:#e6edf3;margin-bottom:4px;">宝马320Li 已成交</div><div style="font-size:12px;color:#3fb950;">成交价¥158,000 · 已完成</div></div><div class="ctx-card" onclick="switchPage(\'task\')"><div style="font-size:13px;font-weight:600;color:#e6edf3;margin-bottom:4px;">大众帕萨特 库存预警</div><div style="font-size:12px;color:#8b949e;">周转率偏低 · 建议关注</div></div></div>';
  } else if (type === 'detail') {
    title.textContent = '🚗 车辆详情';
    body.innerHTML = '<div class="ctx-section"><div class="ctx-section-title">基本信息</div><div class="ctx-card"><div class="ctx-row"><span class="ctx-label">车型</span><span class="ctx-value">宝马320Li 2019款</span></div><div class="ctx-row"><span class="ctx-label">上牌时间</span><span class="ctx-value">2019年6月</span></div><div class="ctx-row"><span class="ctx-label">里程</span><span class="ctx-value">8.2万km</span></div><div class="ctx-row"><span class="ctx-label">车况评级</span><span class="ctx-value ok">A- 优秀</span></div></div></div><div class="ctx-section"><div class="ctx-section-title">价格信息</div><div class="ctx-price-block"><div class="ctx-price-label">车主报价</div><div class="ctx-price-value">¥165,000</div><div class="ctx-price-suggest">系统建议：¥158,000以内</div></div><div class="ctx-card"><div class="ctx-row"><span class="ctx-label">阈值</span><span class="ctx-value">¥152,000</span></div><div class="ctx-row"><span class="ctx-label">溢价</span><span class="ctx-value warn">+¥13,000 (+8.5%)</span></div><div class="ctx-row"><span class="ctx-label">市场均价</span><span class="ctx-value">¥155,000</span></div></div></div><button class="ctx-action-btn" onclick="openDecision()">⚡ 立即决策</button><button class="ctx-action-btn secondary" onclick="switchPage(\'chat\')">返回对话</button>';
  } else if (type === 'skill') {
    title.textContent = '🛠️ 我的技能';
    body.innerHTML = '<div class="ctx-section"><div class="ctx-section-title">已安装</div><div class="ctx-card" style="padding:10px 12px;margin-bottom:6px;display:flex;align-items:center;gap:10px;"><span style="font-size:16px;">🔍</span><div style="flex:1;"><div style="font-size:13px;font-weight:600;color:#e6edf3;">网络搜索</div><div style="font-size:11px;color:#484f58;">内置技能</div></div><button class="teach-btn" onclick="switchPage(\'skill\')">🎓</button></div><div class="ctx-card" style="padding:10px 12px;margin-bottom:6px;display:flex;align-items:center;gap:10px;"><span style="font-size:16px;">📊</span><div style="flex:1;"><div style="font-size:13px;font-weight:600;color:#e6edf3;">数据分析</div><div style="font-size:11px;color:#484f58;">内置技能</div></div><button class="teach-btn" onclick="switchPage(\'skill\')">🎓</button></div><div class="ctx-card" style="padding:10px 12px;display:flex;align-items:center;gap:10px;"><span style="font-size:16px;">🚗</span><div style="flex:1;"><div style="font-size:13px;font-weight:600;color:#e6edf3;">车辆估价</div><div style="font-size:11px;color:#484f58;">专业技能</div></div><button class="teach-btn" onclick="switchPage(\'skill\')">🎓</button></div></div><button class="ctx-action-btn secondary" style="margin-top:8px;" onclick="switchPage(\'skill\')">前往技能商店 →</button>';
  }

}

function closeContext() {
  // Context panel is now always visible, do nothing
}

// ================================================================
// PROMPT & MESSAGES
// ================================================================
function handlePrompt(num) {
  var msgs = document.getElementById('messages');
  var texts = ['查看特斯拉Model Y的详细分析', '分析奥迪A4L的谈判策略', '生成今日收车日报'];
  var responses = ['好的，正在调取特斯拉Model Y的详细数据，请稍候...', '为您分析奥迪A4L当前谈判策略...', '正在生成今日收车日报，请稍候...'];
  var userMsg = document.createElement('div');
  userMsg.className = 'msg user';
  userMsg.innerHTML = '<div class="msg-avatar">' + ROLES[CURRENT_ROLE].avatar + '</div><div><div class="msg-bubble">' + texts[num-1] + '</div><div class="msg-time">' + now() + ' · ' + ROLES[CURRENT_ROLE].name + '</div></div>';
  msgs.appendChild(userMsg);
  document.getElementById('promptBlock').remove();
  setTimeout(function() {
    var agentMsg = document.createElement('div');
    agentMsg.className = 'msg agent';
    agentMsg.innerHTML = '<div class="msg-avatar">🤖</div><div><div class="msg-bubble">' + responses[num-1] + '</div><div class="msg-time">' + now() + ' · ' + ROLES[CURRENT_ROLE].agent.name + '</div></div>';
    msgs.appendChild(agentMsg);
    msgs.scrollTop = msgs.scrollHeight;
  }, 800);
  msgs.scrollTop = msgs.scrollHeight;
  if (num === 1) setTimeout(function() { openContext('detail'); }, 1000);
}

// ================================================================
// DECISION MODAL
// ================================================================
function openDecision() {
  document.getElementById('decisionModal').style.display = 'flex';
}
function closeDecision() {
  document.getElementById('decisionModal').style.display = 'none';
}
function selectOption(el) {
  document.querySelectorAll('.decision-option').forEach(function(o) { o.classList.remove('selected'); });
  el.classList.add('selected');
}
function confirmDecision() {
  var selected = document.querySelector('.decision-option.selected');
  var custom = document.getElementById('customPrice').value.trim();
  var label = selected ? selected.querySelector('.decision-label').textContent : '';
  var decision = custom || label;
  closeDecision();
  closeContext();
  var msgs = document.getElementById('messages');
  var userMsg = document.createElement('div');
  userMsg.className = 'msg user';
  userMsg.innerHTML = '<div class="msg-avatar">' + ROLES[CURRENT_ROLE].avatar + '</div><div><div class="msg-bubble">决策确认：' + decision + '</div><div class="msg-time">' + now() + ' · ' + ROLES[CURRENT_ROLE].name + '</div></div>';
  msgs.appendChild(userMsg);
  setTimeout(function() {
    var agentMsg = document.createElement('div');
    agentMsg.className = 'msg agent';
    agentMsg.innerHTML = '<div class="msg-avatar">🤖</div><div><div class="msg-bubble">收到您的决策：' + decision + '。<br><br>✅ 已记录到工作记忆，任务状态已更新。</div><div class="msg-time">' + now() + ' · ' + ROLES[CURRENT_ROLE].agent.name + '</div></div>';
    msgs.appendChild(agentMsg);
    msgs.scrollTop = msgs.scrollHeight;
  }, 600);
  msgs.scrollTop = msgs.scrollHeight;
}

// ================================================================
// SEND MESSAGE
// ================================================================
function sendMessage() {
  var input = document.getElementById('chatInput');
  var text = input.value.trim();
  if (!text) return;
  var msgs = document.getElementById('messages');
  var userMsg = document.createElement('div');
  userMsg.className = 'msg user';
  userMsg.innerHTML = '<div class="msg-avatar">' + ROLES[CURRENT_ROLE].avatar + '</div><div><div class="msg-bubble">' + text + '</div><div class="msg-time">' + now() + ' · ' + ROLES[CURRENT_ROLE].name + '</div></div>';
  msgs.appendChild(userMsg);
  input.value = '';
  setTimeout(function() {
    var agentMsg = document.createElement('div');
    agentMsg.className = 'msg agent';
    agentMsg.innerHTML = '<div class="msg-avatar">🤖</div><div><div class="msg-bubble">好的，我收到了。正在处理您说的"' + text + '"...</div><div class="msg-time">' + now() + ' · ' + ROLES[CURRENT_ROLE].agent.name + '</div></div>';
    msgs.appendChild(agentMsg);
    msgs.scrollTop = msgs.scrollHeight;
  }, 800);
  msgs.scrollTop = msgs.scrollHeight;
}

function now() {
  return new Date().toLocaleTimeString('zh-CN', {hour:'2-digit', minute:'2-digit'});
}

document.getElementById('chatInput').addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// ================================================================
// SKILL INSTALL
// ================================================================
function installSkill(card) {
  var btn = card.querySelector('.store-install-btn');
  if (btn.classList.contains('done')) return;
  btn.textContent = '安装中...';
  var role = ROLES[CURRENT_ROLE];
  setTimeout(function() {
    btn.textContent = '已安装';
    btn.classList.add('done');
    alert('技能已安装到「' + role.agent.name + '」！\n\n点击「🎓 教她用」开始教会分身如何使用。');
  }, 600);
}

// ================================================================
// MEMORY FUNCTIONS
// ================================================================
function switchMemoryAgent(agentId) {
  document.querySelectorAll('.mem-agent-chip').forEach(function(c) { c.classList.remove('active'); c.style.background = '#161b22'; c.style.border = '1px solid #21262d'; });
  var chip = document.getElementById('chip-' + agentId);
  if (chip) { chip.classList.add('active'); chip.style.background = 'rgba(88,166,255,0.12)'; chip.style.border = '1px solid #58a6ff'; }
  var sel = document.querySelector('#page-memory select');
  if (sel) sel.value = agentId;
  var souls = {
    liting: { content: '你是懂车帝望京店的AI收车专家「李婷」，专注于二手车收购评估与谈判。你拥有资深汽车行业知识，精通市场行情分析，能够根据车辆状况、历史成交数据和实时市场动态，给出精准的收车价格建议。<br><br>核心特质：数据驱动、严谨专业、善于谈判。始终追求在控制风险的前提下达成交易。<br><br>工作风格：冷静分析、果断决策。用数据说话，用市场证据支持每一个报价决策。在谈判中懂得留有余地，善于分轮报价，以最大概率达成双方可接受的价格。', tags: ['数据驱动','专业严谨','谈判高手','风险把控'] },
    wangfang: { content: '你是懂车帝望京店的AI运营主管「王芳」，专注于车源管理与数据分析。你拥有丰富的车源渠道管理经验，熟悉库存结构和周转率分析，能够根据市场动态给出最优的车源结构建议。<br><br>核心特质：逻辑严谨、数据敏感、系统思维。善于从数据中发现规律，预测趋势。<br><br>工作风格：注重全局、擅长协调。习惯从数据出发，用报表驱动决策。善于发现异常并提前预警，主动推动业务优化。', tags: ['数据敏感','系统思维','前瞻规划','协调高手'] },
    zhaolei: { content: '你是懂车帝望京店的AI销售主管「赵磊」，专注于客户关系管理与销售转化。你拥有丰富的客户跟进经验，熟悉购车客户的需求画像和决策链路，能够精准匹配车源与客户，提升成交转化率。<br><br>核心特质：客户导向、沟通能力强、善于挖掘需求。始终追求理解客户真实需求，提供最适合的购车方案。<br><br>工作风格：热情主动、细心耐心。习惯从客户角度出发，用专业赢得信任。善于跟进和维护长期客户关系。', tags: ['客户导向','沟通高手','需求挖掘','关系维护'] }
  };
  var profiles = {
    liting: { content: '张明，30岁，懂车帝望京店店长，统筹管理门店整体运营。<br><br>工作内容：制定门店经营目标，监控收车、销售、利润三大指标达成情况。管理定价专员、销售主管、车源主管三个岗位。<br><br>工作习惯：每天晨会同步目标进展，下午复盘异常情况。重视数据驱动决策，对风险高度敏感。', tags: ['店长','全局视角','目标导向'] },
    wangfang: { content: '张明，30岁，懂车帝望京店店长，兼管运营工作。<br><br>工作内容：协助管理车源部门，监控车源转化率和长库龄车情况。与分身「王芳」协同分析库存数据，制定收车优化策略。<br><br>工作习惯：关注数据报表，习惯从宏观角度看问题。喜欢通过数据发现问题，主动提出优化建议。', tags: ['运营视角','数据思维','主动型'] },
    zhaolei: { content: '张明，30岁，懂车帝望京店店长，兼管销售协助。<br><br>工作内容：协助销售部门跟进高价值客户，在定价决策中参考客户购买力和意向度。与分身「赵磊」协同分析客户需求。<br><br>工作习惯：重视客户反馈，习惯在报价前考虑客户承受能力。喜欢与客户建立长期信任关系。', tags: ['客户服务','信任导向','耐心细致'] }
  };
  var soul = souls[agentId] || souls.liting;
  var profile = profiles[agentId] || profiles.liting;
  var soulEl = document.getElementById('soulContent');
  var profileEl = document.getElementById('profileContent');
  var soulTags = document.getElementById('soulTags');
  var profileTags = document.getElementById('profileTags');
  if (soulEl) soulEl.innerHTML = soul.content;
  if (profileEl) profileEl.innerHTML = profile.content;
  if (soulTags) { soulTags.innerHTML = soul.tags.map(function(t) { return '<span class="settings-tag blue">' + t + '</span>'; }).join(''); }
  if (profileTags) { profileTags.innerHTML = profile.tags.map(function(t) { return '<span class="settings-tag blue">' + t + '</span>'; }).join(''); }
}

function showReadonlyAlert() {
  var m = document.createElement('div');
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:1000;display:flex;align-items:center;justify-content:center;';
  m.innerHTML = '<div style="background:#161b22;border:1px solid #30363d;border-radius:14px;padding:32px 40px;text-align:center;max-width:360px;box-shadow:0 16px 48px rgba(0,0,0,0.6);">' +
    '<div style="font-size:40px;margin-bottom:16px;">🔒</div>' +
    '<div style="font-size:16px;font-weight:700;color:#f0f6fc;margin-bottom:8px;">本期暂不支持自定义</div>' +
    '<div style="font-size:13px;color:#8b949e;line-height:1.6;margin-bottom:20px;">灵魂信息与用户画像的编辑功能将在后续版本开放，当前内容由系统自动生成和管理。</div>' +
    '<button class="btn btn-primary" style="padding:10px 24px;border-radius:8px;">知道了</button>' +
    '</div>';
  m.onclick = function(e) { if (e.target === m) m.remove(); };
  document.body.appendChild(m);
}

function approveRule(btn, text, entryId) {
  if (entryId) { var entry = document.getElementById(entryId); } else { var entry = btn ? btn.closest('.rule-entry, .trait-entry') : null; }
  var soulContent = document.getElementById('soulContent');
  var current = soulContent.innerHTML.trim();
  if (current.indexOf(text) === -1) {
    soulContent.innerHTML = current + '<br>• ' + text;
  }
  var entry = document.getElementById(entryId);
  if (entry) { entry.style.opacity = '0.4'; entry.style.pointerEvents = 'none'; }
}

function approveTrait(btn, text, entryId) {
  var profileContent = document.getElementById('profileContent');
  var current = profileContent.innerHTML.trim();
  if (current.indexOf(text) === -1) {
    profileContent.innerHTML = current + '<br>• ' + text;
  }
  var entry = document.getElementById(entryId);
  if (entry) { entry.style.opacity = '0.4'; entry.style.pointerEvents = 'none'; }
}

function addRule() {
  var text = prompt("请输入要补充的行为准则：");
  if (!text || !text.trim()) return;
  var list = document.getElementById('rulesList');
  var id = 'rule-new-' + Date.now();
  var entry = document.createElement('div');
  entry.className = 'rule-entry';
  entry.id = id;
  entry.style.cssText = 'background:#0d1117;border:1px solid #21262d;border-radius:8px;padding:10px 12px;display:flex;align-items:center;gap:10px;';
  entry.innerHTML = '<div style="flex:1;min-width:0;"><div style="font-size:13px;color:#e6edf3;margin-bottom:2px;">' + text.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</div><div style="font-size:11px;color:#58a6ff;">手动补充</div></div><div style="display:flex;gap:6px;flex-shrink:0;"><button class="rule-approve-btn" style="padding:5px 10px;font-size:11px;background:rgba(63,185,80,0.15);border:1px solid rgba(63,185,80,0.3);color:#3fb950;border-radius:5px;cursor:pointer;">✓</button><button class="rule-reject-btn" style="padding:5px 10px;font-size:11px;background:rgba(248,81,73,0.1);border:1px solid rgba(248,81,73,0.2);color:#f85149;border-radius:5px;cursor:pointer;">✕</button></div>';
  entry.querySelector('.rule-approve-btn').onclick = function() {
    var soul = document.getElementById('soulContent');
    if (soul && text) { var cur = soul.innerHTML.trim(); if (cur.indexOf(text) === -1) soul.innerHTML = cur + '<br>• ' + text; }
    entry.style.opacity = '0.35'; entry.style.pointerEvents = 'none';
  };
  entry.querySelector('.rule-reject-btn').onclick = function() {
    entry.style.transition = 'opacity 0.3s'; entry.style.opacity = '0';
    setTimeout(function() { entry.remove(); }, 300);
  };
  list.appendChild(entry);
}

function rejectEntry(btn) {
  var entry = btn.closest('[id]');
  if (entry) {
    entry.style.transition = 'opacity 0.3s';
    entry.style.opacity = '0';
    setTimeout(function() { entry.remove(); }, 300);
  }
}

// Init
switchRole('store');

function addScheduledTask() {
  var type = prompt("任务类型：\n1=数据汇总 2=总结报告 3=预警提醒 4=周报\n请输入数字：");
  var icons = {1:'📊',2:'📋',3:'⚠️',4:'📈'};
  var titles = {1:'数据汇总',2:'总结报告',3:'预警提醒',4:'周报'};
  if (!type || !titles[type]) return;
  var time = prompt("执行时间（如 08:30）：");
  if (!time) return;
  var desc = prompt("任务描述：") || '';
  var list = document.getElementById('scheduledTasksList');
  var id = 'st-new-' + Date.now();
  var html = '<div class="scheduled-task" id="' + id + '" data-role="manager" style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:#0d1117;border:1px solid #21262d;border-radius:8px;">' +
    '<div style="width:36px;height:36px;border-radius:8px;background:rgba(88,166,255,0.1);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">' + icons[type] + '</div>' +
    '<div style="flex:1;min-width:0;"><div style="font-size:13px;color:#e6edf3;font-weight:500;margin-bottom:2px;">' + titles[type] + '</div><div style="font-size:11px;color:#8b949e;">每日 ' + time + ' 自动推送 · ' + desc + '</div></div>' +
    '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0;"><div style="font-size:12px;color:#3fb950;background:rgba(63,185,80,0.1);padding:3px 8px;border-radius:12px;">已启用</div>' +
    '<div class="sched-toggle active" onclick="toggleTask(this)" style="width:36px;height:20px;background:#3fb950;border-radius:10px;cursor:pointer;position:relative;"><div style="position:absolute;top:2px;right:2px;width:16px;height:16px;background:white;border-radius:50%;"></div></div></div></div>';
  list.insertAdjacentHTML('beforeend', html);
}
function toggleTask(el) {
  var isActive = el.classList.contains('active');
  if (isActive) {
    el.classList.remove('active');
    el.style.background = '#30363d';
    el.innerHTML = '<div style="position:absolute;top:2px;left:2px;width:16px;height:16px;background:#8b949e;border-radius:50%;"></div>';
    el.closest('.scheduled-task').querySelector('div:first-child + div + div > div:first-child').textContent = '已暂停';
    el.closest('.scheduled-task').querySelector('div:first-child + div + div > div:first-child').style.color = '#8b949e';
    el.closest('.scheduled-task').querySelector('div:first-child + div + div > div:first-child').style.background = 'rgba(139,148,158,0.1)';
  } else {
    el.classList.add('active');
    el.style.background = '#3fb950';
    el.innerHTML = '<div style="position:absolute;top:2px;right:2px;width:16px;height:16px;background:white;border-radius:50%;"></div>';
    el.closest('.scheduled-task').querySelector('div:first-child + div + div > div:first-child').textContent = '已启用';
    el.closest('.scheduled-task').querySelector('div:first-child + div + div > div:first-child').style.color = '#3fb950';
    el.closest('.scheduled-task').querySelector('div:first-child + div + div > div:first-child').style.background = 'rgba(63,185,80,0.1)';
  }
}

// Initialize dashboard on load
document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('rolePopup').classList.remove('show');
  selectAgent('zhaolei', '销售主管·赵磊', '在线');
  renderRightPanel('zhaolei', 'chat');
});

// ================================================================
// TEAM CHAT
// ================================================================
function sendTeamMessage() {
  var input = document.getElementById('teamChatInput');
  if (!input) return;
  var text = input.value.trim();
  if (!text) return;
  var msgs = document.getElementById('teamChatMessages');
  if (!msgs) return;
  var now = new Date();
  var time = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
  // Build message using DOM (no string concatenation of HTML)
  var msgDiv = document.createElement('div');
  msgDiv.style.cssText = 'display:flex;gap:10px;margin-top:4px;';
  var avatar = document.createElement('div');
  avatar.style.cssText = 'width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#388bfd,#1f6feb);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:white;flex-shrink:0;margin-top:2px;';
  avatar.textContent = '张';
  msgDiv.appendChild(avatar);
  var content = document.createElement('div');
  content.style.cssText = 'flex:1;';
  var nameRow = document.createElement('div');
  nameRow.style.cssText = 'display:flex;align-items:baseline;gap:8px;margin-bottom:4px;';
  var nameSpan = document.createElement('span');
  nameSpan.style.cssText = 'font-size:13px;font-weight:600;color:#58a6ff;';
  nameSpan.textContent = '张明（店长）';
  var timeSpan = document.createElement('span');
  timeSpan.style.cssText = 'font-size:11px;color:#484f58;';
  timeSpan.textContent = time;
  nameRow.appendChild(nameSpan);
  nameRow.appendChild(timeSpan);
  content.appendChild(nameRow);
  var bubble = document.createElement('div');
  bubble.style.cssText = 'background:rgba(88,166,255,0.08);border:1px solid rgba(88,166,255,0.2);border-radius:10px 10px 10px 2px;padding:10px 14px;font-size:13px;color:#e6edf3;line-height:1.6;';
  bubble.textContent = text;
  content.appendChild(bubble);
  msgDiv.appendChild(content);
  msgs.appendChild(msgDiv);
  input.value = '';
  msgs.scrollTop = msgs.scrollHeight;
  setTimeout(function() {
    var responses = [
      { name: '李婷', color: '#388bfd', char: '李', msg: '收到，我会继续跟进这边的情况。' },
      { name: '王芳', color: '#3fb950', char: '王', msg: '好的，我会尽快处理。' },
      { name: '赵磊', color: '#d29922', char: '赵', msg: '明白，我去协调一下人手。' }
    ];
    var r = responses[Math.floor(Math.random() * responses.length)];
    var t = new Date();
    var tt = t.getHours().toString().padStart(2,'0') + ':' + t.getMinutes().toString().padStart(2,'0');
    var rDiv = document.createElement('div');
    rDiv.style.cssText = 'display:flex;gap:10px;margin-top:4px;';
    var rAvatar = document.createElement('div');
    rAvatar.style.cssText = 'width:28px;height:28px;border-radius:50%;background:' + r.color + ';display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:white;flex-shrink:0;margin-top:2px;';
    rAvatar.textContent = r.char;
    rDiv.appendChild(rAvatar);
    var rContent = document.createElement('div');
    rContent.style.cssText = 'flex:1;';
    var rNameRow = document.createElement('div');
    rNameRow.style.cssText = 'display:flex;align-items:baseline;gap:8px;margin-bottom:4px;';
    var rNameSpan = document.createElement('span');
    rNameSpan.style.cssText = 'font-size:13px;font-weight:600;color:#e6edf3;';
    rNameSpan.textContent = r.name;
    var rTimeSpan = document.createElement('span');
    rTimeSpan.style.cssText = 'font-size:11px;color:#484f58;';
    rTimeSpan.textContent = tt;
    rNameRow.appendChild(rNameSpan);
    rNameRow.appendChild(rTimeSpan);
    rContent.appendChild(rNameRow);
    var rBubble = document.createElement('div');
    rBubble.style.cssText = 'background:#21262d;border:1px solid #30363d;border-radius:10px 10px 10px 2px;padding:10px 14px;font-size:13px;color:#e6edf3;line-height:1.6;';
    rBubble.textContent = r.msg;
    rContent.appendChild(rBubble);
    rDiv.appendChild(rContent);
    msgs.appendChild(rDiv);
    msgs.scrollTop = msgs.scrollHeight;
  }, 1200);
}

