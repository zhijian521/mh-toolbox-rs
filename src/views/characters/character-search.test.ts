import { describe, expect, it } from 'vitest';
import '../../services/game-data.fixture';
import { normalizeCharacter } from './roster';
import { filterCharacters } from './character-search';

const roster = [
    normalizeCharacter({ id: 'one', name: '小明', school: '五庄观', server: '北京一区' }),
    normalizeCharacter({ id: 'two', name: 'Alice', school: '普陀山', server: '浙江二区' }),
];

describe('角色搜索', () => {
    it('可按名字、门派、区服组合搜索，忽略大小写和首尾空格', () => {
        expect(filterCharacters(roster, ' 五庄 北京 ')).toEqual([roster[0]]);
        expect(filterCharacters(roster, ' ALICE ')).toEqual([roster[1]]);
        expect(filterCharacters(roster, '浙江')).toEqual([roster[1]]);
        expect(filterCharacters(roster, '小明 普陀')).toEqual([]);
        expect(filterCharacters(roster, ' ')).toEqual(roster);
    });
});
