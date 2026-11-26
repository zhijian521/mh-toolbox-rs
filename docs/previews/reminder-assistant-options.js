/* 三套版式共用演示状态，不调用桌面能力或保存本机偏好。 */
const root = document.documentElement;
const tabs = [...document.querySelectorAll('.scheme-tab')];
const cards = [...document.querySelectorAll('.scheme-card')];
const previews = [...document.querySelectorAll('.demo-window')];
const feedback = document.querySelector('#engine-status');
const dialog = document.querySelector('.preview-dialog');
const kinds = ['fengyao', 'yaowang', 'yecha', 'yiguan'];
const names = ['封妖', '妖王', '梦魇夜叉', '衣冠古丘'];
const maps = [
    '建邺城',
    '江南野外',
    '大唐国境',
    '大唐境外',
    '傲来国',
    '长寿郊外',
    '朱紫国',
    '北俱芦洲',
    '麒麟山',
    '蓬莱仙岛',
    '碗子山',
    '柳林坡',
    '比丘国',
];
const windows = ['梦幻西游 · 独立聊天窗口（一）', '梦幻西游 · 独立聊天窗口（二）'];
const alerts = [
    {
        time: '20:46',
        text: '【示例原文】[系统]少侠挖宝时不慎挖塌了妖怪的房子，一群无家可归的妖怪正在大唐国境寻衅闹事。',
    },
    { time: '20:42', text: '【示例原文】[系统]少侠挖宝时惊动了妖王，妖王正在北俱芦洲寻衅闹事。' },
    { time: '20:37', text: '【示例原文】[系统]衣冠古丘：朱紫国（116，72）出现了一座墓碑。' },
];
const state = { running: false, enabled: new Set(['fengyao']), scenes: new Set(), window: 0 };
let returnFocus;

function selectScheme(scheme) {
    tabs.forEach((tab) => {
        const selected = tab.dataset.scheme === scheme;
        tab.classList.toggle('is-active', selected);
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
    });
    cards.forEach((card) => {
        card.hidden = card.dataset.option !== scheme;
    });
    location.hash = scheme;
    feedback.textContent = `当前方案 ${scheme.toUpperCase()} · 示例数据，所有操作仅用于预览。`;
}

function openDialog(title, body) {
    returnFocus = document.activeElement;
    document.querySelector('#dialog-title').textContent = title;
    document.querySelector('#dialog-body').innerHTML = body;
    dialog.showModal();
    dialog.querySelector('[data-close-dialog]').focus();
}

function renderState() {
    const count = state.enabled.size;
    const mapLabel = state.scenes.size ? `已选 ${state.scenes.size} 个地图` : '全部地图';
    previews.forEach((preview, index) => {
        const toggle = preview.querySelector('.demo-toggle');
        preview.classList.toggle('is-listening', state.running);
        toggle.disabled = count === 0;
        toggle.setAttribute('aria-pressed', String(state.running));
        toggle.querySelector('.toggle-label').textContent = state.running ? '停止监听' : '开始监听';
        preview.querySelectorAll('[data-kind]').forEach((button) => {
            const enabled = state.enabled.has(button.dataset.kind);
            button.classList.toggle('is-on', enabled);
            button.setAttribute('aria-checked', String(enabled));
        });
        preview.querySelectorAll('[data-map]').forEach((button) => {
            const selected =
                button.dataset.map === 'all'
                    ? !state.scenes.size
                    : state.scenes.has(button.dataset.map);
            button.classList.toggle('is-selected', selected);
            button.setAttribute('aria-pressed', String(selected));
        });
        preview.querySelector('[data-map-label]').textContent = mapLabel;
        preview.querySelectorAll('[data-window-label]').forEach((label) => {
            label.textContent = windows[state.window];
            label.title = windows[state.window];
        });
        if (index === 0) {
            preview.querySelector('.state-chip').textContent = state.running ? '监听中' : '未开始';
            preview.querySelector('.panel-count').textContent = `${count} / 4 已开启`;
            preview.querySelector('.live-caption').textContent = state.running
                ? '● 正在监听'
                : '等待监听';
            preview.querySelector('[data-kind="fengyao"] small').textContent = mapLabel;
        }
        if (index === 1) {
            preview.querySelector('.b-summary').textContent = `${count} 个提醒已开启`;
            preview.querySelector('.rail-state strong').textContent = state.running
                ? '正在监听'
                : '未开始监听';
            preview.querySelector('.rail-state small').textContent = count
                ? '新公告符合条件时提醒'
                : '请至少开启一种提醒';
            preview.querySelector('.rail-foot').textContent = state.running
                ? '● 正在接收新公告'
                : '○ 监听已停止';
            preview.querySelector('[data-kind="fengyao"] small').textContent =
                `${mapLabel} · 发现后通知`;
        }
        if (index === 2) {
            preview.querySelector('.c-head .state-chip').textContent = state.running
                ? '● 监听中'
                : '未开始';
            preview.querySelector('.c-settings .state-chip').textContent = `${count} / 4 开启`;
        }
    });
}

