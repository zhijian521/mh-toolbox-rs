import { describe, expect, it } from 'vitest';
import libSource from '../../src-tauri/src/lib.rs?raw';
import bindingsSource from './bindings.ts?raw';

/**
 * IPC 契约：Rust 的命令表、生成出来的 `bindings.ts`、前端的实际调用点，三者**逐条对账**。
 *
 * ---- 这条测试为什么存在 ----
 *
 * 命令名这条边界原来是**手抄两遍**的：前端在 `services/desktop.ts` 里写字面量，
 * Rust 在 `lib.rs` 的 `generate_handler!` 里再列一遍。`vue-tsc` 看不见字符串，
 * `vitest` 里所有调用点都是 mock，`cargo test` 只测函数不管注册——于是「一端改了名」
 * 三层全绿，只有用户点下去那一刻才抛 `command not found`，丢的是那次操作的账。
 *
 * 第 121 批换成 `tauri-specta` 之后，名字只剩**一处真源**（Rust 的命令函数）：
 * 前端调的是生成的 `commands.xxx()`，写错名字 `vue-tsc` 当场红。剩下两个缺口才归这里：
 *
 * 1. **生成物落后**。`bindings.ts` 是 debug 启动时重写的，改了 Rust 却没起过窗口，
 *    文件就停在上一版——类型对得上、调下去 command not found，正是最难查的那种。
 * 2. **加命令只加一张表**。两张表按平台分（`ghost::*` 只在 Windows），本机全是 Windows，
 *    另一份少一条永远看不见。
 *
 * ---- 为什么读源码而不是跑真 IPC ----
 *
 * 跑真 IPC 要么起窗口（e2e 已经在做），要么 mock 掉整层 `__TAURI_INTERNALS__`（那就只验了
 * 自己的 mock）。这里要的是**静态一致性**：三份清单是不是同一个集合，与运行时无关。
 *
 * `?raw` 而不是 `node:fs`：tsconfig 的 `types` 只有 `vite/client`，没有 node 类型；
 * 走 Vite 的 raw 导入既不用加依赖，也让这份测试与其它测试共用同一个编译管线。
 */

interface CommandTable {
    /** `#[cfg(windows)]` / `#[cfg(not(windows))]`，看注释也看真身。 */
    label: string;
    commands: string[];
}

/**
 * 从 `lib.rs` 抽 `collect_commands![...]` 的表。
 *
 * 三个细节都不是多余的：
 * 1. **先去注释**：表里的注释里有 `store::` 这类字样，不去会被当成命令名；
 * 2. **取最后一段**：`store::prices_load` 注册出来的命令名是 `prices_load`，
 *    `tauri` 按函数名而非模块路径注册，`bindings.ts` 里也是这个名字；
 * 3. **往回找 `cfg`**：两张表长得一模一样，只有上方那几行 `#[cfg(not(windows))]` 能区分。
 */
