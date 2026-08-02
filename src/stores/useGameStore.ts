// src/stores/useGameStore.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface GameRound {
    id: string
    winnerId: string
    scores: Record<string, number> // playerId -> round score
    timestamp: number
}

export interface GameSession {
    id: string
    startTime: number
    endTime?: number
    playerIds: string[]
    rounds: GameRound[]
}

export const useGameStore = defineStore('game', () => {
    const activePlayerIds = ref<string[]>([])
    const historyStack = ref<GameRound[]>([])
    const gameSessions = ref<GameSession[]>([])

    // 計算當前對局總得分
    const currentScores = computed(() => {
        const scores: Record<string, number> = {}
        activePlayerIds.value.forEach(id => {
            scores[id] = 0
        })
        historyStack.value.forEach(round => {
            Object.entries(round.scores).forEach(([pId, score]) => {
                scores[pId] = (scores[pId] || 0) + score
            })
        })
        return scores
    })

    // 開啟新對局 / 結束對局
    const startNewGame = (playerIds: string[]) => {
        try {
            // 1. 若上一局有紀錄，安全地存入歷史 Session
            if (activePlayerIds.value.length > 0 && historyStack.value.length > 0) {
                const firstRoundTime = historyStack.value[0]?.timestamp

                gameSessions.value.unshift({
                    id: `session_${Date.now()}`,
                    startTime: typeof firstRoundTime === 'number' ? firstRoundTime : Date.now(),
                    endTime: Date.now(),
                    playerIds: JSON.parse(JSON.stringify(activePlayerIds.value)),
                    rounds: JSON.parse(JSON.stringify(historyStack.value))
                })
            }
        } catch (error) {
            console.error('歸檔舊對局失敗，強制清理狀態:', error)
        } finally {
            // 2. 確保無論歸檔是否成功，狀態都「絕對會」被清空與更新
            activePlayerIds.value = [...playerIds]
            historyStack.value = []
        }
    }

    // 記錄回合
    const recordRound = (winnerId: string, scores: Record<string, number>) => {
        historyStack.value.push({
            id: `round_${Date.now()}`,
            winnerId,
            scores,
            timestamp: Date.now()
        })
    }

    // 復原上一回合
    const undoLastRound = () => {
        historyStack.value.pop()
    }

    // 🌟 1. 當前對局：回溯至指定的回合（包含該回合，刪除其後的所有回合）
    const rollbackToRound = (targetRoundId: string) => {
        const targetIndex = historyStack.value.findIndex(r => r.id === targetRoundId)
        if (targetIndex !== -1) {
            historyStack.value = historyStack.value.slice(0, targetIndex + 1)
        }
    }

    // 🌟 2. 歷史戰績：將某一場歷史對局載入為「當前對局」（可選擇載入到第幾回合）
    const restoreSession = (sessionId: string, untilRoundId?: string) => {
        const targetSession = gameSessions.value.find(s => s.id === sessionId)
        if (!targetSession) return

        // 如果目前已有進行中的戰績，先自動存入歷史紀錄
        if (activePlayerIds.value.length > 0 && historyStack.value.length > 0) {
            gameSessions.value.unshift({
                id: `session_${Date.now()}`,
                startTime: historyStack.value[0]?.timestamp || Date.now(),
                endTime: Date.now(),
                playerIds: [...activePlayerIds.value],
                rounds: [...historyStack.value]
            })
        }

        activePlayerIds.value = [...targetSession.playerIds]

        if (untilRoundId) {
            const index = targetSession.rounds.findIndex(r => r.id === untilRoundId)
            historyStack.value = index !== -1
                ? JSON.parse(JSON.stringify(targetSession.rounds.slice(0, index + 1)))
                : JSON.parse(JSON.stringify(targetSession.rounds))
        } else {
            historyStack.value = JSON.parse(JSON.stringify(targetSession.rounds))
        }
    }

    // 匯出 JSON 資料
    const exportDataJson = () => {
        const data = {
            version: '1.0',
            exportedAt: new Date().toISOString(),
            activePlayerIds: activePlayerIds.value,
            historyStack: historyStack.value,
            gameSessions: gameSessions.value
        }
        return JSON.stringify(data, null, 2)
    }

    const importSessions = (incomingSessions: GameSession[]) => {
        if (!Array.isArray(incomingSessions)) return

        incomingSessions.forEach(incoming => {
            const exists = gameSessions.value.some(s => s.id === incoming.id)
            if (!exists) {
                gameSessions.value.push(incoming)
            }
        })

        gameSessions.value.sort((a, b) => b.startTime - a.startTime)
    }

    const importDataJson = (jsonString: string, mappingResult?: Record<string, string>): boolean => {
        try {
            const parsed = JSON.parse(jsonString)
            const mapId = (oldId: string) => (mappingResult && mappingResult[oldId]) || oldId

            let targetActiveIds: string[] = []

            if (Array.isArray(parsed.activePlayerIds) && parsed.activePlayerIds.length > 0) {
                targetActiveIds = parsed.activePlayerIds.map(mapId)
            } else if (Array.isArray(parsed.players) && parsed.players.length > 0) {
                targetActiveIds = parsed.players.map((p: any) => mapId(p.id))
            }

            if (targetActiveIds.length > 0) {
                activePlayerIds.value = targetActiveIds
            }

            if (Array.isArray(parsed.historyStack) && parsed.historyStack.length > 0) {
                historyStack.value = parsed.historyStack.map((round: GameRound) => {
                    const newScores: Record<string, number> = {}
                    Object.entries(round.scores || {}).forEach(([pId, score]) => {
                        newScores[mapId(pId)] = score
                    })
                    return {
                        ...round,
                        winnerId: mapId(round.winnerId),
                        scores: newScores
                    }
                })
            }

            const sessionsToImport = parsed.gameSessions || parsed.sessions || []
            if (Array.isArray(sessionsToImport) && sessionsToImport.length > 0) {
                const mappedSessions: GameSession[] = sessionsToImport.map((s: GameSession) => ({
                    ...s,
                    playerIds: (s.playerIds || []).map(mapId),
                    rounds: (s.rounds || []).map(r => {
                        const newScores: Record<string, number> = {}
                        Object.entries(r.scores || {}).forEach(([pId, score]) => {
                            newScores[mapId(pId)] = score
                        })
                        return {
                            ...r,
                            winnerId: mapId(r.winnerId),
                            scores: newScores
                        }
                    })
                }))
                importSessions(mappedSessions)
            }

            return activePlayerIds.value.length >= 2 && historyStack.value.length > 0
        } catch (e) {
            console.error('Failed to parse backup JSON:', e)
            return false
        }
    }

    const loadSelectedSession = (
        session: GameSession | null,
        historyStackData: GameRound[] | null,
        mappingResult: Record<string, string>
    ) => {
        const mapId = (oldId: string) => mappingResult[oldId] || oldId

        if (session) {
            activePlayerIds.value = (session.playerIds || []).map(mapId)
            historyStack.value = (session.rounds || []).map(r => {
                const newScores: Record<string, number> = {}
                Object.entries(r.scores || {}).forEach(([pId, score]) => {
                    newScores[mapId(pId)] = score
                })
                return {
                    ...r,
                    winnerId: mapId(r.winnerId),
                    scores: newScores
                }
            })
        } else if (historyStackData) {
            historyStack.value = historyStackData.map(r => {
                const newScores: Record<string, number> = {}
                Object.entries(r.scores || {}).forEach(([pId, score]) => {
                    newScores[mapId(pId)] = score
                })
                return {
                    ...r,
                    winnerId: mapId(r.winnerId),
                    scores: newScores
                }
            })

            const extractedPlayerIds = new Set<string>()
            historyStack.value.forEach(r => {
                Object.keys(r.scores).forEach(pId => extractedPlayerIds.add(pId))
            })
            activePlayerIds.value = Array.from(extractedPlayerIds)
        }
    }

    const clearAllHistory = () => {
        gameSessions.value = []
        historyStack.value = []
    }

    return {
        activePlayerIds,
        historyStack,
        gameSessions,
        currentScores,
        startNewGame,
        recordRound,
        undoLastRound,
        rollbackToRound,
        restoreSession,
        exportDataJson,
        importSessions,
        importDataJson,
        clearAllHistory,
        loadSelectedSession
    }
}, {
    persist: true
})