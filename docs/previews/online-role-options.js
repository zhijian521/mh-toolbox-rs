/* 每套方案独立内存状态；不访问应用 store、IPC、账本或 localStorage。 */
const schemes = [
    {
        id: 'A',
        name: '印签胶囊',
        desc: '细圆边、短按钮，名字与计时同行。',
        notes: ['视觉最轻', '适合五开常驻', '在线状态用小点与细描边'],
    },
    {
        id: 'B',
        name: '账线名单',
        desc: '角色排成有秩序的账线，减少零散按钮的感觉。',
        notes: ['推荐 · 与账簿更统一', '没有重复的小卡阴影', '角色多时容易扫读'],
    },
    {
        id: 'C',
        name: '侧签薄片',
        desc: '薄底边加短侧签，保留一点纸质立体感。',
        notes: ['推荐 · 轻 3D', '边缘清楚、没有模糊阴影', '与现有票据形成主次'],
    },
    {
        id: 'D',
        name: '浅槽纸键',
        desc: '底座微微凹下，在线角色像落在槽里的纸键。',
        notes: ['一整块浅槽承托', '未上线更安静', '在线角色抬出一层'],
    },
    {
        id: 'E',
        name: '点名圆牌',
        desc: '首字做小圆牌，名字直接摆在右侧。',
        notes: ['识别更直观', '边框不包住全部内容', '略高但仍紧凑'],
    },
    {
        id: 'F',
        name: '状态分栏',
        desc: '先展示计时中的角色，再展示待上线的名字。',
        notes: ['一眼分清在线与未上线', '单个角色仍可直接上线', '开始后会移动到在线区'],
    },
];
const names = [
    '听风',
    '枕星河',
    '半盏清茶',
    '山海归客',
    '月落长安',
    '南巷旧梦',
    '望舒',
    '春山有信',
    '暮云',
    '云间客',
    '一川烟雨',
    '长安故人',
];
const icon = (name) =>
    '<svg class="icon" aria-hidden="true"><use href="#i-' + name + '"></use></svg>';
const escape = (s) =>
    String(s)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
const states = new Map();
let scene = 'normal',
    view = 'all',
    picked = '',
    toastTimer;