function prepareMaps(preview, index) {
    const container = preview.querySelector('.map-filter-row, .b-map-drawer, .c-map-summary');
    container.innerHTML = `<details class="maps-details"><summary><span>封妖地图</span><span><span data-map-label>全部地图</span> <span class="map-chevron" aria-hidden="true">⌄</span></span></summary><div class="map-chips" role="group" aria-label="封妖地图选择"><button class="map-chip" type="button" data-map="all">全部地图</button>${maps.map((name) => `<button class="map-chip" type="button" data-map="${name}">${name}</button>`).join('')}</div></details>`;
    container.querySelector('details').open = index === 1;
    container.querySelectorAll('[data-map]').forEach((button) => {
        button.addEventListener('click', () => {
            const map = button.dataset.map;
            if (map === 'all') state.scenes.clear();
            else if (state.scenes.has(map)) state.scenes.delete(map);
            else state.scenes.add(map);
            renderState();
        });
    });
}

function prepareAlerts(preview, schemeIndex) {
    const rows = [...preview.querySelectorAll('.alert-row, .compact-alert, .timeline-item')];
    rows.forEach((row, index) => {
        let button = row;
        if (row.matches('.timeline-item')) {
            button = document.createElement('button');
            button.type = 'button';
            button.className = 'timeline-button';
            button.innerHTML = row.innerHTML;
            row.replaceChildren(button);
        }
        if (row.matches('.compact-alert')) {
            const wrapper = document.createElement('div');
            row.replaceWith(wrapper);
            wrapper.append(row);
        }
        const time = button.querySelector('time');
        if (time) time.textContent = alerts[index].time;
        const meta = button.querySelector('small');
        if (schemeIndex === 0)
            meta.textContent = `${['封妖', '妖王', '衣冠古丘'][index]} · ${alerts[index].time}`;
        if (schemeIndex === 1) meta.textContent = ['封妖', '妖王', '衣冠古丘'][index];
        const transcript = document.createElement('p');
        transcript.className = 'alert-detail';
        transcript.id = `alert-${schemeIndex}-${index}`;
        transcript.textContent = alerts[index].text;
        transcript.hidden = true;
        button.after(transcript);
        button.setAttribute('aria-controls', transcript.id);
        button.setAttribute('aria-expanded', 'false');
        button.addEventListener('click', () => {
            transcript.hidden = !transcript.hidden;
            button.setAttribute('aria-expanded', String(!transcript.hidden));
        });
    });
    preview.querySelectorAll('.panel-link').forEach((button) => {
        button.textContent = '识别详情 ↗';
        button.addEventListener('click', () =>
            openDialog(
                '识别详情 · 示例',
                `<div class="dialog-copy"><p>最近读取 20:46:03 · 耗时 126ms</p><p>${alerts[0].text}</p><p>首次读取建立旧公告基线，之后只提醒新公告。这里展示示例内容。</p></div>`,
            ),
        );
    });
}

