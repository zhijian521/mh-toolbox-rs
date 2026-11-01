import { describe, expect, it } from 'vitest';
import mapsFile from '../../public/maps/maps.json';
import type { GhostMap } from './ghost-maps';
import { parseGhostTasks, type ParsedTask } from './ghost-parse';
import {
    absorbFrame,
    CONFIRM_FRAMES,
    createHold,
    heldTasks,
    holdAges,
    isSettling,
    scoreTask,
} from './ghost-hold';

/**
 * 「保留最佳」的回归测试。
 *
 * 这一层的错法全是**时序**的：单看某一帧永远是对的，只有连着看几帧才知道它会不会
 * 闪。所以这里每条用例都喂一串帧，断言的也是「连看三帧之后画面还是不是原来那样」。
 *
 * 三条底线：
 * 1. 糊掉、被挡住、整行没读到 —— 一律不许改画面；
 * 2. 更完整的一帧、换了图、开了天眼 —— 必须立刻生效，别让用户等；
 * 3. 真的换了任务 —— 三帧之内必须换过来（「保留」不等于「永不更新」）。
 */
const maps: GhostMap[] = mapsFile.maps;

/** 一帧识别结果。只关心 `text`，其余字段照 `OcrLine` 的形状填。 */
function frame(...texts: string[]): ParsedTask[] {
    const lines = texts.map((text, index) => ({
        text,
        x: 0,
        y: index * 14,
        width: 260,
        height: 13,
        score: 1,
    }));
    return parseGhostTasks(lines, maps).tasks;
}

/** 一步一秒地推进，和 `POLL_MS` 同一个量级，年龄才读得出整数。 */
const STEP = 1000;

describe('scoreTask', () => {
    it('缺哪一段就低一档：读全 > 缺句尾 > 坐标读没了 > 连地名都没对上', () => {
        const full = frame('钟馗抓鬼（第1个）：去江南野外134,54附近')[0];
        const noTail = frame('钟馗抓鬼（第1个）：去江南野外134,54')[0];
        const lostCoords = frame('钟馗抓鬼（第1个）：去江南野外0,0附近')[0];
        const noMap = frame('钟馗抓鬼（第1个）：去莫名其妙的地方134,54附近')[0];

        expect(scoreTask(full)).toBe(7);
        expect(scoreTask(noTail)).toBe(5);
        // 关键：丢了坐标的一帧**不许**高过只丢句尾的一帧，否则「0,0」会顶掉真坐标。
        expect(scoreTask(lostCoords)).toBe(3);
        expect(scoreTask(noMap)).toBe(0);
    });
});

