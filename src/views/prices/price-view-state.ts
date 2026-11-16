import { reactive, toRefs } from 'vue';
import type { PriceSort } from './prices';

/** 只记本次打开应用的浏览位置，不混入账本或导出文件。 */
const state = reactive({
    keyword: '',
    category: '',
    sub: '',
    sort: 'updated' as PriceSort,
    scroll: { top: 0 },
});

export function usePriceViewState() {
    return toRefs(state);
}
