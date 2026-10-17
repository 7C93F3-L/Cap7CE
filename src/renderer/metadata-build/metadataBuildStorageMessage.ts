import type { MetadataDirectoryStorageError } from "../../shared/metadataBuildTypes";

export function metadataBuildStorageMessage(error?: MetadataDirectoryStorageError) {
  const action = error?.operation === "read" ? "读取" : "保存";
  if (error?.code === "INVALID_STATE") return "任务记录格式异常，已有属性不受影响。请保留诊断信息后重试。";
  if (error?.code === "EACCES" || error?.code === "EPERM") return `系统拒绝${action}任务配置，请检查文件占用或访问限制。已有属性不受影响。`;
  if (error?.code === "EBUSY") return "任务配置正被占用，请关闭占用它的程序后重试。";
  if (error?.code === "ENOSPC" || error?.code === "EDQUOT") return "无法保存任务配置：配置所在磁盘的可用空间或配额不足。";
  if (error?.code === "ENOTDIR" || error?.code === "EISDIR") return "任务配置位置异常，请检查诊断信息后重试。";
  return `任务配置${action}失败，已有属性不受影响。可以重试；若再次失败，请查看诊断日志。`;
}
