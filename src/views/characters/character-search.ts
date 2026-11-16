import type { ReadonlyCharacter } from './character';

/** 多个搜索词按交集匹配，可以组合名字、门派与区服。 */
export function filterCharacters(roster: readonly ReadonlyCharacter[], keyword: string) {
    const terms = keyword.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return roster.filter((character) => {
        const text = [character.name, character.school, character.server].join(' ').toLowerCase();
        return terms.every((term) => text.includes(term));
    });
}
