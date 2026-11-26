/* 独立内存演示：选择、结束、设置都不调用业务 store，也不写 localStorage。 */
const schemes = [
    {
        id: 'A',
        name: '紧凑工具条',
        desc: '两行完成：上面读数，下面角色与设置。',
        notes: ['占高最少', '收益为右侧文字小结', '适合保留更多速记空间'],
    },
    {
        id: 'B',
        name: '左右账页',
        desc: '左边在线与点卡，右边一张小票，读数和操作分开。',
        notes: ['接近首页票据风格', '设置直接可见', '收益只保留净额、笔数'],
    },
    {
        id: 'C',
        name: '角色优先',
        desc: '先看正在计时的角色，总时长与费用收在下面。',
        notes: ['角色更容易找到', '点击角色结束计时', '适合多开与频繁上下线'],
    },
    {
        id: 'D',
        name: '嵌入读数',
        desc: '时长、点卡、收益排在同一道浅槽里，下面只放角色和设置。',
        notes: ['没有额外票据', '三个读数整齐对齐', '层级最统一'],
    },
    {
        id: 'E',
        name: '按需设置',
        desc: '先展示计时与收益，点卡设置默认收起。',
        notes: ['主要信息更干净', '计入状态仍常驻', '低频设置多一次展开'],
    },
    {
        id: 'F',
        name: '计时与账单',
        desc: '左边看角色和累计时长，右边用账线列出今日点卡与收益。',
        notes: ['费用和收益集中看', '保留票据质感', '点卡不混入速记净额'],
    },
];
const people = [
    { name: '星河入梦', time: '02:18' },
    { name: '长安听雨', time: '01:42' },
    { name: '月照山河', time: '01:12' },
    { name: '一蓑烟雨任平生', time: '00:57' },
    { name: '青山客', time: '00:48' },
    { name: '江上清风', time: '00:36' },
    { name: '浮生半日闲', time: '00:24' },
    { name: '晚来天欲雪', time: '00:15' },
];
const states = Object.fromEntries(
    schemes.map(({ id }) => [id, { active: [0, 1, 2], countCost: true, price: 1.5 }]),
);
let scene = 'normal';
let view = 'all';
let picked = '';
let toastTimer;
const root = document.documentElement;
const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#i-${name}" /></svg>`;
const action = (label, name, command) =>
    `<button type="button" class="action press-tile" data-command="${command}">${icon(name)}${label}</button>`;
const quiet = (label, name, command) =>
    `<button type="button" class="quiet" data-command="${command}">${icon(name)}${label}</button>`;
