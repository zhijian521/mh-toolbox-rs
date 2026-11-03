import { gameData, schoolSkillCap } from '../../services/game-data';
import type { SkillRow } from './character';

/**
 * 门派技能的**规则**：选了门派之后该得到哪几项、换门派时已经填过的等级怎么处理。
 *
 * 表本身（21 家 × 7 项 + 上限）已经搬去 `public/game/data/schools.json`，
 * 由 `services/game-data.ts` 在启动时取回来——**游戏给的事实进文件，我们定的算法留代码**，
 * 判据见 `docs/GAME-ASSETS.md`。
 *
 * 整份数据最初搬自旧仓 `E:\zhijian\mh-tool\src\renderer\game-data\school-skills.js`
 * （再往前是 V2 的 `docs/SCHOOL_TEMPLATES.md`）。搬过来而不是重新手打，是因为这 147 个
 * 名字没有一个是能凭印象写对的——「潇湘仙雨」「混元道果」这类，错一个字就查不到图标、
 * 也对不上游戏面板。
 *
 * 为什么门派技能与生活 / 剧情技能是**两张**表：那两张是**可练可不练**的名录，
 * 玩家从里面挑；门派技能是**选了门派就有这七项**，一一对应、顺序也固定。
 */

/** 一个门派的七项技能名；门派认不出（没选、错字、将来游戏新增）时返回 `undefined`。 */
export function schoolSkillNames(school: string): string[] | undefined {
    return gameData().schools.schools.find((entry) => entry.name === school)?.skills;
}

/**
 * 换门派时重算技能表：**按名字保留已经录过的等级**，新门派多出来的从 0 起。
 *
 * 为什么不是「整表覆盖成 0」：同一个号在游戏里换门派（转门派）之后，练过的等级
 * 大多跟着走；退一步说，即使用户只是先选错、再选对，把已填的数字清掉也是最难受的那种
 * 意外。按名字对得上就留着，对不上才归零——这条规则一句话能说清，也好验证。
 */
export function schoolSkills(school: string, previous: SkillRow[] = []): SkillRow[] {
    const names = schoolSkillNames(school);
    if (!names) return previous;
    const before = new Map(previous.map((row) => [row.name, row]));
    return names.map((name) => {
        const old = before.get(name);
        return { name, level: old?.level ?? 0, cap: schoolSkillCap(), off: old?.off };
    });
}
