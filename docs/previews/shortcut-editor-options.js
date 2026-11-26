import {
    DragDropManager,
    Feedback,
    KeyboardSensor,
    PointerActivationConstraints,
    PointerSensor,
} from '@dnd-kit/dom';
import { Sortable } from '@dnd-kit/dom/sortable';

// 只管理提案的内存数据，不读取或写入应用偏好与账本。
const schemes = [
    {
        id: 'A',
        title: '书签目录 · 编排棋盘',
        note: '左边找功能，右边直接编排。编号格更接近首页的实际布局。',
    },
    {
        id: 'B',
        title: '分类侧栏 · 收纳抽屉',
        note: '分类、功能、已添加各占一列，已添加列表像一只独立的浅抽屉。',
    },
    {
        id: 'C',
        title: '上方排序 · 下方点选',
        note: '取消左右分栏。已添加的始终在上面，下面按分类挑选新功能。',
    },
    {
        id: 'D',
        title: '双栏清单 · 轻账线',
        note: '去掉重复的小盒子。两边都用轻量清单，只保留图标、名称和必要说明。',
    },
    {
        id: 'E',
        title: '编排画布 · 添加侧栏',
        note: '重点放在已经选好的入口。功能库可收起，排好顺序再展开添加。',
    },
];
const items = [
    ['characters', '角色名册', '查看全部角色', '角色', 'users', 'accent'],
    ['character-new', '新增角色', '建立角色档案', '角色', 'plus', 'accent'],
    ['character-attrs', '属性', '属性与截图识别', '角色', 'scan', 'accent'],
    ['character-skills', '师门', '师门技能与等级', '角色', 'flag', 'indigo'],
    ['character-assist', '辅助', '生活与剧情技能', '角色', 'pencil', 'moss'],
    ['character-training', '修炼', '人物与召唤兽修炼', '角色', 'flag', 'ochre'],
    ['character-gear', '装备', '装备与灵饰', '角色', 'tag', 'indigo'],
    ['character-pets', '召唤兽', '资质与技能', '角色', 'users', 'moss'],
    ['income-quick', '物品速记', '记录游戏产出', '收益', 'pencil', 'moss'],
    ['income-history', '收益历史', '按天与角色查账', '收益', 'history', 'indigo'],
    ['online-start', '角色上线', '选择角色开始计时', '收益', 'play', 'moss'],
    ['online-backfill', '补记在线', '补录过去时段', '收益', 'clock', 'ochre'],
    ['online-records', '在线记录', '时长与点卡', '收益', 'history', 'indigo'],
    ['account-new', '记一笔', '收入与支出', '账号', 'wallet', 'accent'],
    ['account-history', '账号历史', '全部收支明细', '账号', 'history', 'indigo'],
    ['accounts', '账号收支', '收支统计与渠道', '账号', 'wallet', 'accent'],
    ['price-new', '添加物价', '新增物品行情', '物价', 'tag', 'indigo'],
    ['prices', '物价行情', '查行情与记价格', '物价', 'tag', 'indigo'],
    ['goals', '目标', '查看养成与进度', '目标', 'flag', 'ochre'],
    ['goal-new', '新增目标', '设定养成计划', '目标', 'flag', 'accent'],
    ['tool-ghost', '捉鬼助手', '定位与计时', '工具', 'scan', 'moss'],
    ['tool-alarm', '闹钟', '安排日常提醒', '工具', 'clock', 'ochre'],
    ['tool-activities', '活动日历', '查看游戏活动', '工具', 'calendar', 'ochre'],
    ['tool-resources', '游戏资源', '查看图鉴与资源', '工具', 'tools', 'moss'],
    ['alarm-new', '新增闹钟', '设定提醒时刻', '工具', 'plus', 'ochre'],
    ['settings', '设置', '主题、字体与数据', '设置', 'tools', 'indigo'],
].map(([id, name, description, group, icon, tone]) => ({
    id,
    name,
    description,
    group,
    icon,
    tone,
}));
const byId = new Map(items.map((item) => [item.id, item]));
const defaultIds = [
    'account-new',
    'price-new',
    'tool-ghost',
    'tool-alarm',
    'income-quick',
    'goal-new',
    'tool-activities',
    'online-records',
];
const groups = ['全部', ...new Set(items.map((item) => item.group))];
const icon = (name, extra = '') =>
    `<svg class="icon ${extra}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
const states = new Map();
const keyboardReduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

document.querySelector('.scheme-switch').innerHTML = [
    '<button type="button" data-view="all" aria-pressed="true">全部对比</button>',
    ...schemes.map(
        (s) =>
            `<button type="button" data-view="${s.id}" aria-pressed="false">${s.id} ${s.title.split(' · ')[0]}</button>`,
    ),
].join('');
document.querySelector('#gallery').innerHTML = schemes
    .map(
        (s) => `
    <section class="proposal" id="proposal-${s.id}" data-scheme="${s.id}" aria-labelledby="title-${s.id}">
        <header class="proposal-heading"><div><span class="proposal-letter">${s.id}</span><div><h2 id="title-${s.id}">${s.title}</h2><p>${s.note}</p></div></div><button type="button" class="control choose" data-choose="${s.id}" aria-pressed="false">选这套</button></header>
        <div class="window">
            <header class="window-head"><h3>自定义常用功能</h3><div class="head-actions"><span class="head-status">添加与排序</span><button type="button" class="icon-button" data-action="close" aria-label="关闭此方案预览">${icon('x')}</button></div></header>
            <div class="editor-body">
                <section class="catalog-area" aria-label="功能库">
                    <div class="catalog-top"><div class="pane-title"><h4>功能库</h4></div><div class="search">${icon('search')}<input type="search" placeholder="搜索功能" aria-label="搜索功能"></div></div>
                    <nav class="categories" aria-label="功能分类">${groups.map((group) => `<button type="button" class="category" data-group="${group}" aria-pressed="${group === '全部'}">${group}</button>`).join('')}</nav>
                    <div class="library" tabindex="0" aria-label="可添加的功能"></div>
                </section>
                <section class="selection-area" aria-label="首页排列">
                    <div class="pane-title"><h4>${s.id === 'E' ? '常用功能' : '首页排列'}</h4><span class="count">8 项</span><button type="button" class="control drawer-toggle selection-tool" data-action="drawer">收起功能库</button></div>
                    <p class="pane-note">拖动条目调整顺序，点右侧 × 移除。</p>
                    <div class="selected-list" role="list" aria-label="已添加的功能顺序"></div>
                </section>
            </div>
            <div class="reopen"><button type="button" class="secondary" data-action="open">重新打开预览</button></div>
            <footer class="window-foot"><button type="button" class="text-button" data-action="reset">恢复默认</button><span class="demo-status" role="status" aria-live="polite">已添加 8 项</span><button type="button" class="secondary" data-action="cancel">取消</button><button type="button" class="primary" data-action="save">保存</button></footer>
        </div>
    </section>`,
    )
    .join('');

function refreshLibrary(state) {
    const query = state.query.trim().toLocaleLowerCase();
    const filtered = items.filter(
        (item) =>
            (state.group === '全部' || item.group === state.group) &&
            (!query ||
                (item.name + item.description + item.group).toLocaleLowerCase().includes(query)),
    );
    const labels = [...new Set(filtered.map((item) => item.group))];
    state.root.querySelector('.library').innerHTML = labels.length
        ? labels
              .map(
                  (label) => `
        <section class="library-group"><h5 class="group-label">${label}</h5><div class="library-grid">${filtered
            .filter((item) => item.group === label)
            .map((item) => {
                const added = state.order.includes(item.id);
                return `<button type="button" class="catalog-button ${added ? 'is-added' : ''}" data-add="${item.id}" data-tone="${item.tone}" ${added ? 'disabled' : ''} aria-label="${added ? '已添加' : '添加'}：${item.name}" title="${item.description}">${icon(item.icon)}<span class="catalog-copy"><span>${item.name}</span><small>${item.description}</small></span><span class="state">${icon(added ? 'check' : 'plus')}</span></button>`;
            })
            .join('')}</div></section>`,
              )
              .join('')
        : '<p class="empty-note">没有匹配的功能</p>';
}

function updateLabels(state) {
    state.root.querySelector('.count').textContent = `${state.order.length} 项`;
    state.root.querySelector('.head-status').textContent = `${state.order.length} 个首页入口`;
    for (const element of state.root.querySelectorAll('.selected-list > .pick-row')) {
        const index = state.order.indexOf(element.dataset.id);
        element.querySelector('.order-no').textContent = String(index + 1).padStart(2, '0');
        element.setAttribute(
            'aria-label',
            `${byId.get(element.dataset.id).name}，第 ${index + 1} 项`,
        );
    }
}

function refreshSelection(state) {
    for (const sortable of state.sortables) sortable.destroy();
    const container = state.root.querySelector('.selected-list');
    container.innerHTML = state.order.length
        ? state.order
              .map((id, index) => {
                  const item = byId.get(id);
                  return `<div class="pick-row" data-id="${id}" data-tone="${item.tone}" role="listitem" tabindex="0" aria-label="${item.name}，第 ${index + 1} 项">${icon('grip', 'grip')}<span class="order-no">${String(index + 1).padStart(2, '0')}</span>${icon(item.icon, 'main-icon')}<span class="pick-copy"><span class="pick-name">${item.name}</span><small>${item.group}</small></span><button type="button" class="icon-button remove" data-remove="${id}" aria-label="移除：${item.name}">${icon('x')}</button></div>`;
              })
              .join('')
        : '<p class="empty-note">从功能库挑选入口，添加后可拖动排序。</p>';
    state.sortables = [...container.querySelectorAll('.pick-row')].map(
        (element, index) =>
            new Sortable(
                {
                    id: `${state.id}/${element.dataset.id}`,
                    element,
                    index,
                    group: state.id,
                    type: state.id,
                    accept: state.id,
                    transition: {
                        duration: keyboardReduced() ? 0 : 220,
                        easing: 'cubic-bezier(.2,.75,.25,1)',
                    },
                },
                state.manager,
            ),
    );
    updateLabels(state);
    refreshLibrary(state);
}

for (const scheme of schemes) {
    const root = document.querySelector(`#proposal-${scheme.id}`);
    const manager = new DragDropManager({
        plugins: (defaults) => [
            ...defaults.filter((plugin) => plugin !== Feedback),
            Feedback.configure({
                feedback: 'clone',
                rootElement: () => root.querySelector('.window'),
                dropAnimation: {
                    duration: keyboardReduced() ? 0 : 200,
                    easing: 'cubic-bezier(.2,.75,.25,1)',
                },
            }),
        ],
        sensors: [
            PointerSensor.configure({
                activationConstraints: [new PointerActivationConstraints.Distance({ value: 5 })],
                preventActivation: (event) => !!event.target.closest('button, input, select, a'),
            }),
            KeyboardSensor,
        ],
    });
    const state = {
        id: scheme.id,
        root,
        manager,
        order: [...defaultIds],
        saved: [...defaultIds],
        query: '',
        group: '全部',
        sortables: [],
    };
    states.set(scheme.id, state);
    refreshSelection(state);
    manager.monitor.addEventListener('dragstart', () => {
        root.querySelector('.demo-status').textContent = '拖动中，其他条目会自动让位';
    });
    manager.monitor.addEventListener('dragend', (event) => {
        if (event.canceled) {
            root.querySelector('.demo-status').textContent = '已取消本次拖动';
            return;
        }
        state.order = [...state.sortables]
            .sort((a, b) => a.index - b.index)
            .map((sortable) => String(sortable.id).split('/')[1]);
        updateLabels(state);
        root.querySelector('.demo-status').textContent = '顺序已调整，保存后生效';
    });
    root.querySelector('input[type=search]').addEventListener('input', (event) => {
        state.query = event.target.value;
        refreshLibrary(state);
    });
    root.addEventListener('click', (event) => {
        const button = event.target.closest('button');
        if (!button || button.disabled) return;
        if (button.dataset.group) {
            state.group = button.dataset.group;
            root.querySelectorAll('.category').forEach((category) =>
                category.setAttribute('aria-pressed', String(category === button)),
            );
            refreshLibrary(state);
        } else if (button.dataset.add) {
            if (state.order.includes(button.dataset.add)) return;
            state.order.push(button.dataset.add);
            refreshSelection(state);
            root.querySelector('.selected-list').lastElementChild?.scrollIntoView({
                block: 'nearest',
                inline: 'nearest',
            });
            root.querySelector('.demo-status').textContent =
                `已添加 ${byId.get(button.dataset.add).name}`;
        } else if (button.dataset.remove) {
            state.order = state.order.filter((id) => id !== button.dataset.remove);
            refreshSelection(state);
            root.querySelector('.demo-status').textContent =
                `已移除 ${byId.get(button.dataset.remove).name}`;
        } else if (button.dataset.action === 'reset') {
            state.order = [...defaultIds];
            refreshSelection(state);
            root.querySelector('.demo-status').textContent = '已恢复默认，保存后生效';
        } else if (button.dataset.action === 'save') {
            state.saved = [...state.order];
            root.querySelector('.demo-status').textContent = '已保存此预览的排列';
        } else if (button.dataset.action === 'cancel') {
            state.order = [...state.saved];
            refreshSelection(state);
            root.querySelector('.demo-status').textContent = '已撤销未保存的更改';
        } else if (button.dataset.action === 'drawer') {
            const closed = root.classList.toggle('drawer-closed');
            button.textContent = closed ? '添加功能' : '收起功能库';
        } else if (button.dataset.action === 'close' || button.dataset.action === 'open') {
            root.querySelector('.window').classList.toggle(
                'is-closed',
                button.dataset.action === 'close',
            );
        }
    });
}

