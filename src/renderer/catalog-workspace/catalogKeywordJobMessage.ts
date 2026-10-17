import type { AutoKeywordJob } from "./useCatalogAutoKeywords";
const phases = { collecting: "正在读取目录文件列表", preparing: "正在准备图片", starting: "正在启动模型", generating: "正在生成关键词", saving: "正在保存关键词" };
export function catalogKeywordJobMessage(job: AutoKeywordJob) {
  const result = job.result;
  if (result && "succeeded" in result) return `${job.name} · ${result.status === "cancelled" ? "已取消" : result.status === "failed" ? "任务中断" : "处理完成"}：成功 ${result.succeeded}，失败 ${result.failed}，跳过 ${result.skipped}${result.total > result.processed ? `，未处理 ${result.total - result.processed}` : ""}${result.message ? ` · ${result.message}` : ""}`;
  if (result) return `${job.name} · ${result.status === "saved" ? result.added > 0 ? `已添加 ${result.added} 个关键词` : "关键词已是最新，无新增项"
    : result.status === "cancelled" ? "已取消自动添加关键词" : result.message}`;
  return `${job.batch && job.counts && job.phase !== "collecting" ? `已处理 ${job.counts.processed}/${job.counts.total} · ${job.counts.name || job.name}` : job.name} · ${job.cancelling ? "正在取消" : phases[job.phase]}`;
}
