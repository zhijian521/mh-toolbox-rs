/**
 * 账本快照与还原（`tools/e2e/db.mjs`）。
 *
 * ---- 为什么 e2e 离不开它 ----
 *
 * `smoke.mjs` 打的是**真窗口、真库**：它建角色、记价、点速记。角色和物价能靠界面删掉，
 * 但「速记」那几笔是流水账，界面上一条条删等于手动做收尾。所以标准流程是：
 *
 *     node tools/e2e/db.mjs backup        # 跑测试之前
 *     start.bat --force debug             # 起窗口
 *     node tools/e2e/smoke.mjs            # 跑（它自己也会先快照一份）
 *     （关掉窗口）
 *     node tools/e2e/db.mjs restore <id> --yes
 *
 * ---- 只备份，不擅自还原 ----
 *
 * `backup` 是纯拷贝，随时可跑。`restore` 会**覆盖账本**，所以：
 *   - 应用必须完全退出（库开着时覆盖 = 把 WAL 写坏，比不还原更糟）；
 *   - 不带 `--yes` 只打印「将要覆盖哪些文件」然后退出，不动手；
 *   - 动手前先把当前状态另存成 `before-restore-<时间戳>`，覆盖本身也可以反悔。
 *
 * `mh-toolbox.db-wal` / `-shm`：SQLite 的 WAL 模式下，最新几笔可能还只在 `-wal` 里，
 * 只拷 `.db` 会丢数据。所以三个一起拷；还原时快照里没有 `-wal` 就把它删掉——
 * 留一个跟新 `.db` 对不上的 WAL 是能把库读坏的。
 */

