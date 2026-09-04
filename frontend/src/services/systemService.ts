import { callService } from './backend'

/**
 * 获取应用版本号（编译期嵌入，来自后端 SystemService.GetAppVersion）。
 * 后端未就绪或获取失败时返回空字符串，由调用方决定兜底展示。
 */
export async function getAppVersion(): Promise<string> {
  const version = await callService<string>('SystemService', 'GetAppVersion')
  return version || ''
}
