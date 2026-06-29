document.addEventListener('DOMContentLoaded', () => {
  const toggleSwitch = document.getElementById('toggle-switch');
  const statusIndicator = document.getElementById('status-indicator');
  const statusText = document.getElementById('status-text');
  const skipCounter = document.getElementById('skip-counter');
  const watchTimeCounter = document.getElementById('watch-time-counter');
  const adTimeCounter = document.getElementById('ad-time-counter');
  const resetButton = document.getElementById('reset-button');
  const reportSkipFailedBtn = document.getElementById('report-skip-failed-btn');
  const reportEnforcementBtn = document.getElementById('report-enforcement-btn');

  // 신호등 요소 매핑
  const lights = {
    tagDetected: document.getElementById('light-tag-detected'),
    rectFound: document.getElementById('light-rect-found'),
    visible: document.getElementById('light-visible'),
    timerCompleted: document.getElementById('light-timer-completed'),
    opacityNormal: document.getElementById('light-opacity-normal'),
    notDisabled: document.getElementById('light-not-disabled'),
    clicked: document.getElementById('light-clicked'),
    clickFailed: document.getElementById('light-click-failed')
  };

  // 1. 초기 상태 불러오기
  chrome.storage.local.get(
    ['enabled', 'skippedCount', 'videoTimeWatched', 'adTimeWasted', 'skipLogs', 'enforcementError', 'currentAdStatus'],
    (result) => {
      // 작동 상태 설정 (기본값: true)
      const isEnabled = result.enabled !== false;
      toggleSwitch.checked = isEnabled;
      updateStatusUI(isEnabled);

      // 각 카운터 데이터 노출
      skipCounter.textContent = result.skippedCount || 0;
      watchTimeCounter.textContent = formatTime(result.videoTimeWatched || 0);
      adTimeCounter.textContent = formatTime(result.adTimeWasted || 0);

      // 신호등 초기 상태 업데이트
      updateLightsUI(result.currentAdStatus || {});

      // 차단 경고 기록 존재 여부에 따른 제보 버튼 경고등 설정
      if (result.enforcementError) {
        reportEnforcementBtn.classList.add('guard-warning');
      } else {
        reportEnforcementBtn.classList.remove('guard-warning');
      }
    }
  );

  // 2. 토글 스위치 상태 변경 이벤트
  toggleSwitch.addEventListener('change', (e) => {
    const isEnabled = e.target.checked;
    chrome.storage.local.set({ enabled: isEnabled }, () => {
      updateStatusUI(isEnabled);
    });
  });

  // 3. 통계 초기화 버튼 이벤트 (클릭 기록 및 차단 로그 포함 전체 데이터 리셋)
  resetButton.addEventListener('click', () => {
    if (confirm('자동 클릭 횟수, 실제 시청 시간, 광고 대기 시간, 최근 기록 및 차단 로그를 모두 초기화하시겠습니까?')) {
      chrome.storage.local.set({ 
        skippedCount: 0, 
        videoTimeWatched: 0, 
        adTimeWasted: 0,
        skipLogs: [],
        enforcementError: null,
        currentAdStatus: {
          tagDetected: false,
          rectFound: false,
          visible: false,
          timerCompleted: false,
          opacityNormal: false,
          notDisabled: false,
          clicked: false,
          clickFailed: false,
          enforcementShield: false
        }
      }, () => {
        animateScale(skipCounter, 0);
        watchTimeCounter.textContent = '0 00:00:00';
        adTimeCounter.textContent = '0 00:00:00';
        updateLightsUI({});
        reportEnforcementBtn.classList.remove('guard-warning');
        reportSkipFailedBtn.classList.remove('failed-warning');
      });
    }
  });

  // 4. 스킵 실패 제보 버튼 클립보드 복사 이벤트
  reportSkipFailedBtn.addEventListener('click', () => {
    chrome.storage.local.get(['skippedCount', 'videoTimeWatched', 'adTimeWasted', 'skipLogs', 'currentAdStatus'], (res) => {
      const d = new Date();
      const timeStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
      
      const status = res.currentAdStatus || {};
      const statusText = `
  - 버튼 감지 (tagDetected): ${status.tagDetected ? "🟢 YES" : "🔴 NO"}
  - 위치/크기 (rectFound): ${status.rectFound ? "🟢 YES" : "🔴 NO"}
  - 가시성 (visible): ${status.visible ? "🟢 YES" : "🔴 NO"}
  - 타이머 완료 (timerCompleted): ${status.timerCompleted ? "🟢 YES" : "🔴 NO"}
  - 투명도 정상 (opacityNormal): ${status.opacityNormal ? "🟢 YES" : "🔴 NO"}
  - 활성 상태 (notDisabled): ${status.notDisabled ? "🟢 YES" : "🔴 NO"}
  - 클릭 수행 (clicked): ${status.clicked ? "🟢 YES" : "🔴 NO"}
  - 실패 감지 (clickFailed): ${status.clickFailed ? "🔴 DETECTED" : "🟢 NO"}
  - 차단 가드 감지 (enforcementShield): ${status.enforcementShield ? "🔴 DETECTED" : "🟢 NO"}`;

      const logs = res.skipLogs && res.skipLogs.length > 0 ? res.skipLogs.join(', ') : '기록 없음';

      const reportText = `=== YouTube Ad Full Watch 스킵 실패 제보 ===
제보 시간: ${timeStr}
누적 클릭 수: ${res.skippedCount || 0}회
실제 시청 시간: ${formatTime(res.videoTimeWatched || 0)}
광고 대기 시간: ${formatTime(res.adTimeWasted || 0)}
최근 스킵 로그: [${logs}]

[실시간 돔 감지 상태]${statusText}
=============================================`;

      copyToClipboard(reportText, reportSkipFailedBtn, "제보 로그 복사 완료!");
    });
  });

  // 5. 차단 가드 제보 버튼 클립보드 복사 이벤트
  reportEnforcementBtn.addEventListener('click', () => {
    chrome.storage.local.get(['enforcementError'], (res) => {
      if (!res.enforcementError) {
        alert('기록된 차단 가드(경고 배너) 데이터가 없습니다. 차단 가드가 발견된 상황에서만 제보할 수 있습니다.');
        return;
      }
      const errorInfo = res.enforcementError;
      const reportText = `=== YouTube Ad Full Watch 차단 감지 제보 ===
발생 시간: ${errorInfo.time}
감지 셀렉터: ${errorInfo.selector}
HTML 데이터 스니펫:
${errorInfo.html}
=============================================`;

      copyToClipboard(reportText, reportEnforcementBtn, "차단 로그 복사 완료!");
    });
  });

  // 6. 실시간 수치 갱신 리스너
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (changes.skippedCount) {
      animateScale(skipCounter, changes.skippedCount.newValue || 0);
    }
    if (changes.videoTimeWatched) {
      watchTimeCounter.textContent = formatTime(changes.videoTimeWatched.newValue || 0);
    }
    if (changes.adTimeWasted) {
      adTimeCounter.textContent = formatTime(changes.adTimeWasted.newValue || 0);
    }
    if (changes.currentAdStatus) {
      updateLightsUI(changes.currentAdStatus.newValue || {});
    }
    if (changes.enforcementError) {
      if (changes.enforcementError.newValue) {
        reportEnforcementBtn.classList.add('guard-warning');
      } else {
        reportEnforcementBtn.classList.remove('guard-warning');
      }
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

  // 신호등 UI 동적 제어 함수
  function updateLightsUI(status) {
    const keys = Object.keys(lights);
    keys.forEach(key => {
      const el = lights[key];
      if (!el) return;

      // 실패 감지 신호등만 예외적으로 참일 때 붉은색(error) 경고등으로 작동
      if (key === 'clickFailed') {
        if (status[key]) {
          el.classList.add('error');
          reportSkipFailedBtn.classList.add('failed-warning');
        } else {
          el.classList.remove('error');
          reportSkipFailedBtn.classList.remove('failed-warning');
        }
      } else {
        if (status[key]) {
          el.classList.add('active');
        } else {
          el.classList.remove('active');
        }
      }
    });
  }

  // 누적 초(second)를 D HH:mm:SS 단위로 변경해주는 포맷터
  function formatTime(seconds) {
    const totalSecs = Math.round(seconds || 0);
    if (totalSecs < 0) return '0 00:00:00';

    const days = Math.floor(totalSecs / 86400);
    const hours = Math.floor((totalSecs % 86400) / 3600);
    const minutes = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;

    const pad = (num) => String(num).padStart(2, '0');
    
    // 9999일 한계값 방어 처리
    const displayDays = Math.min(days, 9999);

    return `${displayDays} ${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
  }

  // 클립보드 복사 함수
  function copyToClipboard(text, buttonEl, successText) {
    navigator.clipboard.writeText(text).then(() => {
      const originalHTML = buttonEl.innerHTML;
      buttonEl.innerHTML = `<span>${successText}</span>`;
      buttonEl.classList.add('copied');
      setTimeout(() => {
        buttonEl.innerHTML = originalHTML;
        buttonEl.classList.remove('copied');
      }, 1500);
    }).catch(err => {
      console.error('클립보드 복사 실패:', err);
    });
  }

  // 숫자 변경 시 스케일 애니메이션 효과
  function animateScale(element, targetValue) {
    const startValue = parseInt(element.textContent) || 0;
    if (startValue === targetValue) return;

    element.style.transform = 'scale(1.22)';
    element.style.transition = 'transform 0.15s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    
    setTimeout(() => {
      element.textContent = targetValue;
      element.style.transform = 'scale(1)';
    }, 150);
  }
});