describe('absorbFrame', () => {
    it('被挡住的那几帧顶不掉读全的那帧', () => {
        const hold = createHold();
        absorbFrame(hold, frame('钟馗抓鬼（第1个）：去江南野外134,54附近'), STEP);
        // 第二帧坐标被挡住（读成 0,0），第三帧句尾被挡住（「附近」没了）。
        absorbFrame(hold, frame('钟馗抓鬼（第1个）：去江南野外0,0附近'), STEP * 2);
        absorbFrame(hold, frame('钟馗抓鬼（第1个）：去江南野外134,54'), STEP * 3);

        expect(heldTasks(hold)).toHaveLength(1);
        expect(heldTasks(hold)[0]).toMatchObject({ x: 134, y: 54, reveal: 'nearby' });
        // 结果没被刷新，年龄如实往上走——标出来比假装它还新、或者直接抹掉都诚实。
        expect(holdAges(hold, STEP * 3).small).toBe(2);
    });

    it('整行没读到（被挡住、任务栏在滚）不改动画面，也不清空', () => {
        const hold = createHold();
        absorbFrame(hold, frame('钟馗抓鬼（第1个）：去江南野外134,54附近'), STEP);
        absorbFrame(hold, frame('捉鬼'), STEP * 2);

        expect(heldTasks(hold)).toHaveLength(1);
        expect(holdAges(hold, STEP * 2).small).toBe(1);
    });

    it('坐标读没了的一帧，顶不掉只缺句尾的那一帧', () => {
        // 权重排错就会在这里翻车：`0,0附近` 带着句尾，若「句尾」比「坐标」重，
        // 它会拿到比「只有坐标、没有句尾」更高分，画面当场从真坐标跳成「识别失败」。
        const hold = createHold();
        absorbFrame(hold, frame('钟馗抓鬼（第1个）：去江南野外134,54'), STEP);
        absorbFrame(hold, frame('钟馗抓鬼（第1个）：去江南野外0,0附近'), STEP * 2);

        expect(heldTasks(hold)[0]).toMatchObject({ x: 134, y: 54, reveal: 'unknown' });
    });

    it('丢了「处」不会把精确点闪回成范围框', () => {
        const hold = createHold();
        absorbFrame(hold, frame('钟馗抓鬼（第1个）：去江南野外134,54处'), STEP);
        expect(heldTasks(hold)[0].reveal).toBe('exact');

        // 同一张图、同一个坐标，只是末字没读到。它比读全的那一帧少一段信息，
        // 所以喂多少帧都不该生效——「附近」这两个字是最容易糊的，让它生效
        // 地图就会在「一个点」和「一大片框」之间来回跳。
        for (let i = 1; i <= 5; i += 1) {
            absorbFrame(hold, frame('钟馗抓鬼（第1个）：去江南野外134,54'), STEP * (i + 1));
            expect(heldTasks(hold)[0].reveal).toBe('exact');
        }
    });

    it('真的要退回范围（「处」→「附近」）时，连稳三帧才换', () => {
        const hold = createHold();
        absorbFrame(hold, frame('钟馗抓鬼（第1个）：去江南野外134,54处'), STEP);
        // 两帧一样完整，只是天眼失效了——这不是遮挡，但也没必要一帧就改画面。
        for (let i = 1; i < CONFIRM_FRAMES; i += 1) {
            absorbFrame(hold, frame('钟馗抓鬼（第1个）：去江南野外134,54附近'), STEP * (i + 1));
            expect(heldTasks(hold)[0].reveal).toBe('exact');
        }
        absorbFrame(hold, frame('钟馗抓鬼（第1个）：去江南野外134,54附近'), STEP * 4);
        expect(heldTasks(hold)[0].reveal).toBe('nearby');
    });

    it('开了天眼：同图同坐标 nearby → exact 立刻生效', () => {
        const hold = createHold();
        absorbFrame(hold, frame('钟馗抓鬼（第1个）：去江南野外134,54附近'), STEP);
        absorbFrame(hold, frame('钟馗抓鬼（第1个）：去江南野外134,54处'), STEP * 2);

        expect(heldTasks(hold)[0].reveal).toBe('exact');
        expect(isSettling(hold)).toBe(false);
    });

    it('换了图就是换了任务，立刻换过去——不等三帧', () => {
        const hold = createHold();
        absorbFrame(hold, frame('钟馗抓鬼（第5个）：去江南野外134,54附近'), STEP);
        absorbFrame(hold, frame('钟馗抓鬼（第1个）：去建邺城204,107附近'), STEP * 2);

        expect(heldTasks(hold)[0]).toMatchObject({ mapText: '建邺城', x: 204, y: 107 });
    });

    it('同一张图、序号没变，坐标却变了 —— 认定是误读，多少帧都不换', () => {
        const hold = createHold();
        absorbFrame(hold, frame('钟馗抓鬼（第1个）：去江南野外134,54附近'), STEP);
        // 这两帧是被挡出来的错读（54 → 84），一帧一帧看都「合法」。
        // 人站在任务栏前面不走，这种错读能连着十几帧都一样——所以不靠帧数兜，
        // 靠「同一件事的坐标不会变」这条硬约束否决。
        for (let i = 2; i <= 8; i += 1) {
            absorbFrame(hold, frame('钟馗抓鬼（第1个）：去江南野外134,84附近'), STEP * i);
            expect(heldTasks(hold)[0].y).toBe(54);
        }
        // 否决归否决，年龄照样涨——「这条最近没读到」必须说实话。
        expect(holdAges(hold, STEP * 8).small).toBe(7);
    });

    it('同一张图换了序号 = 换了任务，连稳三帧后换过去', () => {
        const hold = createHold();
        absorbFrame(hold, frame('钟馗抓鬼（第1个）：去江南野外134,54附近'), STEP);
        const next = '钟馗抓鬼（第2个）：去江南野外134,84附近';
        // 前两帧先按兵不动：换任务也不该在 1.1 秒内跳一次。
        for (let i = 2; i <= CONFIRM_FRAMES; i += 1) {
            absorbFrame(hold, frame(next), STEP * i);
            expect(heldTasks(hold)[0].y).toBe(54);
        }
        absorbFrame(hold, frame(next), STEP * (CONFIRM_FRAMES + 1));
        expect(heldTasks(hold)[0]).toMatchObject({ index: 2, x: 134, y: 84 });
    });

    it('序号那一位没读到时，退回三帧确认', () => {
        const hold = createHold();
        absorbFrame(hold, frame('钟馗抓鬼（第1个）：去江南野外134,54附近'), STEP);
        // 「第个」：序号那一位整个被吃掉。这时候分不清是「换了任务」还是
        // 「认错一位」，硬判就会在两种错之间二选一，只能交给帧数去分。
        const blind = '钟馗抓鬼（第个）：去江南野外134,84附近';
        for (let i = 2; i <= CONFIRM_FRAMES; i += 1) {
            absorbFrame(hold, frame(blind), STEP * i);
            expect(heldTasks(hold)[0].y).toBe(54);
        }
        absorbFrame(hold, frame(blind), STEP * (CONFIRM_FRAMES + 1));
        expect(heldTasks(hold)[0].y).toBe(84);
    });

    it('待定中途读回原样，计数从头数起（半途中断的连续不算连续）', () => {
        const hold = createHold();
        const clean = '钟馗抓鬼（第1个）：去江南野外134,54附近';
        // 序号也变了，否则会被「同一件事坐标不变」直接否决，测不到计数逻辑。
        const dirty = '钟馗抓鬼（第2个）：去江南野外134,84附近';

        absorbFrame(hold, frame(clean), STEP);
        absorbFrame(hold, frame(dirty), STEP * 2);
        absorbFrame(hold, frame(dirty), STEP * 3);
        absorbFrame(hold, frame(clean), STEP * 4);
        absorbFrame(hold, frame(dirty), STEP * 5);
        absorbFrame(hold, frame(dirty), STEP * 6);
        // 中间夹着一帧干净的，那两帧的「连续」就作废了。
        expect(heldTasks(hold)[0].y).toBe(54);
    });

    it('同一张图的两种写法不算「内容变了」——不待定、也不涨年龄', () => {
        const hold = createHold();
        absorbFrame(hold, frame('降服千年厉鬼（第1个）：去腕孑山的36，145附近'), STEP);
        absorbFrame(hold, frame('降服千年厉鬼（第1个）：去碗孑山的36，145附近'), STEP * 2);

        expect(isSettling(hold)).toBe(false);
        expect(holdAges(hold, STEP * 2).big).toBe(0);
    });

    it('大小鬼各留各的：一条糊了不影响另一条', () => {
        const hold = createHold();
        absorbFrame(
            hold,
            frame(
                '钟馗抓鬼（第1个）：去江南野外134,54附近',
                '降服千年厉鬼（第1个）：去碗孑山的36，145附近',
            ),
            STEP,
        );
        // 第二帧大鬼那行整行没读到，小鬼还在。
        absorbFrame(hold, frame('钟馗抓鬼（第1个）：去江南野外134,54附近'), STEP * 2);

        expect(heldTasks(hold)).toHaveLength(2);
        expect(holdAges(hold, STEP * 2)).toEqual({ small: 0, big: 1 });
    });
});
