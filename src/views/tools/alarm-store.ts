/**
 * 闹钟的读写：一份 `localStorage` 里的清单。
 *
 * ---- 为什么不像别的页那样走 SQLite ----
 *
 * 收益、物价、名册那几份是**账**：要能被导出、要跟着库走、丢了就是丢账。闹钟不是账——
 * 它是「这台机器上、这一会儿要做的事」，几条记录、几十字节，跨设备没有意义。
 * 主题、字号、开发者模式这些本机偏好也都在 `localStorage`，闹钟和它们是同一类东西。
 *
 * 还有一条实际的考虑：写库要在 Rust 侧加命令与表，而那块地方正在被别人改。
 * 为一个「本机提醒」去动数据层，收益与风险不成比例。
 *
 * ---- 状态在模块作用域 ----
 *
 * 与 `use-theme` / `use-notify` 同一条：页面、全局计时器（`AlarmHost`）都要看同一份。
 * 放进 `setup()` 的话，闹钟页改完、计时器那份还是旧的，而**两边都不报错**。
 *
 * ---- 这里的失败只有一种 ----
 *
 * `localStorage` 写不进（隐私模式、配额满、被策略禁用）。读不到按空表处理（与
 * 「一个都没设」同一个语义）；写不进要说话——用户改完看到的还是旧值，不吭声就像在骗他。
 */
import { readonly, ref } from 'vue';
import {
    LABEL_LIMIT,
    MAX_ALARMS,
    alarmDraftError,
    alarmTime,
    readAlarm,
    type Alarm,
    type AlarmDraft,
} from './alarms';

const STORAGE_KEY = 'mh-alarms';

const alarms = ref<Alarm[]>([]);
const error = ref('');

/** 读过一轮没有。`npm run dev` 里改文件会让模块重算，重算后就回到空表——它挡住「空表把库顶掉」。 */
let loaded = false;

function sortAlarms(list: Alarm[]): Alarm[] {
    /* 按时刻升序，同一时刻按 id。停用的不往后挪：一条「已停用」的 07:30 停在中间，
     * 比它掉到队尾更好找——用户想找的往往是刚关掉的那一个。 */
    return [...list].sort(
        (left, right) => left.time.localeCompare(right.time) || left.id - right.id,
    );
}

/** 读档。认得几条算几条，坏记录丢掉。 */
function readStored(): Alarm[] {
    try {
        const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];

        const list: Alarm[] = [];
        let nextId = 1;
        for (const one of parsed) {
            const alarm = readAlarm(one);
            if (!alarm) continue;
            /* 缺 id 的老记录补一个：`readAlarm` 认不出 id 时给 0，而 0 会让
             * `remove(0)` 删掉第一条 —— 宁可补号，也不让「删一条」删错。 */
            if (!alarm.id) alarm.id = nextId;
            nextId = Math.max(nextId, alarm.id + 1);
            list.push(alarm);
        }
        return sortAlarms(list).slice(0, MAX_ALARMS);
    } catch {
        /* 解析不了（手改坏了、旧版本格式）：当作没设过。**不要清掉**那份坏数据，
         * 下次写入会整体覆盖，而在此之前用户还能自己去看看它。 */
        return [];
    }
}

function ensureLoaded() {
    if (loaded) return;
    loaded = true;
    alarms.value = readStored();
}

/** 整份写回。返回是否写进去了。 */
function write(): boolean {
    try {
        globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(alarms.value));
        error.value = '';
        return true;
    } catch (catchError) {
        console.error('闹钟写入失败', catchError);
        error.value = '闹钟没存下来，检查一下浏览器存储空间';
        return false;
    }
}

export interface AlarmResult {
    ok: boolean;
    error: string;
}

function nextId(): number {
    return alarms.value.reduce((max, one) => Math.max(max, one.id), 0) + 1;
}