function commandTables(source: string): CommandTable[] {
    const tables: CommandTable[] = [];
    const pattern = /collect_commands!\s*\[([\s\S]*?)\]/g;
    for (const match of source.matchAll(pattern)) {
        const body = match[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
        const commands = body
            .split(',')
            .map((one) => one.trim())
            .filter(Boolean)
            .map((one) => one.split('::').pop()?.trim() ?? '');
        /* 往上找 600 字足够覆盖注释与空行；再远就不是这张表的 cfg 了。 */
        const before = source.slice(Math.max(0, match.index - 600), match.index);
        const label = /#\[cfg\(not\(windows\)\)\]/.test(before)
            ? 'not-windows'
            : /#\[cfg\(windows\)\]/.test(before)
              ? 'windows'
              : '未标注';
        tables.push({ label, commands });
    }
    return tables;
}

/** 生成物里每条命令真正发出去的 IPC 名：`__TAURI_INVOKE<T>("prices_load", …)`。 */
function generatedCommands(source: string): string[] {
    const names: string[] = [];
    for (const match of source.matchAll(/__TAURI_INVOKE<[^(]*\(\s*"([a-z0-9_]+)"/g)) {
        names.push(match[1]);
    }
    return names;
}

/**
 * 前端真正的调用点：`commands.xxx(` 出现在哪些文件里。
 *
 * `import.meta.glob` 而不是写死几个文件：将来谁绕开 `services/desktop.ts` 直接调 `commands`，
 * 这条会把它算进来。`bindings.ts` 自己排除——那里的 `commands` 就是定义处。
 *
 * 测试文件一律跳过：这份测试自己的正则与说明文字里就有 `commands.xxx(` 的形状。
 */
function sources(): Record<string, string> {
    const modules = import.meta.glob('../**/*.{ts,vue}', {
        query: '?raw',
        import: 'default',
        eager: true,
    }) as Record<string, string>;
    return Object.fromEntries(
        Object.entries(modules).filter(
            ([file]) => !file.includes('.test.') && !file.endsWith('services/bindings.ts'),
        ),
    );
}

/** `prices_load` → `pricesLoad`。`tauri-specta` 用的是同一套 camelCase 规则。 */
const accessorOf = (command: string) =>
    command.replace(/_([a-z0-9])/g, (_, one) => one.toUpperCase());

const tables = commandTables(libSource);
const windows = tables.find((one) => one.label === 'windows');
const other = tables.find((one) => one.label === 'not-windows');
const generated = new Set(generatedCommands(bindingsSource));

const called = new Set<string>();
for (const source of Object.values(sources())) {
    for (const match of source.matchAll(/\bcommands\.([a-zA-Z0-9]+)\s*\(/g)) {
        called.add(match[1]);
    }
}

describe('IPC 契约：Rust 注册 → 生成物 → 前端调用', () => {
    it('能解析出两张命令表（结构变了要来这里改）', () => {
        /* 两份是刻意的（`lib.rs` 里写着理由）：加命令必须两份都加，否则非 Windows 平台
         * 静默少一条。这条断言先保证解析本身没失效——下面几条都建立在它上面。 */
        expect(tables.map((one) => one.label).sort()).toEqual(['not-windows', 'windows']);
        expect(windows?.commands.length).toBeGreaterThan(10);
    });

    it('生成物没有落后：每条注册的命令都在 bindings.ts 里', () => {
        /* 这一条替代了原先「前端 invoke 字面量 vs generate_handler!」的对账。
         * 漏的情形很具体：改了 Rust、没起过窗口（生成只在 debug 启动时发生），
         * 于是类型看着对、调下去 command not found。 */
        const missing = (windows?.commands ?? []).filter((name) => !generated.has(name));
        expect(
            missing,
            `这些命令 Rust 注册了但 bindings.ts 里没有（起一次 debug 窗口就会重新生成）：${missing.join(', ')}`,
        ).toEqual([]);
    });

    it('生成物里没有多余命令：Rust 已经删掉的，bindings.ts 也要跟着删', () => {
        const stale = [...generated].filter((name) => !(windows?.commands ?? []).includes(name));
        expect(stale, `bindings.ts 里这些命令 Rust 已经没有了：${stale.join(', ')}`).toEqual([]);
    });

    it('每条命令都有前端调用（不留僵尸命令）', () => {
        const unused = (windows?.commands ?? [])
            .map(accessorOf)
            .filter((name) => !called.has(name));
        expect(
            unused,
            `这些命令注册了但前端没人调：${unused.join(', ')}（删掉，或补调用点）`,
        ).toEqual([]);
    });

    it('两张平台表只差 ghost 两条', () => {
        /* 这条是「加命令必须两份都加」的机器守卫。少加一条时本机完全看不出来
         * ——开发机全是 Windows，非 Windows 那份只有真到那个平台上才炸。 */
        const gap = (windows?.commands ?? []).filter(
            (name) => !(other?.commands ?? []).includes(name),
        );
        expect(gap.sort(), '两张表多出来的只该是 Windows 专属的捉鬼命令').toEqual([
            'ghost_probe',
            'ghost_windows',
        ]);
    });

    it('同一张表里没有重复注册', () => {
        for (const table of tables) {
            const seen = new Set<string>();
            const dup = table.commands.filter((name) => {
                if (seen.has(name)) return true;
                seen.add(name);
                return false;
            });
            expect(dup, `${table.label} 表里重复：${dup.join(', ')}`).toEqual([]);
        }
    });

    it('前端不再有裸 invoke：命令只能经由 bindings.ts 出去', () => {
        /* 生成物的全部价值就在这一条上。谁在别处写 `invoke('prices_load')`，
         * 就等于把那处手抄又加回来了——名字改了它不会红。
         *
         * 先去掉注释再判：`desktop.ts` 的注释里就写着「原先这里逐个手写
         * `invoke<T>('prices_load')`」，那是解释不是调用。 */
        for (const [file, source] of Object.entries(sources())) {
            const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
            expect(code, `${file} 里还在直接调 invoke，改为 commands.xxx()`).not.toMatch(
                /\binvoke\s*[<(]/,
            );
        }
    });
});