function people() {
    const count = scene === 'empty' ? 0 : scene === 'many' ? 12 : 5;
    return names.slice(0, count).map((name, i) => ({
        name: scene === 'long' && i === 2 ? '风吹过长安城的第三个秋天' : name,
        id: i,
    }));
}
function reset() {
    for (const s of schemes)
        states.set(s.id, {
            active:
                scene === 'all'
                    ? people().map((p) => p.id)
                    : scene === 'idle' || scene === 'empty'
                      ? []
                      : [0, 2].filter((i) => i < people().length),
            cost: true,
        });
    render();
}
function press(text, glyph, command, small = false, disabled = false) {
    return (
        '<button type="button" class="press-btn size-' +
        (small ? 'sm' : 'md') +
        '" data-command="' +
        command +
        '" ' +
        (disabled ? 'disabled' : '') +
        '><span class="press-tile press-btn-tile"><span class="press-content"><span class="press-btn-inner">' +
        icon(glyph) +
        '<span>' +
        text +
        '</span></span></span></span></button>'
    );
}
function footer(sub, delta) {
    return (
        '<div class="subrow"><span class="sub">' +
        sub +
        '</span><span class="delta">' +
        delta +
        '</span></div>'
    );
}
function ticket(heading, glyph, rows) {
    return (
        '<section class="ticket-card stats stats-embedded" style="--stat-n:2"><header class="stats-head">' +
        icon(glyph) +
        '<h3>' +
        heading +
        '</h3></header>' +
        rows
            .map(
                (row) =>
                    '<div class="stat"><div class="cap">' +
                    row[0] +
                    '</div><div class="v ' +
                    row[2] +
                    '">' +
                    row[1] +
                    '</div>' +
                    footer(row[3], row[4]) +
                    '</div>',
            )
            .join('') +
        '</section>'
    );
}
function person(p, active) {
    return (
        '<div class="person ' +
        (active ? 'is-on' : '') +
        '"><button class="person-main" type="button" data-start="' +
        p.id +
        '" ' +
        (active ? 'disabled' : '') +
        ' aria-label="' +
        (active ? '正在计时 ' : '上线 ') +
        escape(p.name) +
        '"><span class="initial" aria-hidden="true">' +
        escape(p.name[0]) +
        '</span><span class="start-mark ' +
        (active ? 'dot' : '') +
        '" aria-hidden="true">' +
        (active ? '' : icon('play')) +
        '</span><span class="person-copy"><span class="person-name">' +
        escape(p.name) +
        '</span>' +
        (active ? '<span class="person-time">' + (p.id % 2 ? '00:38' : '01:24') + '</span>' : '') +
        '</span></button>' +
        (active
            ? '<button type="button" class="stop" data-stop="' +
              p.id +
              '" aria-label="结束 ' +
              escape(p.name) +
              ' 的计时" title="结束计时">' +
              icon('x') +
              '</button>'
            : '') +
        '</div>'
    );
}
function roster(scheme, state) {
    const list = people();
    const grid = (items, cls = '') =>
        '<div class="role-grid ' +
        cls +
        '">' +
        items.map((p) => person(p, state.active.includes(p.id))).join('') +
        '</div>';
    let content;
    if (!list.length) content = '<p class="empty">添加角色后，点一下即可上线</p>';
    else if (scheme.id === 'F') {
        const on = list.filter((p) => state.active.includes(p.id)),
            off = list.filter((p) => !state.active.includes(p.id));
        content =
            (on.length
                ? '<p class="split-label">计时中 · ' +
                  on.length +
                  '</p>' +
                  grid(on, 'split-list on')
                : '') +
            (off.length
                ? '<p class="split-label">待上线 · ' +
                  off.length +
                  '</p>' +
                  grid(off, 'split-list off')
                : '');
    } else content = grid(list, scheme.id === 'D' ? 'well' : '');
    return (
        '<div class="roster-zone"><div class="roster-tools">' +
        press('一键上号', 'play', 'all', true, list.length === state.active.length) +
        '</div>' +
        content +
        '</div>'
    );
}
function board(scheme) {
    const state = states.get(scheme.id);
    const switcher =
        '<span class="cost-switch well ' +
        (state.cost ? '' : 'off') +
        '" role="radiogroup" aria-label="点卡计入账号收支"><span class="cost-thumb stamp ' +
        (state.cost ? 'right' : '') +
        '" aria-hidden="true"></span>' +
        [false, true]
            .map(
                (v) =>
                    '<button class="cost-opt track-opt" type="button" role="radio" aria-checked="' +
                    (state.cost === v) +
                    '" tabindex="' +
                    (state.cost === v ? '0' : '-1') +
                    '" data-cost="' +
                    v +
                    '">' +
                    (v ? '计入' : '不计入') +
                    '</button>',
            )
            .join('') +
        '</span>';
    const toolbar =
        '<div class="toolbar">' +
        press('补记', 'pencil', 'backfill') +
        press('记录', 'history', 'records') +
        '<button class="price" type="button" data-command="price">1.5 万 <small>/ 点</small>' +
        icon('pencil') +
        '</button>' +
        switcher +
        '</div>';
    const tickets =
        '<div class="tickets">' +
        ticket('今日在线', 'clock', [
            ['在线时长', '4 小时 12 分', 'num', '昨日3小时', '+40%'],
            ['点卡花费', '37.8 万', 'loss', '昨日27万', '+40%'],
        ]) +
        ticket('今日收益', 'wallet', [
            ['净额', '128.6 万', 'gain', '昨日106万', '+21.3%'],
            ['笔数', '26', 'num', '昨日21笔', '+5 笔'],
        ]) +
        '</div>';
    return (
        '<div class="canvas choice-' +
        scheme.id.toLowerCase() +
        '" data-scheme="' +
        scheme.id +
        '"><section class="board board-plain online-board"><header class="board-head"><h3><span class="section-mark" aria-hidden="true"></span>在线与点卡</h3>' +
        toolbar +
        '</header><div class="main-layout">' +
        tickets +
        roster(scheme, state) +
        '</div></section></div>'
    );
}
function render() {
    document.querySelector('#proposals').innerHTML = schemes
        .map(
            (s) =>
                '<section class="proposal" ' +
                (view !== 'all' && view !== s.id ? 'hidden' : '') +
                '><header class="proposal-head"><div class="proposal-title"><span class="letter">' +
                s.id +
                '</span><div><h2>' +
                s.name +
                '</h2><p>' +
                s.desc +
                '</p></div></div><button class="control pick" type="button" data-pick="' +
                s.id +
                '" aria-pressed="' +
                (picked === s.id) +
                '">' +
                (picked === s.id ? '已选此方案' : '选这套') +
                '</button></header>' +
                board(s) +
                '<p class="detail-note">' +
                s.notes.map((n) => '<span>' + n + '</span>').join('') +
                '</p></section>',
        )
        .join('');
}
function toast(message) {
    const el = document.querySelector('#toast');
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        el.hidden = true;
    }, 2600);
}
document
    .querySelector('.scheme-nav')
    .insertAdjacentHTML(
        'beforeend',
        schemes
            .map(
                (s) =>
                    '<button type="button" data-view="' +
                    s.id +
                    '" aria-pressed="false"><b>' +
                    s.id +
                    '</b>' +
                    s.name +
                    '</button>',
            )
            .join(''),
    );
