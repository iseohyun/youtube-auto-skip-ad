document.addEventListener('DOMContentLoaded', () => {
  const toggleSwitch = document.getElementById('toggle-switch');
  const statusIndicator = document.getElementById('status-indicator');
  const statusText = document.getElementById('status-text');
  const skipCounter = document.getElementById('skip-counter');
  const resetButton = document.getElementById('reset-button');

  // 1. 초기 상태 불러오기
  chrome.storage.local.get(['enabled', 'skippedCount'], (result) => {
    // 작동 상태 설정 (기본값: true)
    const isEnabled = result.enabled !== false;
    toggleSwitch.checked = isEnabled;
    updateStatusUI(isEnabled);

    // 스킵 횟수 설정 (기본값: 0)
    const count = result.skippedCount || 0;
    animateCounter(count);
  });

  // 2. 토글 스위치 상태 변경 이벤트
  toggleSwitch.addEventListener('change', (e) => {
    const isEnabled = e.target.checked;
    chrome.storage.local.set({ enabled: isEnabled }, () => {
      updateStatusUI(isEnabled);
    });
  });

  // 3. 통계 초기화 버튼 이벤트
  resetButton.addEventListener('click', () => {
    if (confirm('스킵 누적 통계를 초기화하시겠습니까?')) {
      chrome.storage.local.set({ skippedCount: 0 }, () => {
        animateCounter(0);
      });
    }
  });

  // 4. 유튜브 탭에서 광고를 스킵하여 수치가 실시간 변경되는 것을 감지
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (changes.skippedCount) {
      animateCounter(changes.skippedCount.newValue || 0);
    }
  });

  // 상태 UI 업데이트 함수
  function updateStatusUI(isEnabled) {
    if (isEnabled) {
      statusIndicator.classList.remove('inactive');
      statusIndicator.classList.add('active');
      statusText.textContent = '실시간 작동 중';
    } else {
      statusIndicator.classList.remove('active');
      statusIndicator.classList.add('inactive');
      statusText.textContent = '작동 정지됨';
    }
  }

  // 숫자 변경 시 톡 튀는 느낌을 주는 마이크로 애니메이션 함수
  function animateCounter(targetValue) {
    const startValue = parseInt(skipCounter.textContent) || 0;
    if (startValue === targetValue) return;

    // 카운터 텍스트 살짝 커졌다가 돌아오는 효과 적용
    skipCounter.style.transform = 'scale(1.25)';
    skipCounter.style.transition = 'transform 0.15s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    
    setTimeout(() => {
      skipCounter.textContent = targetValue;
      skipCounter.style.transform = 'scale(1)';
    }, 150);
  }
});
