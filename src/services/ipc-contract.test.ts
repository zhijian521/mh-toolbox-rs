import { describe, expect, it } from 'vitest';
import libSource from '../../src-tauri/src/lib.rs?raw';

/**
 * IPC 契约：前端 `invoke('xxx')` 与 Rust `generate_handler![...]` **逐条对账**。
 *
 * ---- 为什么需要这一条 ----
 *
 * 这条边界是**手抄两遍**的：前端在 `services/desktop.ts` 与 `services/ghost.ts` 里写字面量，
 * Rust 在 `lib.rs` 的两张表里再列一遍。`vue-tsc` 看不见字符串，`vitest` 里所有调用点都是
 * mock，`cargo test` 只测函数不管注册。于是「一端改了名」这件事，**三层测试全绿**，
 * 只有用户点下去那一刻才抛 `command not found`——而且丢的是那次操作的账。
 *
 * 这里是唯一能在提交前抓住它的地方，代价是读两个源码文件、跑几个正则。
 *
 * ---- 为什么读源码而不是跑真 IPC ----
 *
 * 跑真 IPC 要么起窗口（e2e 已经在做），要么 mock 掉整层 `__TAURI_INTERNALS__`（那就只验了
 * 自己的 mock）。这里要的是**静态一致性**：两个清单是不是同一个集合，跟运行时无关。
 *
 * `?raw` 而不是 `node:fs`：tsconfig 的 `types` 只有 `vite/client`，没有 node 类型；
 * 走 Vite 的 raw 导入既不用加依赖，也让这份测试与其它测试共用同一个编译管线。
 */

/** Rust 里 `#[cfg(...)]` 那张表的标记，用来把两张表分开。 */
interface HandlerTable {
    /** `#[cfg(windows)]` / `#[cfg(not(windows))]`，看注释也看真身。 */
    label: string;
    commands: string[];
}

/**
 * 从 `lib.rs` 抽 `generate_handler![...]` 的表。
 *
 * 三个细节都不是多余的：
 * 1. **先去注释**：表里的注释里有 `store::` 这类字样，不去会被当成命令名；
 * 2. **取最后一段**：`store::prices_load` 注册出来的命令名是 `prices_load`，
 *    `tauri` 按函数名而非模块路径注册；
 * 3. **往回找 `cfg`**：两张表长得一模一样，只有上方那一行 `#[cfg(not(windows))]` 能区分。
 */
function handlerTables(source: string): HandlerTable[] {
    const tables: HandlerTable[] = [];
    const pattern = /generate_handler!\s*\[([\s\S]*?)\]/g;
    for (const match of source.matchAll(pattern)) {
        const body = match[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
        const commands = body
            .split(',')
            .map((one) => one.trim())
            .filter(Boolean)
            .map((one) => one.split('::').pop()?.trim() ?? '');
        /* 往上找 400 字足够覆盖注释与空行；再远就不是这张表的 cfg 了。 */
        const before = source.slice(Math.max(0, match.index - 400), match.index);
        const label = /#\[cfg\(not\(windows\)\)\]/.test(before)
            ? 'not-windows'
            : /#\[cfg\(windows\)\]/.test(before)
              ? 'windows'
              : '未标注';
        tables.push({ label, commands });
    }
    return tables;
}

/**
 * 前端真正的调用点：`src` 下所有 `.ts` / `.vue` 里 `invoke('...')` 的字面量。
 *
 * `import.meta.glob` 而不是写死两个文件：将来谁在别处直接 `invoke`（绕过 services 边界），
 * 这一条会立刻把它算进来，而不是漏掉。eslint 只拦得住 `@tauri-apps/*` 的 **import**，
 * 拦不住「从 service 里转手拿 invoke」。
 *
 * 测试文件一律跳过：这份测试自己的正则与说明文字里就有 `invoke('…')` 的形状。
 */
function sources(): Record<string, string> {
    const modules = import.meta.glob('../**/*.{ts,vue}', {
        query: '?raw',
        import: 'default',
        eager: true,
    }) as Record<string, string>;
    return Object.fromEntries(Object.entries(modules).filter(([file]) => !file.includes('.test.')));
}

function frontendInvokes(): { file: string; command: string }[] {
    const found: { file: string; command: string }[] = [];
    for (const [file, source] of Object.entries(sources())) {
        for (const match of source.matchAll(/invoke(?:<[^>]*>)?\(\s*(['"])([a-z0-9_]+)\1/g)) {
            found.push({ file, command: match[2] });
        }
    }
    return found;
}

const tables = handlerTables(libSource);
const windows = tables.find((one) => one.label === 'windows');
const other = tables.find((one) => one.label === 'not-windows');
const invokes = frontendInvokes();
const called = new Set(invokes.map((one) => one.command));

describe('IPC 契约：前端调用与 Rust 注册', () => {
    it('能解析出两张命令表（结构变了要来这里改）', () => {
        /* 两份是刻意的（`lib.rs` 里写着理由）：加命令必须两份都加，否则非 Windows 平台
         * 静默少一条。这条断言先保证解析本身没失效——下面几条都建立在它上面。 */
        expect(tables.map((one) => one.label).sort()).toEqual(['not-windows', 'windows']);
        expect(windows?.commands.length).toBeGreaterThan(10);
    });

    it('前端调用的每条命令都注册了', () => {
        const missing = [...called].filter((name) => !windows?.commands.includes(name));
        expect(missing, `这些 invoke 在 generate_handler! 里找不到：${missing.join(', ')}`).toEqual(
            [],
        );
    });

    it('注册的每条命令都有前端调用（不留僵尸命令）', () => {
        const unused = (windows?.commands ?? []).filter((name) => !called.has(name));
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

    it('每条 invoke 都写字面量（写变量名的调用会被这条测试漏掉）', () => {
        /* 上面对账靠正则抓字面量。如果哪天写出 `invoke(name)`，正则抓不到、命令集合里
         * 少了它却不会报错——那才是最坏的假绿。所以这里数一遍 `invoke(` 的个数。
         * `import { invoke }` 不在这两个计数的形状里（后面跟的是 `}`），不必扣。 */
        for (const [file, source] of Object.entries(sources())) {
            const calls = (source.match(/\binvoke\s*[<(]/g) ?? []).length;
            const literals = (source.match(/invoke(?:<[^>]*>)?\(\s*(['"])[a-z0-9_]+\1/g) ?? [])
                .length;
            expect(calls, `${file} 里有 invoke 不是字面量命令名`).toBe(literals);
        }
    });
});