document.addEventListener('click', (e) => {
    const viewButton = e.target.closest('[data-view]');
    if (viewButton) {
        view = viewButton.dataset.view;
        document
            .querySelectorAll('[data-view]')
            .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
        render();
        return;
    }
    const pick = e.target.closest('[data-pick]');
    if (pick) {
        picked = pick.dataset.pick;
        render();
        toast('已标记 ' + picked + '，把方案字母告诉我即可。');
        return;
    }
    const canvas = e.target.closest('[data-scheme]');
    if (!canvas) return;
    const id = canvas.dataset.scheme,
        state = states.get(id);
    const start = e.target.closest('[data-start]'),
        stop = e.target.closest('[data-stop]');
    if (start && !start.disabled) {
        state.active.push(Number(start.dataset.start));
        render();
        toast('已开始计时');
    }
    if (stop) {
        state.active = state.active.filter((i) => i !== Number(stop.dataset.stop));
        render();
        toast('该角色已结束计时');
    }
    const cost = e.target.closest('[data-cost]');
    if (cost) {
        state.cost = cost.dataset.cost === 'true';
        render();
    }
    const command = e.target.closest('[data-command]')?.dataset.command;
    if (command === 'all') {
        const added = people().length - state.active.length;
        state.active = people().map((p) => p.id);
        render();
        toast('已为 ' + added + ' 个未上线角色开始计时，已在线角色保持。');
    }
    if (command === 'price') toast('这里沿用现有点卡设置弹窗，本次只比较角色样式。');
    if (command === 'records') toast('这里沿用现有上线记录弹窗。');
    if (command === 'backfill') toast('这里沿用现有补记弹窗。');
});
document.addEventListener('keydown', (e) => {
    if (
        !e.target.matches('[data-cost]') ||
        !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)
    )
        return;
    e.preventDefault();
    const id = e.target.closest('[data-scheme]').dataset.scheme;
    states.get(id).cost = e.key === 'ArrowRight' || e.key === 'End';
    render();
    document
        .querySelector('[data-scheme="' + id + '"] [data-cost="' + states.get(id).cost + '"]')
        .focus();
});
document.querySelector('#theme').onchange = (e) => {
    document.documentElement.dataset.style = e.target.value;
};
document.querySelector('#font').onchange = (e) => {
    document.documentElement.dataset.font = e.target.value;
};
document.querySelector('#size').onchange = (e) => {
    document.documentElement.style.setProperty('--fs-scale', e.target.value);
};
document.querySelector('#scene').onchange = (e) => {
    scene = e.target.value;
    reset();
};
for (const name of ['dark', 'narrow', 'focus'])
    document.querySelector('#' + name).onclick = (e) => {
        const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
        e.currentTarget.setAttribute('aria-pressed', String(on));
        (name === 'dark' ? document.documentElement : document.body).classList.toggle(name, on);
    };
document.querySelector('#reset').onclick = reset;
reset();
