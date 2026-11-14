/** 闹钟仅存本机；手动改动写入成功后才更新共享状态，读取失败时拒绝覆盖。 */
import { readonly, ref } from 'vue';
import { readLocalData, writeLocalData } from '../../services/local-data';
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
let loadFailed = false;

function sortAlarms(list: Alarm[]): Alarm[] {
    /* 按时刻升序，同一时刻按 id。停用的不往后挪：一条「已停用」的 07:30 停在中间，
     * 比它掉到队尾更好找——用户想找的往往是刚关掉的那一个。 */
    return [...list].sort(
        (left, right) => left.time.localeCompare(right.time) || left.id - right.id,
    );
}

function ensureLoaded() {
    if (loaded) return;
    loaded = true;
    const stored = readLocalData(STORAGE_KEY, (raw) => {
        if (!Array.isArray(raw)) throw new TypeError('闹钟不是数组');
        const list = raw.map(readAlarm);
        if (list.some((alarm) => !alarm)) throw new TypeError('闹钟记录损坏');
        const result = list as Alarm[];
        let nextId = Math.max(0, ...result.map((alarm) => alarm.id)) + 1;
        for (const alarm of result) if (!alarm.id) alarm.id = nextId++;
        if (new Set(result.map((alarm) => alarm.id)).size !== result.length) {
            throw new TypeError('闹钟编号重复');
        }
        return sortAlarms(result).slice(0, MAX_ALARMS);
    });
    if (!stored.ok) {
        loadFailed = true;
        error.value = stored.error;
        return;
    }
    alarms.value = stored.value ?? [];
}

function write(next: Alarm[]): AlarmResult {
    if (loadFailed) return { ok: false, error: error.value };
    try {
        writeLocalData(STORAGE_KEY, next);
        alarms.value = next;
        error.value = '';
        return { ok: true, error: '' };
    } catch (cause) {
        console.error('闹钟写入失败', cause);
        error.value = '闹钟没存下来，请重试或检查存储空间';
        return { ok: false, error: error.value };
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
        return write(sortAlarms([...alarms.value, alarm]));
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
        return write(sortAlarms(alarms.value.map((one) => (one.id === id ? next : one))));
    }

    function remove(id: number): AlarmResult {
        const before = alarms.value.length;
        const next = alarms.value.filter((one) => one.id !== id);
        if (next.length === before) {
            return { ok: false, error: '这个闹钟已经不在了，刷新一下看看' };
        }
        return write(next);
    }

    /** 开 / 关。关掉不写 `fired`：再打开时若今天还没响过，它照样该响。 */
    function setEnabled(id: number, enabled: boolean): AlarmResult {
        if (!alarms.value.some((one) => one.id === id)) {
            return { ok: false, error: '这个闹钟已经不在了' };
        }
        return write(alarms.value.map((one) => (one.id === id ? { ...one, enabled } : one)));
    }

    /**
     * 记下「这一次已经提醒过了」。
     *
     * `key` 是**哪一次的键**（`<日期> <时刻>`），不是日期：`每小时` 一天要响 24 次，
     * 记日期的话第二次起就再也不响。旧的一次性模式同样适用——它们的键里日期不同、
     * 时刻固定，判重逻辑不必分叉。
     */
    function markFired(id: number, key: string) {
        const next = alarms.value.map((one) => (one.id === id ? { ...one, fired: key } : one));
        // 保存失败也记住本次已提醒，避免运行中反复弹同一个提醒。
        if (!write(next).ok) alarms.value = next;
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