const money = (value) => `${Number(value.toFixed(2))} 万`;
const totalMinutes = () => (scene === 'empty' ? 0 : scene === 'many' ? 624 : 504);
const cost = (state) => money((totalMinutes() / 60) * 6 * state.price);
const gain = () => (scene === 'empty' ? '—' : '486.8 万');
const count = () => (scene === 'empty' ? '0 笔' : '26 笔');
const controls = () => action('补记', 'pencil', 'backfill') + action('记录', 'history', 'records');
function metric(label, amount, name, tone = 'num', foot = '') {
    return `<div class="metric"><div class="label">${icon(name)}${label}</div><span class="amount ${tone}">${amount}</span>${foot ? `<p class="foot">${foot}</p>` : ''}</div>`;
}
function durationMetric() {
    return metric(
        '今日累计时长',
        totalMinutes() ? (scene === 'many' ? '10 小时 24 分' : '8 小时 24 分') : '—',
        'clock',
    );
}
function costMetric(state) {
    return metric(
        '今日点卡',
        totalMinutes() ? cost(state) : '—',
        'wallet',
        totalMinutes() ? 'loss' : 'num',
    );
}
function incomeFlat() {
    if (scene === 'error')
        return '<div class="income-flat"><p class="cap">今日收益</p><div class="amount muted">未读取</div><p class="minor">重试入口保留在页面提示中</p></div>';
    return `<div class="income-flat"><p class="cap">今日收益</p><div class="amount ${scene === 'empty' ? 'num' : 'gain'}">${gain()}</div><p class="minor">${count()} · 较昨日 ${scene === 'empty' ? '—' : '+12.4%'}</p></div>`;
}
function receipt() {
    return `<aside class="ticket-card receipt"><header class="receipt-head"><span>${icon('wallet')} 今日收益</span><span class="cap">速记净额</span></header><div class="receipt-body">${incomeFlat().replace('<p class="cap">今日收益</p>', '')}</div></aside>`;
}
function settings(state, folded = false) {
    const content = `<div class="settings-line"><div class="cost-switch well ${state.countCost ? '' : 'off'}" role="radiogroup" aria-label="点卡计入账号收支"><span class="cost-thumb stamp ${state.countCost ? 'right' : ''}" aria-hidden="true"></span><button type="button" class="cost-opt" role="radio" aria-checked="${!state.countCost}" data-cost="false" tabindex="${state.countCost ? '-1' : '0'}">不计</button><button type="button" class="cost-opt" role="radio" aria-checked="${state.countCost}" data-cost="true" tabindex="${state.countCost ? '0' : '-1'}">计入</button></div>${quiet(`${money(state.price)}/点`, 'pencil', 'price')}</div>`;
    return folded
        ? `<details class="settings-fold"><summary>${icon('plus')}点卡设置 · ${state.countCost ? '计入账号' : '不计入账号'} · ${money(state.price)}/点</summary>${content}</details>`
        : content;
}
function person(index) {
    const one = people[index];
    return `<button type="button" class="person" data-stop="${index}" title="结束 ${one.name} 的计时" aria-label="结束 ${one.name} 的计时"><span class="dot" aria-hidden="true"></span><span class="person-name">${one.name}</span><span class="person-time">${one.time}</span>${icon('x')}</button>`;
}
function roster(state, grid = false) {
    return state.active.length
        ? `<div class="${grid ? 'c-people' : 'who-strip'}" aria-label="正在计时的角色" ${grid ? '' : 'tabindex="0"'}>${state.active.map(person).join('')}</div>`
        : `<p class="empty">${scene === 'empty' ? '今天还没有开始计时' : '暂无在线角色'}</p>`;
}
function card(scheme) {
    const state = states[scheme.id];
    const head = `<header class="board-title"><div class="board-title-main"><span class="section-mark" aria-hidden="true"></span><h3>在线与点卡</h3><span class="count">${state.active.length ? `${state.active.length} 个角色计时中` : '未在计时'}</span></div><div class="actions">${controls()}</div></header>`;
    const metrics = `<div class="metrics">${durationMetric()}${costMetric(state)}</div>`;
    const variants = {
        A: `<div class="a-top">${metrics}<div class="a-income">${incomeFlat()}</div></div><div class="a-bottom">${roster(state)}${settings(state)}</div>`,
        B: `<div class="b-layout"><div class="b-main">${metrics}${settings(state)}${roster(state)}</div>${receipt()}</div>`,
        C: `${roster(state, true)}<div class="c-foot">${metrics}<div class="c-income">${incomeFlat()}</div></div><div class="c-settings">${settings(state)}</div>`,
        D: `<div class="d-readouts well">${durationMetric()}${costMetric(state)}${incomeFlat()}</div><div class="d-bottom">${roster(state)}${settings(state)}</div>`,
        E: `<div class="e-main"><div class="e-left">${metrics}${roster(state)}</div><div class="e-income">${incomeFlat()}</div></div>${settings(state, true)}`,
        F: `<div class="f-layout"><div class="f-left"><div class="metrics">${durationMetric()}</div>${roster(state)}${settings(state)}</div><aside class="ticket-card f-slip"><header class="receipt-head"><span>今日账单</span>${icon('wallet')}</header><dl><div class="bill-row"><dt>点卡消耗</dt><dd class="${totalMinutes() ? 'loss' : 'num'}">${totalMinutes() ? cost(state) : '—'}</dd></div><div class="bill-row"><dt>速记笔数</dt><dd>${scene === 'error' ? '未读取' : count()}</dd></div><div class="bill-row bill-final"><dt>速记净额</dt><dd class="${scene === 'error' ? 'muted' : 'gain'}">${scene === 'error' ? '未读取' : gain()}</dd></div></dl><p class="receipt-foot">速记净额不扣点卡</p></aside></div>`,
    };
    return `<div class="canvas scheme-${scheme.id.toLowerCase()}" data-scheme="${scheme.id}"><section class="board board-plain online-board" aria-label="${scheme.name}预览">${head}${variants[scheme.id]}</section></div>`;
}
function render() {
    document.querySelector('#proposals').innerHTML = schemes
        .map(
            (scheme) =>
                `<section class="proposal" id="scheme-${scheme.id}" ${view !== 'all' && view !== scheme.id ? 'hidden' : ''}><header class="proposal-head"><div class="proposal-title"><span class="letter">${scheme.id}</span><div><h2>${scheme.name}</h2><p>${scheme.desc}</p></div></div><button class="control pick" type="button" data-pick="${scheme.id}" aria-pressed="${picked === scheme.id}">${picked === scheme.id ? '已选此方案' : '选这套'}</button></header>${card(scheme)}<p class="detail-note">${scheme.notes.map((note) => `<span>${note}</span>`).join('')}</p></section>`,
        )
        .join('');
}
function showToast(message) {
    const toast = document.querySelector('#toast');
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.hidden = true;
    }, 2800);
}
function showDialog(title, content) {
    document.querySelector('#dialog-title').textContent = title;
    document.querySelector('#dialog-content').innerHTML = content;
    document.querySelector('#demo-dialog').showModal();
}
document
    .querySelector('.scheme-nav')
    .insertAdjacentHTML(
        'beforeend',
        schemes
            .map(
                (scheme) =>
                    `<button type="button" data-view="${scheme.id}" aria-pressed="false"><b>${scheme.id}</b>${scheme.name}</button>`,
            )
            .join(''),
    );
