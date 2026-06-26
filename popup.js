document.addEventListener('DOMContentLoaded', () => {
  const toggleSwitch = document.getElementById('toggle-switch');
  const statusIndicator = document.getElementById('status-indicator');
  const statusText = document.getElementById('status-text');
  const skipCounter = document.getElementById('skip-counter');
  const watchTimeCounter = document.getElementById('watch-time-counter');
  const adTimeCounter = document.getElementById('ad-time-counter');
  const resetButton = document.getElementById('reset-button');
  const logsList = document.getElementById('logs-list');
  const errorBanner = document.getElementById('error-banner');
  const errorBody = document.getElementById('error-body');
  const copyErrorBtn = document.getElementById('copy-error-btn');

  let currentErrorText = '';

  // 1. 초기 상태 불러오기
  chrome.storage.local.get(['enabled', 'skippedCount', 'videoTimeWatched', 'adTimeWasted', 'skipLogs', 'enforcementError'], (result) => {
    // 작동 상태 설정 (기본값: true)
    const isEnabled = result.enabled !== false;
    toggleSwitch.checked = isEnabled;
    updateStatusUI(isEnabled);

    // 각 카운터 데이터 노출
    skipCounter.textContent = result.skippedCount || 0;
    watchTimeCounter.textContent = formatTime(result.videoTimeWatched || 0);
    adTimeCounter.textContent = formatTime(result.adTimeWasted || 0);

    // 최근 클릭 기록 노출
    updateLogsUI(result.skipLogs || []);

    // 차단 에러 배너 체크
    if (result.enforcementError) {
      showError(result.enforcementError);
    } else {
      hideError();
    }
  });

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
        enforcementError: null
      }, () => {
        animateScale(skipCounter, 0);
        watchTimeCounter.textContent = '0초';
        adTimeCounter.textContent = '0초';
        updateLogsUI([]);
        hideError();
      });
    }
  });

  // 4. 유튜브 탭에서의 실시간 스크립트 수치 및 기록/에러 갱신 이벤트 리스너
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
    if (changes.skipLogs) {
      updateLogsUI(changes.skipLogs.newValue || []);
    }
    if (changes.enforcementError) {
      if (changes.enforcementError.newValue) {
        showError(changes.enforcementError.newValue);
      } else {
        hideError();
      }
    }
  });

  // 에러 복사 버튼 클릭 이벤트
  copyErrorBtn.addEventListener('click', () => {
    if (!currentErrorText) return;
    navigator.clipboard.writeText(currentErrorText).then(() => {
      const originalHTML = copyErrorBtn.innerHTML;
      copyErrorBtn.innerHTML = '<span>복사 완료!</span>';
      setTimeout(() => {
        copyErrorBtn.innerHTML = originalHTML;
      }, 1500);
    }).catch(err => {
      console.error('클립보드 복사 실패:', err);
    });
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

  // 에러 경고 노출 함수
  function showError(errorInfo) {
    errorBanner.style.display = 'flex';
    errorBody.textContent = `[${errorInfo.time}] 감지 셀렉터: ${errorInfo.selector}\nHTML 구조가 스토리지에 기록되었습니다. 아래 버튼을 눌러 복사 후 개발자에게 제보해주세요.`;
    currentErrorText = `=== YouTube Ad Full Watch 차단 감지 제보 ===\n발생 시간: ${errorInfo.time}\n감지 셀렉터: ${errorInfo.selector}\nHTML 데이터 스니펫:\n${errorInfo.html}\n=============================================`;
  }

  // 에러 경고 숨김 함수
  function hideError() {
    errorBanner.style.display = 'none';
    errorBody.textContent = '';
    currentErrorText = '';
  }

  // 최근 자동 클릭 기록 UI 업데이트 함수
  function updateLogsUI(logs) {
    logsList.innerHTML = '';
    if (!logs || logs.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty-log';
      li.textContent = '기록 없음';
      logsList.appendChild(li);
      return;
    }
    logs.forEach(time => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="log-desc">광고 건너뛰기 클릭 대행</span><span class="log-time">${time}</span>`;
      logsList.appendChild(li);
    });
  }

  // 누적 초(second)를 H시간 M분 S초 단위로 변경해주는 포맷터
  function formatTime(seconds) {
    const sec = Math.round(seconds || 0);
    if (sec < 60) {
      return `${sec}초`;
    }
    const min = Math.floor(sec / 60);
    if (min < 60) {
      return `${min}분 ${sec % 60}초`;
    }
    const hour = Math.floor(min / 60);
    const remainingMin = min % 60;
    // 1시간 이상인 경우 레이아웃 편의성을 위해 초(second) 표기를 생략함
    return `${hour}시간 ${remainingMin}분`;
  }

  // 숫자 변경 시 톡 튀는 스케일 애니메이션 효과
  function animateScale(element, targetValue) {
    const startValue = parseInt(element.textContent) || 0;
    if (startValue === targetValue) return;

    element.style.transform = 'scale(1.25)';
    element.style.transition = 'transform 0.15s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    
    setTimeout(() => {
      element.textContent = targetValue;
      element.style.transform = 'scale(1)';
    }, 150);
  }
});
