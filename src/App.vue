<!-- App.vue -->
<!-- App.vue 中的 <script setup> 區塊 -->
<script setup lang="ts">
import { computed } from 'vue'
import StartGameModal from './components/StartGameModal.vue'
import ScoreTracker from './components/ScoreTracker.vue'
import InstallPrompt from './components/InstallPrompt.vue'
import { useGameStore } from './stores/useGameStore'
import { usePlayersStore } from './stores/usePlayersStore'

const gameStore = useGameStore()
const playersStore = usePlayersStore()

// 當 activePlayerIds 有人時代表遊戲進行中
const isGameActive = computed(() => gameStore.activePlayerIds.length > 0)

// 修正：移除 playerIds 參數，符合 StartGameModal 的事件簽名
const onGameStarted = () => {
  // StartGameModal 內部已經將玩家寫入 gameStore 了
  // 這裡不需要額外做動作，isGameActive 會自動監聽到改變並切換畫面
}

const onExitGame = () => {
  const hasHistory = gameStore.historyStack.length > 0
  const message = hasHistory
    ? '確定要結束當前對局嗎？戰績將儲存在歷史紀錄中。'
    : '確定要結束當前對局嗎？'

  if (confirm(message)) {
    if (hasHistory) {
      playersStore.recordGameResult(gameStore.currentScores)
    }

    // 清空玩家，觸發歸檔，isGameActive 自動變 false
    gameStore.startNewGame([])
  }
}
</script>

<template>
  <main class="min-h-screen py-6 px-3 bg-slate-900">
    <StartGameModal v-if="!isGameActive" @game-started="onGameStarted" />

    <ScoreTracker v-else @exit-game="onExitGame" />

    <InstallPrompt />
  </main>
</template>