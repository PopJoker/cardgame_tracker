import type { Player } from '../types/game'
import type { GameSession } from '../stores/useGameStore'

/**
 * 衝突處理決策型態 (解決 View 端 TS2305 匯出錯誤)
 */
export type ConflictAction = 'merge' | 'create' | 'rename'

export interface ConflictResolution {
    importedName?: string
    action: ConflictAction
    targetId?: string
    newName?: string
}

export interface BackupData {
    version?: string
    exportedAt?: number | string
    players: Array<{
        id?: string
        name: string
        totalGames?: number
        wins?: number
        totalScore?: number
    }>
    sessions?: GameSession[]
    gameSessions?: GameSession[]
    historyStack?: any[]
}

export interface NameConflict {
    importedName: string
    importedData: BackupData['players'][0]
    suggestedMatchId?: string // 若有同名則預設帶入
}

/**
 * 解析並檢查 JSON 檔案
 */
export async function parseBackupFile(file: File): Promise<BackupData> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (e) => {
            try {
                const json = JSON.parse(e.target?.result as string)
                if (!json || !Array.isArray(json.players)) {
                    throw new Error('無效的備份檔案格式：缺少 players 陣列')
                }
                resolve(json as BackupData)
            } catch (err) {
                reject(err instanceof Error ? err : new Error('JSON 解析失敗'))
            }
        }
        reader.onerror = () => reject(new Error('讀取檔案失敗'))
        reader.readAsText(file)
    })
}

/**
 * 檢測導入人名與現有庫的衝突
 */
export function detectNameConflicts(
    importedPlayers: BackupData['players'],
    existingPlayers: Player[]
): NameConflict[] {
    const existingNameMap = new Map(existingPlayers.map(p => [p.name.trim().toLowerCase(), p.id]))

    return importedPlayers.map(p => {
        const cleanName = p.name.trim()
        const matchedId = existingNameMap.get(cleanName.toLowerCase())
        return {
            importedName: cleanName,
            importedData: p,
            suggestedMatchId: matchedId
        }
    })
}