/**
 * 自绘文件选择模态（FilePickerDialog）的后端能力封装。
 *
 * 目录浏览 / 文件校验均为「元数据级」操作：只返回路径、大小与扩展名，
 * 不读取任何文件内容；文件内容由各业务（模板导入、简历解析、头像读取）
 * 通过各自的服务方法按路径获取。
 */

import { callService, isWails } from './backend'

export interface FileStat {
  path: string
  name: string
  size: number
  ext: string
  /** 扩展名是否命中调用方给定的 accept 列表 */
  matched: boolean
}

export interface DirectoryEntry {
  name: string
  path: string
  isDir: boolean
  size: number
  ext: string
}

export interface FileBrowserRoot {
  /** 快捷位置标识：computer / home / desktop / downloads / dataDir */
  key: string
  path: string
}

export interface DirectoryListing {
  path: string
  parent: string
  roots: FileBrowserRoot[]
  entries: DirectoryEntry[]
  truncated: boolean
}

/** 枚举目录（空路径 = 用户主目录）；只返回目录与扩展名命中 accept 的文件。 */
export async function listDirectory(path: string, accept: string[]): Promise<DirectoryListing | null> {
  if (!isWails()) return null
  return callService<DirectoryListing>('SystemService', 'ListDirectory', path, accept)
}

/** 校验并返回一个待选用文件的基本信息（accept 为允许扩展名，maxBytes 为体积上限）。 */
export async function statFile(path: string, accept: string[], maxBytes?: number): Promise<FileStat | null> {
  if (!isWails()) return null
  return callService<FileStat>('SystemService', 'StatFile', path, accept, maxBytes ?? 0)
}