/**
 * 草稿 → 落盘的字段。
 *
 * 三处一起归一：时刻按重复方式收（`hourly` 只留分钟）、星期几排序、不适用于当前模式的
 * 字段清空。分散在 `add` 与 `update` 里各写一遍的话，「改了模式但旧日子还在」这种
 * 残留会一直带到库里。
 */
function fieldsOf(draft: AlarmDraft) {
    return {
        time: alarmTime(draft.repeat, draft.time) as string,
        label: draft.label.trim().slice(0, LABEL_LIMIT),
        repeat: draft.repeat,
        weekdays: draft.repeat === 'weekly' ? [...draft.weekdays].sort((a, b) => a - b) : [],
        date: draft.repeat === 'once' ? draft.date : '',
    };
}

export function useAlarms() {
    ensureLoaded();

    /**
     * 新建。时间先归一（`7:5` → `07:05`），再校验。
     *
     * **不在这里生成 `fired`**：新闹钟还没提醒过，空串就是「没提醒过」的意思。
     */
    function add(draft: AlarmDraft): AlarmResult {
        if (alarms.value.length >= MAX_ALARMS) {
            return { ok: false, error: `最多 ${MAX_ALARMS} 个，先删掉几个` };
        }
        const problem = alarmDraftError(draft);
        if (problem) return { ok: false, error: problem };

        const alarm: Alarm = {
            id: nextId(),
            enabled: true,
            fired: '',
            ...fieldsOf(draft),
        };
        alarms.value = sortAlarms([...alarms.value, alarm]);
        write();
        return { ok: true, error: '' };
    }

    function update(id: number, draft: AlarmDraft): AlarmResult {
        const problem = alarmDraftError(draft);
        if (problem) return { ok: false, error: problem };
        const index = alarms.value.findIndex((one) => one.id === id);
        if (index < 0) return { ok: false, error: '这个闹钟已经不在了，刷新一下看看' };

        const before = alarms.value[index];
        const fields = fieldsOf(draft);
        const next: Alarm = {
            ...before,
            ...fields,
            /* 改了时刻、日子或模式，就是「另外一次」：把已提醒标记清掉，否则今天改完再也不会响。
             * 只改备注时保留它——那种改动不该让一个已经响过的闹钟今天再响一次。 */
            fired:
                before.time !== fields.time ||
                before.repeat !== fields.repeat ||
                before.date !== fields.date ||
                before.weekdays.join(',') !== fields.weekdays.join(',')
                    ? ''
                    : before.fired,
        };
        alarms.value = sortAlarms(alarms.value.map((one) => (one.id === id ? next : one)));
        write();
        return { ok: true, error: '' };
    }

    function remove(id: number): AlarmResult {
        const before = alarms.value.length;
        alarms.value = alarms.value.filter((one) => one.id !== id);
        if (alarms.value.length === before) {
            return { ok: false, error: '这个闹钟已经不在了，刷新一下看看' };
        }
        write();
        return { ok: true, error: '' };
    }

    /** 开 / 关。关掉不写 `fired`：再打开时若今天还没响过，它照样该响。 */
    function setEnabled(id: number, enabled: boolean): AlarmResult {
        alarms.value = alarms.value.map((one) => (one.id === id ? { ...one, enabled } : one));
        write();
        return { ok: true, error: '' };
    }

    /**
     * 记下「这一次已经提醒过了」。
     *
     * `key` 是**哪一次的键**（`<日期> <时刻>`），不是日期：`每小时` 一天要响 24 次，
     * 记日期的话第二次起就再也不响。旧的一次性模式同样适用——它们的键里日期不同、
     * 时刻固定，判重逻辑不必分叉。
     */
    function markFired(id: number, key: string) {
        alarms.value = alarms.value.map((one) => (one.id === id ? { ...one, fired: key } : one));
        write();
    }

    return {
        alarms: readonly(alarms),
        error: readonly(error),
        add,
        update,
        remove,
        setEnabled,
        markFired,
    };
}
