import type { ReadonlyCharacter } from './character';
import { hasGearDetail } from './gear';

/** 导出组件只接收可分享的字段，个人备注和内部编号也不进入截图 DOM。 */
export function characterShare(character: ReadonlyCharacter): ReadonlyCharacter {
    const { name, level, school, server, attrGroups, experience, skills, assists, trainings } =
        character;
    return {
        id: 'share',
        name,
        level,
        school,
        server,
        guild: '',
        attrGroups,
        experience,
        skills,
        assists,
        trainings,
        gearMeta: character.gearMeta,
        gear: character.gear.flatMap(({ slot, caption, detail }) => {
            const shared = detail && { ...detail, note: undefined };
            return caption || hasGearDetail(shared) ? [{ slot, caption, detail: shared }] : [];
        }),
        pets: character.pets.map((pet) => ({ ...pet, warehouseId: undefined, innerPills: [] })),
    };
}
