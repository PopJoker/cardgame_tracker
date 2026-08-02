export interface Player {
    id: string
    name: string
    totalGames: number
    wins: number
    totalScore: number
}

export interface RoundRecord {
    id: string
    timestamp: number
    winnerId: string
    scores: Record<string, number> // playerId -> score
}