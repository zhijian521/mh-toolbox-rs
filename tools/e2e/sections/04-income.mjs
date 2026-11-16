import { createIncomeTools } from './income/shared.mjs';
import runQuick from './income/quick.mjs';
import runHistory from './income/history.mjs';
import runOnline from './income/online.mjs';
import runDates from './income/dates.mjs';

export default async function run(ctx) {
    if (!ctx.want('收益')) return;
    ctx.t.section('4 收益 · 速记、连点、重载后仍在');
    const tools = createIncomeTools(ctx);
    const quick = await runQuick(ctx, tools);
    await runHistory(ctx, tools, quick);
    await runOnline(ctx);
    await runDates(ctx);
}
