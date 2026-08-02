import { defineStore } from 'pinia'
import type { Player } from '../types/game'
import type { BackupData } from '../utils/importHandler'

export const usePlayersStore = defineStore('players', {
    state: () => ({
        players: [] as Player[]
    }),
    actions: {
        recordGameResult(scores: Record<string, number>) {
            // 找出最高分（贏家）
            let maxScore = -Infinity
            Object.values(scores).forEach(score => {
                if (score > maxScore) maxScore = score
            })

            Object.entries(scores).forEach(([playerId, score]) => {
                const player = this.players.find(p => p.id === playerId)
                if (player) {
                    player.totalGames += 1               // 總局數 +1
                    player.totalScore += score           // 累加總分
                    if (score === maxScore && score > 0) {
                        player.wins += 1                // 最高分者勝場 +1
                    }
                }
            })
        },
        addPlayer(name: string) {
            const trimmed = name.trim()
            if (!trimmed) return
            const existing = this.players.find(p => p.name === trimmed)
            if (!existing) {
                this.players.push({
                    id: crypto.randomUUID(),
                    name: trimmed,
                    totalGames: 0,
                    wins: 0,
                    totalScore: 0
                })
            }
        },
        // 刪除玩家（支援傳入 id 或 name，視 StartGameModal 傳入的參數而定）
        removePlayer(idOrName: string) {
            this.players = this.players.filter(
                p => p.id !== idOrName && p.name !== idOrName
            )
        },
        // 智慧匯入玩家戰績
        importPlayersWithMapping(
            importedPlayers: BackupData['players'],
            mapping: Map<string, { action: 'merge' | 'create' | 'rename', targetId?: string, newName?: string }>
        ) {
            importedPlayers.forEach(imp => {
                const decision = mapping.get(imp.name.trim())
                if (!decision) return

                if (decision.action === 'merge' && decision.targetId) {
                    // 併入現有玩家，累加戰績
                    const target = this.players.find(p => p.id === decision.targetId)
                    if (target) {
                        target.totalGames += imp.totalGames || 0
                        target.wins += imp.wins || 0
                        target.totalScore += imp.totalScore || 0
                    }
                } else if (decision.action === 'rename' && decision.newName) {
                    // 新增為重命名後的玩家
                    this.players.push({
                        id: crypto.randomUUID(),
                        name: decision.newName.trim(),
                        totalGames: imp.totalGames || 0,
                        wins: imp.wins || 0,
                        totalScore: imp.totalScore || 0
                    })
                } else {
                    // 新增玩家 (create)
                    this.players.push({
                        id: crypto.randomUUID(),
                        name: imp.name.trim(),
                        totalGames: imp.totalGames || 0,
                        wins: imp.wins || 0,
                        totalScore: imp.totalScore || 0
                    })
                }
            })
        }
    },
    persist: true
})