document.addEventListener('click', (event) => {
    const viewButton = event.target.closest('[data-view]');
    if (viewButton) {
        view = viewButton.dataset.view;
        document
            .querySelectorAll('[data-view]')
            .forEach((button) =>
                button.setAttribute('aria-pressed', String(button.dataset.view === view)),
            );
        render();
    }
    const pick = event.target.closest('[data-pick]');
    if (pick) {
        picked = pick.dataset.pick;
        render();
        showToast(
            `已标记 ${picked}「${schemes.find((scheme) => scheme.id === picked).name}」，把字母告诉我即可。`,
        );
    }
    const jump = event.target.closest('.recommendation a');
    if (jump) {
        const target = jump.getAttribute('href').slice(-1);
        document.querySelector(`[data-view="${target}"]`).click();
    }
    const canvas = event.target.closest('[data-scheme]');
    if (!canvas) return;
    const id = canvas.dataset.scheme;
    const state = states[id];
    const stop = event.target.closest('[data-stop]');
    if (stop) {
        const index = Number(stop.dataset.stop);
        state.active = state.active.filter((one) => one !== index);
        render();
        showToast(`演示：${people[index].name} 已结束计时，今日累计时长保持。`);
    }
    const costButton = event.target.closest('[data-cost]');
    if (costButton) {
        state.countCost = costButton.dataset.cost === 'true';
        render();
        showToast(
            `演示：之后上线${state.countCost ? '计入' : '不计入'}账号收支，今日已产生费用保持。`,
        );
    }
    const command = event.target.closest('[data-command]')?.dataset.command;
    if (command === 'price') {
        showDialog(
            '点卡单价',
            `<div class="price-edit"><input class="field" id="demo-price" type="number" min="0" step="0.01" value="${state.price}" aria-label="演示点卡单价"><span>万 / 点</span><button type="button" class="control" id="save-price">应用</button></div><p class="dialog-note">仅修改当前方案的演示单价。</p>`,
        );
        document.querySelector('#save-price').onclick = () => {
            const value = document.querySelector('#demo-price').valueAsNumber;
            if (!Number.isFinite(value) || value < 0) return;
            state.price = value;
            document.querySelector('#demo-dialog').close();
            render();
        };
    }
    if (command === 'records')
        showDialog(
            '上线记录',
            `<ul class="dialog-list">${state.active.map((index) => `<li><span>${people[index].name}</span><span class="num">${people[index].time} · 计时中</span></li>`).join('') || '<li>暂无在线角色</li>'}</ul><p class="dialog-note">此处演示入口位置，正式版沿用原上线记录弹窗。</p>`,
        );
    if (command === 'backfill')
        showDialog(
            '补记在线时长',
            '<p class="dialog-note">此处演示补记入口，正式版沿用原角色、日期与起止时间表单。</p>',
        );
});
document.addEventListener('keydown', (event) => {
    if (
        !event.target.matches('[data-cost]') ||
        !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
    )
        return;
    event.preventDefault();
    const canvas = event.target.closest('[data-scheme]');
    const id = canvas.dataset.scheme;
    states[id].countCost = event.key === 'ArrowRight' || event.key === 'End';
    render();
    document.querySelector(`[data-scheme="${id}"] [data-cost="${states[id].countCost}"]`).focus();
});
document.querySelector('#theme').onchange = (event) => {
    root.dataset.style = event.target.value;
};
document.querySelector('#font').onchange = (event) => {
    root.dataset.font = event.target.value;
};
document.querySelector('#size').onchange = (event) => {
    root.style.setProperty('--fs-scale', event.target.value);
};
for (const id of ['dark', 'narrow'])
    document.querySelector('#' + id).onclick = (event) => {
        const active = event.currentTarget.getAttribute('aria-pressed') !== 'true';
        event.currentTarget.setAttribute('aria-pressed', String(active));
        (id === 'dark' ? root : document.body).classList.toggle(id, active);
    };
function resetScene() {
    for (const state of Object.values(states)) {
        state.active =
            scene === 'idle' || scene === 'empty'
                ? []
                : scene === 'many'
                  ? people.map((_, index) => index)
                  : [0, 1, 2];
        state.countCost = true;
        state.price = 1.5;
    }
    render();
}
document.querySelector('#state').onchange = (event) => {
    scene = event.target.value;
    resetScene();
};
document.querySelector('#reset').onclick = resetScene;
render();