document.querySelectorAll('[data-view]').forEach((button) =>
    button.addEventListener('click', () => {
        document
            .querySelectorAll('[data-view]')
            .forEach((other) => other.setAttribute('aria-pressed', String(other === button)));
        document.querySelectorAll('.proposal').forEach((section) => {
            section.hidden =
                button.dataset.view !== 'all' && section.dataset.scheme !== button.dataset.view;
        });
    }),
);
document.querySelectorAll('[data-choose]').forEach((button) =>
    button.addEventListener('click', () => {
        document
            .querySelectorAll('[data-choose]')
            .forEach((other) => other.setAttribute('aria-pressed', String(other === button)));
        const scheme = schemes.find((s) => s.id === button.dataset.choose);
        document.querySelector('#choice').textContent =
            `已选 ${scheme.id} · ${scheme.title}，告诉我字母后再应用。`;
    }),
);
document.querySelector('#theme').addEventListener('change', (event) => {
    document.documentElement.dataset.style = event.target.value;
});
document.querySelector('#font').addEventListener('change', (event) => {
    document.documentElement.dataset.font = event.target.value;
});
document.querySelector('#dark').addEventListener('click', (event) => {
    event.currentTarget.setAttribute(
        'aria-pressed',
        String(document.documentElement.classList.toggle('dark')),
    );
});
document.querySelector('#compact').addEventListener('click', (event) => {
    event.currentTarget.setAttribute(
        'aria-pressed',
        String(document.body.classList.toggle('compact')),
    );
});
document.querySelector('#engine-status').textContent = '可以直接拖动每一项，体验浮起、让位与落位。';
window.addEventListener('pagehide', () => {
    for (const state of states.values()) state.manager.destroy();
});
