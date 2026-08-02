<script setup lang="ts">
import { computed } from 'vue'
import StartGameModal from './components/StartGameModal.vue'
import ScoreTracker from './components/ScoreTracker.vue'
import InstallPrompt from './components/InstallPrompt.vue'
import ThemeToggle from './components/ThemeToggle.vue'
import { useGameStore } from './stores/useGameStore'
import { usePlayersStore } from './stores/usePlayersStore'

const gameStore = useGameStore()
const playersStore = usePlayersStore()

// 當 activePlayerIds 有人時代表遊戲進行中
const isGameActive = computed(() => gameStore.activePlayerIds.length > 0)

const onGameStarted = () => {
  // StartGameModal 內部已經將玩家寫入 gameStore 了
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
  <main class="min-h-screen py-6 px-3 bg-[var(--bg)] text-[var(--text)] transition-colors duration-300">
    <header class="max-w-md mx-auto flex justify-end items-center mb-2 px-1">
      <ThemeToggle />
    </header>

    <!-- 主內容區：加入 Transition 並設定 mode="out-in" -->
    <Transition name="fade" mode="out-in">
      <StartGameModal v-if="!isGameActive" key="start-game" @game-started="onGameStarted" />
      <ScoreTracker v-else key="score-tracker" @exit-game="onExitGame" />
    </Transition>

    <InstallPrompt />
  </main>
</template>

<style scoped>
/* 切換動畫：Fade In / Fade Out */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(6px);
  /* 附帶微小的上浮效果，質感更好 */
}
</style>