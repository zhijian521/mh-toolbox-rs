import { notify } from './use-notify';

/** 业务状态可先更新，但成功回执与收表单必须等到写盘结束。 */
export async function saved(flush: () => Promise<boolean>): Promise<boolean> {
    const ok = await flush();
    if (!ok) notify.error('改动尚未保存，请重试保存');
    return ok;
}