import {
    copyFileSync,
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    rmSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';

/** 库文件四件套。`preferences.json` 里有窗口尺寸一类的东西，一起备份但还原时可有可无。 */
const FILES = ['mh-toolbox.db', 'mh-toolbox.db-wal', 'mh-toolbox.db-shm', 'preferences.json'];
const ROOT = '.runtime/e2e-db';

export function dataDir() {
    if (process.env.MH_E2E_DATA) return resolve(process.env.MH_E2E_DATA);
    const roaming = process.env.APPDATA;
    if (!roaming) throw new Error('没有 APPDATA，请用 MH_E2E_DATA 指定数据目录');
    return join(roaming, 'mh-tool-rs');
}

const stamp = () => {
    const d = new Date();
    const pad = (n, w = 2) => String(n).padStart(w, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
};

const sizeOf = (path) => {
    try {
        return statSync(path).size;
    } catch {
        return 0;
    }
};

/** 把数据目录里那四件拷到 `<ROOT>/<id>/`。返回快照信息（含 id 与大小）。 */
export function snapshot(source = dataDir(), { id = stamp(), label = 'e2e' } = {}) {
    const dir = resolve(ROOT, `${label}-${id}`);
    mkdirSync(dir, { recursive: true });

    const copied = [];
    for (const name of FILES) {
        const from = join(source, name);
        if (!existsSync(from)) continue;
        copyFileSync(from, join(dir, name));
        copied.push({ name, bytes: sizeOf(from) });
    }
    if (!copied.some((one) => one.name === 'mh-toolbox.db')) {
        throw new Error(`${source} 下没有 mh-toolbox.db（应用还没跑过？数据目录对不对？）`);
    }

    const manifest = {
        id,
        label,
        source,
        takenAt: new Date().toISOString(),
        files: copied,
        note: '拷贝时应用可能还开着；还原前必须先关掉窗口。',
    };
    writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    return { dir, ...manifest };
}

export function listSnapshots() {
    if (!existsSync(ROOT)) return [];
    return readdirSync(ROOT)
        .filter((name) => existsSync(join(ROOT, name, 'manifest.json')))
        .map((name) => {
            const dir = resolve(ROOT, name);
            const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
            const db = manifest.files.find((f) => f.name === 'mh-toolbox.db');
            return {
                dir,
                id: manifest.id,
                label: manifest.label,
                takenAt: manifest.takenAt,
                dbBytes: db?.bytes ?? 0,
            };
        })
        .sort((a, b) => b.takenAt.localeCompare(a.takenAt));
}

/** 应用是否还在跑：先看进程，再看调试端口。两个都要看——只开端口判断会被代理层骗。 */
export async function appRunning() {
    let processAlive = false;
    try {
        const out = execFileSync(
            'tasklist',
            ['/fi', 'IMAGENAME eq mh-toolbox-rs.exe', '/nh', '/fo', 'csv'],
            {
                encoding: 'utf8',
            },
        );
        processAlive = out.includes('mh-toolbox-rs.exe');
    } catch {
        /* tasklist 都跑不了就不下结论，交给端口那条。 */
    }
    let portAlive = false;
    try {
        const res = await fetch(
            `http://127.0.0.1:${process.env.MH_E2E_PORT || 9222}/json/version`,
            {
                signal: AbortSignal.timeout(800),
            },
        );
        portAlive = res.ok;
    } catch {
        /* 连不上就是没开：初值已经是 false，不用再赋一次。 */
    }
    return { processAlive, portAlive, alive: processAlive || portAlive };
}

/** 按 id（或快照目录名）找一份快照。 */
export function findSnapshot(id) {
    const all = listSnapshots();
    return all.find((one) => one.id === id || one.dir.endsWith(id));
}

/**
 * 还原。调用方必须已经确认过（`--yes`）；这里只负责做事与报出改了哪些文件。
 * 返回 `{ replaced, removed, safety }`。
 */
export function restore(snap, { target = dataDir() } = {}) {
    const dir = snap.dir ?? snap;
    /* 覆盖前把现状另存一份：还原动作本身也能反悔。 */
    const safety = snapshot(target, { label: 'before-restore' });

    const replaced = [];
    const removed = [];
    for (const name of FILES) {
        const from = join(dir, name);
        const to = join(target, name);
        if (existsSync(from)) {
            copyFileSync(from, to);
            replaced.push(name);
        } else if ((name.endsWith('-wal') || name.endsWith('-shm')) && existsSync(to)) {
            rmSync(to);
            removed.push(name);
        }
    }
    return { replaced, removed, safety };
}

/* ------------------------------ 命令行入口 ------------------------------ */

const isMain = process.argv[1] && resolve(process.argv[1]).endsWith('db.mjs');

if (isMain) {
    const [action, ...rest] = process.argv.slice(2);
    const has = (flag) => rest.includes(flag);

    if (action === 'backup') {
        const snap = snapshot(dataDir());
        console.log(`已快照：${snap.dir}`);
        console.log(
            `  ${snap.files.map((f) => `${f.name} ${(f.bytes / 1024).toFixed(0)}KB`).join(' · ')}`,
        );
        console.log(`  还原：node tools/e2e/db.mjs restore ${snap.id} --yes`);
    } else if (action === 'list') {
        const all = listSnapshots();
        if (!all.length) console.log('还没有快照。先跑 node tools/e2e/db.mjs backup');
        for (const one of all) {
            console.log(
                `${one.id}  ${one.takenAt}  ${one.label}  ${(one.dbBytes / 1024).toFixed(0)}KB`,
            );
        }
    } else if (action === 'restore') {
        const id = rest.find((one) => !one.startsWith('--'));
        if (!id) {
            console.error('用法：node tools/e2e/db.mjs restore <快照id> --yes   （id 用 list 查）');
            process.exit(3);
        }
        const snap = findSnapshot(id);
        if (!snap) {
            console.error(`找不到快照：${id}`);
            process.exit(3);
        }

        const state = await appRunning();
        console.log('⚠️  这一步会用快照覆盖现在的账本，清掉跑测试期间写进去的东西。');
        console.log(`  快照：${snap.dir}（${snap.takenAt}）`);
        console.log(`  目标数据目录：${dataDir()}`);

        if (state.alive) {
            console.error(
                '\n应用还开着（' +
                    (state.processAlive ? '进程在' : '') +
                    (state.portAlive ? '调试端口在' : '') +
                    '）。',
            );
            console.error('库被占用时覆盖会把 WAL 写坏。先关掉窗口，再重跑这一条。');
            process.exit(4);
        }

        if (!has('--yes')) {
            const will = FILES.filter((name) => existsSync(join(snap.dir, name)));
            console.log('\n将要覆盖：');
            for (const name of will) console.log(`  ${join(dataDir(), name)}`);
            console.log('\n（覆盖前会先把现状另存成 before-restore-<时间戳>）');
            console.log('确认无误后加 --yes 再跑一次。');
            process.exit(3);
        }

        const outcome = restore(snap);
        console.log(`\n已覆盖：${outcome.replaced.join('、')}`);
        if (outcome.removed.length)
            console.log(`已删除（快照里没有、留着会读坏库）：${outcome.removed.join('、')}`);
        console.log(`覆盖前的现状另存在：${outcome.safety.dir}`);
    } else {
        console.log('用法：');
        console.log('  node tools/e2e/db.mjs backup            快照当前账本');
        console.log('  node tools/e2e/db.mjs list              列出快照');
        console.log('  node tools/e2e/db.mjs restore <id> --yes 还原（应用必须先关掉）');
    }
}