tabs.forEach((tab, index) => {
    const card = cards[index];
    tab.id = `scheme-tab-${index}`;
    card.id = `scheme-panel-${index}`;
    tab.setAttribute('aria-controls', card.id);
    card.setAttribute('aria-labelledby', tab.id);
    card.tabIndex = 0;
    tab.addEventListener('click', () => selectScheme(tab.dataset.scheme));
    tab.addEventListener('keydown', (event) => {
        let next;
        if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
        if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = tabs.length - 1;
        if (next === undefined) return;
        event.preventDefault();
        selectScheme(tabs[next].dataset.scheme);
        tabs[next].focus();
    });
});

previews.forEach((preview, index) => {
    preview.querySelectorAll('[data-type-toggle]').forEach((button, kindIndex) => {
        button.dataset.kind = kinds[kindIndex];
        button.setAttribute('role', 'switch');
        button.setAttribute('aria-label', `${names[kindIndex]}提醒`);
        button.addEventListener('click', () => {
            const kind = button.dataset.kind;
            if (state.enabled.has(kind)) state.enabled.delete(kind);
            else state.enabled.add(kind);
            if (!state.enabled.size) state.running = false;
            renderState();
            feedback.textContent = state.enabled.size
                ? '演示设置已更新，切换方案时会保留。'
                : '请至少开启一种提醒，才能开始监听。';
        });
    });
    preview.querySelector('.demo-toggle').addEventListener('click', () => {
        state.running = !state.running;
        renderState();
        feedback.textContent = state.running
            ? '正在预览「监听中」状态 · 示例数据。'
            : '正在预览「已停止」状态 · 示例数据。';
    });
    preview
        .querySelectorAll('.picker-copy strong, .rail-field strong, .c-window strong')
        .forEach((label) => {
            label.dataset.windowLabel = '';
        });
    preview.querySelectorAll('.text-action').forEach((button) => {
        button.textContent = index === 0 ? '选择窗口' : '更换';
        button.addEventListener('click', () => {
            if (state.running) {
                feedback.textContent = '请先停止监听，再更换聊天窗口。';
                return;
            }
            openDialog(
                '选择独立聊天窗口 · 示例',
                `<div class="dialog-copy">${windows.map((title, option) => `<label class="window-choice"><input type="radio" name="demo-window" value="${option}" ${state.window === option ? 'checked' : ''}>${title}</label>`).join('')}<p>游戏中弹出聊天窗口后，正式页面会在这里列出可监听的窗口。</p></div>`,
            );
        });
    });
    prepareMaps(preview, index);
    prepareAlerts(preview, index);
});

document.querySelector('.timeline-caption > span').textContent = '最近提醒 · 示例';
// 时间线只展示识别结果，不能把示例描述成已发送的真实系统通知。
document.querySelector('.timeline-item .timeline-button p').textContent =
    '系统公告中识别到新的封妖消息。';
document.querySelector('.picker-copy small').textContent = '独立聊天窗口 · 示例';
document.querySelector('.c-window small').textContent = '独立聊天窗口 · 示例';
document.querySelectorAll('.task-arrow').forEach((arrow) => arrow.remove());
document.querySelector('#theme-select').addEventListener('change', (event) => {
    root.dataset.style = event.target.value;
});
document.querySelector('#dark-toggle').addEventListener('click', (event) => {
    event.currentTarget.setAttribute('aria-pressed', String(root.classList.toggle('dark')));
});
document.querySelector('#compact-toggle').addEventListener('click', (event) => {
    event.currentTarget.setAttribute('aria-pressed', String(root.classList.toggle('compact')));
});
document.querySelectorAll('.choose-button').forEach((button) => {
    button.addEventListener('click', () => {
        document.querySelector('#choice').textContent =
            `当前偏好：${button.dataset.choose}。请回到对话告诉我，选项不会自动发送。`;
        feedback.textContent = `已在页面内标记 ${button.dataset.choose}。`;
    });
});
dialog.addEventListener('change', (event) => {
    if (!event.target.matches('[name="demo-window"]')) return;
    state.window = Number(event.target.value);
    renderState();
    dialog.close();
});
dialog.querySelector('[data-close-dialog]').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => returnFocus.focus({ preventScroll: true }));

renderState();
const requestedScheme = location.hash.slice(1);
selectScheme(['a', 'b', 'c'].includes(requestedScheme) ? requestedScheme : 'a');
