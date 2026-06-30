document.addEventListener('DOMContentLoaded', () => {
  // 에러 로깅 시스템
  function logErrorToStorage(msg, stack) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const errStr = `[${new Date().toLocaleTimeString()}] ${msg}\nStack: ${stack || 'N/A'}`;
      chrome.storage.local.get(['runtimeErrors'], (res) => {
        let errs = res.runtimeErrors || [];
        errs.unshift(errStr);
        if (errs.length > 50) errs = errs.slice(0, 50);
        chrome.storage.local.set({ runtimeErrors: errs });
      });
    }
  }

  window.onerror = function (msg, url, line, col, error) {
    logErrorToStorage(`${msg} at ${url}:${line}:${col}`, error ? error.stack : '');
    return false;
  };

  window.onunhandledrejection = function (event) {
    const reason = event.reason;
    const msg = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : '';
    logErrorToStorage(`Unhandled Rejection: ${msg}`, stack);
  };

  const toggleSwitch = document.getElementById('toggle-switch');
  const totalWatchTime = document.getElementById('total-watch-time');
  const currentWatchTime = document.getElementById('current-watch-time');
  const totalAdTime = document.getElementById('total-ad-time');
  const currentAdTime = document.getElementById('current-ad-time');

  // 그룹 3: 실행 및 스킵 설정 버튼
  const btnForceClick = document.getElementById('btn-force-click');
  const btnDelayClick = document.getElementById('btn-delay-click');
  const btnRandomClick = document.getElementById('btn-random-click');
  const btnVirtualClick = document.getElementById('btn-virtual-click');

  // 그룹 4: 로그 복사 버튼
  const btnCopyAll = document.getElementById('btn-copy-all');
  const btnResetLogs = document.getElementById('btn-reset-logs');
  const btnResetWatchTime = document.getElementById('btn-reset-watch-time');
  const btnResetDashboard = document.getElementById('btn-reset-dashboard');

  const cardTotalAdTime = document.getElementById('card-total-ad-time');
  const cardCurrentAdTime = document.getElementById('card-current-ad-time');

  function updateAdHighlight(status) {
    if (!cardTotalAdTime || !cardCurrentAdTime) return;
    if (status && status.adPlaying) {
      cardTotalAdTime.classList.add('ad-active-highlight');
      cardCurrentAdTime.classList.add('ad-active-highlight');
    } else {
      cardTotalAdTime.classList.remove('ad-active-highlight');
      cardCurrentAdTime.classList.remove('ad-active-highlight');
    }
  }

  // 신호등 요소 매핑
  const lights = {
    tagDetected: document.getElementById('light-tag-detected'),
    rectFound: document.getElementById('light-rect-found'),
    visible: document.getElementById('light-visible'),
    videoPlaying: document.getElementById('light-video-playing'),
    timerCompleted: document.getElementById('light-timer-detected'),
    opacityNormal: document.getElementById('light-opacity-normal')
  };

  // 1. 초기 상태 불러오기
  chrome.storage.local.get(
    ['enabled', 'skippedCount', 'videoTimeWatched', 'adTimeWasted', 'currentVideoTime', 'currentAdTime', 'skipLogs', 'enforcementError', 'currentAdStatus', 'delayClick', 'randomClick', 'virtualClick'],
    (result) => {
      // 작동 상태 설정 (기본값: true)
      const isEnabled = result.enabled !== false;
      toggleSwitch.checked = isEnabled;

      // 각 카운터 데이터 노출
      totalWatchTime.textContent = formatTime(result.videoTimeWatched || 0);
      currentWatchTime.textContent = formatTime(result.currentVideoTime || 0);
      totalAdTime.textContent = formatTime(result.adTimeWasted || 0);
      currentAdTime.textContent = formatTime(result.currentAdTime || 0);

      // 설정 버튼 상태 복원
      const isDelayOn = result.delayClick !== false;
      const isRandomOn = result.randomClick !== false;
      const isVirtualOn = result.virtualClick !== false;
      updateToggleButtonState(btnDelayClick, isDelayOn);
      updateToggleButtonState(btnRandomClick, isRandomOn);
      updateToggleButtonState(btnVirtualClick, isVirtualOn);

      // 신호등 및 클릭 수치 초기 상태 업데이트
      updateLightsUI(result.currentAdStatus || {});
      updateAdHighlight(result.currentAdStatus || {});
    }
  );

  // 2. 토글 스위치 상태 변경 이벤트
  toggleSwitch.addEventListener('change', (e) => {
    const isEnabled = e.target.checked;
    chrome.storage.local.set({ enabled: isEnabled });
  });

  // 버튼 토글 상태 갱신 헬퍼
  function updateToggleButtonState(btn, state) {
    if (!btn) return;
    if (state) {
      btn.classList.remove('state-off');
    } else {
      btn.classList.add('state-off');
    }
  }

  // 지연 클릭 설정 변경 리스너
  if (btnDelayClick) {
    btnDelayClick.addEventListener('click', () => {
      chrome.storage.local.get(['delayClick'], (res) => {
        const nextState = res.delayClick === false; // 기본값 true이므로
        chrome.storage.local.set({ delayClick: nextState }, () => {
          updateToggleButtonState(btnDelayClick, nextState);
        });
      });
    });
  }

  // 랜덤 위치 클릭 설정 변경 리스너
  if (btnRandomClick) {
    btnRandomClick.addEventListener('click', () => {
      chrome.storage.local.get(['randomClick'], (res) => {
        const nextState = res.randomClick === false; // 기본값 true이므로
        chrome.storage.local.set({ randomClick: nextState }, () => {
          updateToggleButtonState(btnRandomClick, nextState);
        });
      });
    });
  }

  // 가상 클릭 설정 변경 리스너
  if (btnVirtualClick) {
    btnVirtualClick.addEventListener('click', () => {
      chrome.storage.local.get(['virtualClick'], (res) => {
        const nextState = res.virtualClick === false; // 기본값 true이므로
        chrome.storage.local.set({ virtualClick: nextState }, () => {
          updateToggleButtonState(btnVirtualClick, nextState);
        });
      });
    });
  }

  // 강제 클릭 리스너 바인딩
  if (btnForceClick) {
    btnForceClick.addEventListener('click', () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0] && tabs[0].id) {
          chrome.tabs.sendMessage(tabs[0].id, { action: "force_click" }, (response) => {
            btnForceClick.style.borderColor = 'var(--success-color)';
            setTimeout(() => {
              btnForceClick.style.borderColor = '';
            }, 500);
          });
        }
      });
    });
  }

  // 3. 현재 상태 복사 (진단용 전체 로그 및 통계 병합 복사)
  if (btnCopyAll) {
    btnCopyAll.addEventListener('click', () => {
      chrome.storage.local.get([
        'enabled', 'skippedCount', 'videoTimeWatched', 'adTimeWasted',
        'currentVideoTime', 'currentAdTime', 'skipLogs', 'enforcementError',
        'currentAdStatus', 'delayClick', 'randomClick', 'virtualClick',
        'watchHistory', 'runtimeErrors'
      ], (res) => {
        const manifest = chrome.runtime.getManifest();
        const d = new Date();
        const timeStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;

        // 1. 시스템 정보
        let reportText = `=== YT ad watch & click 현재상태 통합 진단 리포트 ===\n`;
        reportText += `복사 시각: ${timeStr}\n`;
        reportText += `확장 프로그램 버전: ${manifest.version} (${manifest.version_name || 'N/A'})\n`;
        reportText += `선언된 권한: ${JSON.stringify(manifest.permissions || [])}\n`;
        reportText += `chrome.debugger API 활성 상태: ${typeof chrome.debugger !== 'undefined'}\n\n`;

        // 2. 대시보드 및 컨트롤러 설정
        reportText += `[대시보드 제어 옵션]\n`;
        reportText += `  - 마스터 스위치 (enabled): ${res.enabled !== false ? "ON" : "OFF"}\n`;
        reportText += `  - 지연 클릭 (delayClick): ${res.delayClick !== false ? "ON (1.0~2.5초 지연)" : "OFF (0초 즉시)"}\n`;
        reportText += `  - 랜덤 위치 클릭 (randomClick): ${res.randomClick !== false ? "ON (분산 클릭)" : "OFF (버튼 중앙 클릭)"}\n`;
        reportText += `  - 가상 클릭 (virtualClick): ${res.virtualClick === true ? "ON (디버거 경유)" : "OFF (이벤트 합성)"}\n\n`;

        // 3. 누적 및 세션 시청 통계
        reportText += `[시청 누적/세션 통계]\n`;
        reportText += `  - 총 영상시청시간: ${formatTime(res.videoTimeWatched || 0)}\n`;
        reportText += `  - 현재 영상시청시간: ${formatTime(res.currentVideoTime || 0)}\n`;
        reportText += `  - 총 광고시청시간: ${formatTime(res.adTimeWasted || 0)}\n`;
        reportText += `  - 현재영상 광고시청시간: ${formatTime(res.currentAdTime || 0)}\n\n`;

        // 4. 실시간 감지 상태
        const status = res.currentAdStatus || {};
        reportText += `[실시간 돔 필터 감지 상태]\n`;
        reportText += `  - 버튼 감지 (tagDetected): ${status.tagDetected ? "🟢 YES" : "🔴 NO"}\n`;
        reportText += `  - 버튼 위치/크기 (rectFound): ${status.rectFound ? "🟢 YES" : "🔴 NO"}\n`;
        reportText += `  - 버튼 보임 (visible): ${status.visible ? "🟢 YES" : "🔴 NO"}\n`;
        reportText += `  - 광고 재생 중 (videoPlaying): ${status.videoPlaying ? "🟢 YES" : "🔴 NO"}\n`;
        reportText += `  - 필수 시청 완료 (timerCompleted): ${status.timerCompleted ? "🟢 YES" : "🔴 NO"}${status.remainingTime !== null && !status.timerCompleted ? ` (대기: ${status.remainingTime}초)` : ""}\n`;
        reportText += `  - 버튼 불투명 (opacityNormal): ${status.opacityNormal ? "🟢 YES" : "🔴 NO"}\n\n`;

        // 5. 최근 스킵 및 차단 로그
        reportText += `[스킵 동작 로그]\n`;
        reportText += `  - 최근 스킵 타임라인: [${res.skipLogs && res.skipLogs.length > 0 ? res.skipLogs.join(', ') : '기록 없음'}]\n\n`;

        // 6. 차단 방지 가드 에러
        reportText += `[차단 가드 오류 진단]\n`;
        if (res.enforcementError) {
          reportText += `  - 감지 시각: ${res.enforcementError.time}\n`;
          reportText += `  - 감지 요인: ${res.enforcementError.selector}\n`;
          reportText += `  - 가드 데이터 스니펫: ${res.enforcementError.html}\n\n`;
        } else {
          reportText += `  - 감지된 차단 가드 없음 (정상 상태)\n\n`;
        }

        // 7. 최근 시청 역사 기록
        reportText += `[시청 역사 기록 (최근 5건)]\n`;
        const history = res.watchHistory || [];
        if (history.length === 0) {
          reportText += `  - 기록된 시청 역사가 없음\n\n`;
        } else {
          history.forEach((item, index) => {
            reportText += `  ${index + 1}. ${item.timestamp} | 시청: ${formatTimeSimple(item.watchTime)} | 광고: ${formatTimeSimple(item.adTime)}\n`;
            reportText += `     - 제목: ${item.title}\n`;
            reportText += `     - 링크: ${item.url}\n`;
          });
          reportText += `\n`;
        }

        // 8. 내부 런타임 오류 로그
        reportText += `[최근 내부 시스템 런타임 오류]\n`;
        const errs = res.runtimeErrors || [];
        if (errs.length === 0) {
          reportText += `  - 기록된 런타임 에러 없음\n`;
        } else {
          reportText += errs.slice(0, 10).join('\n\n') + '\n';
        }
        reportText += `================================================`;

        copyToClipboard(reportText, btnCopyAll, "통합 로그 복사 완료!");
      });
    });
  }

  // 4. 로그 초기화 (시청 기록 및 오류 로그 등 데이터 초기화)
  if (btnResetLogs) {
    btnResetLogs.addEventListener('click', () => {
      if (confirm('시청 기록, 스킵 로그 및 내부 오류 로그 내역을 모두 초기화하시겠습니까? (누적 시청시간 통계는 유지됩니다)')) {
        chrome.storage.local.set({
          watchHistory: [],
          skipLogs: [],
          runtimeErrors: [],
          enforcementError: null,
          lastConditionPassTime: null,
          lastClickAttemptTime: null,
          lastSkipSuccessTime: null
        }, () => {
          btnResetLogs.style.borderColor = 'var(--success-color)';
          setTimeout(() => {
            btnResetLogs.style.borderColor = '';
          }, 1000);
        });
      }
    });
  }

  // 5. 시청시간 초기화 (누적 시청 및 대기 시간 통계 초기화)
  if (btnResetWatchTime) {
    btnResetWatchTime.addEventListener('click', () => {
      if (confirm('누적 영상시청시간과 누적 광고시청시간 통계를 모두 0초로 초기화하시겠습니까?')) {
        chrome.storage.local.set({
          videoTimeWatched: 0,
          adTimeWasted: 0,
          currentVideoTime: 0,
          currentAdTime: 0
        }, () => {
          totalWatchTime.textContent = '0 00:00:00';
          currentWatchTime.textContent = '0 00:00:00';
          totalAdTime.textContent = '0 00:00:00';
          currentAdTime.textContent = '0 00:00:00';
          btnResetWatchTime.style.borderColor = 'var(--success-color)';
          setTimeout(() => {
            btnResetWatchTime.style.borderColor = '';
          }, 1000);
        });
      }
    });
  }

  // 6. 대시보드 설정 초기화 (지연 ON, 랜덤 ON, 가상 ON)
  if (btnResetDashboard) {
    btnResetDashboard.addEventListener('click', () => {
      if (confirm('대시보드 상세 스킵 제어 설정을 공장 초기값(지연 ON, 랜덤 ON, 가상 ON)으로 되돌리시겠습니까?')) {
        chrome.storage.local.set({
          delayClick: true,
          randomClick: true,
          virtualClick: true
        }, () => {
          updateToggleButtonState(btnDelayClick, true);
          updateToggleButtonState(btnRandomClick, true);
          updateToggleButtonState(btnVirtualClick, true);
          btnResetDashboard.style.borderColor = 'var(--success-color)';
          setTimeout(() => {
            btnResetDashboard.style.borderColor = '';
          }, 1000);
        });
      }
    });
  }

  // 6. 실시간 수치 갱신 리스너
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (changes.videoTimeWatched) {
      totalWatchTime.textContent = formatTime(changes.videoTimeWatched.newValue || 0);
    }
    if (changes.currentVideoTime) {
      currentWatchTime.textContent = formatTime(changes.currentVideoTime.newValue || 0);
    }
    if (changes.adTimeWasted) {
      totalAdTime.textContent = formatTime(changes.adTimeWasted.newValue || 0);
    }
    if (changes.currentAdTime) {
      currentAdTime.textContent = formatTime(changes.currentAdTime.newValue || 0);
    }
    if (changes.currentAdStatus) {
      updateLightsUI(changes.currentAdStatus.newValue || {});
      updateAdHighlight(changes.currentAdStatus.newValue || {});
    }
  });

  // 신호등 UI 동적 제어 함수
  function updateLightsUI(status) {
    const keys = Object.keys(lights);
    keys.forEach(key => {
      const el = lights[key];
      if (!el) return;

      if (key === 'timerCompleted') {
        const pct = status.progressPercent !== undefined ? status.progressPercent : 0;
        const progressRing = el.querySelector('.progress-ring');
        const progressBar = el.querySelector('#timer-progress-bar');
        const completeIcon = el.querySelector('#timer-complete-icon');
        
        if (status.timerCompleted) {
          el.classList.add('active');
          el.style.borderColor = '';
          
          if (progressRing) progressRing.style.display = 'none';
          if (completeIcon) {
            completeIcon.style.display = 'block';
            completeIcon.style.color = '#10b981'; // 완료 시 초록색
          }
        } else if (status.remainingTime !== null && status.remainingTime !== undefined) {
          el.classList.remove('active');
          el.style.borderColor = 'transparent';
          
          if (progressRing) progressRing.style.display = 'block';
          if (completeIcon) completeIcon.style.display = 'none';
          
          if (progressBar) {
            const circumference = 81.68;
            const offset = circumference - (pct / 100) * circumference;
            progressBar.style.transition = status.isMock 
              ? 'stroke-dashoffset 0.1s linear' 
              : 'stroke-dashoffset 1s linear';
            progressBar.style.strokeDashoffset = offset;
          }
        } else {
          el.classList.remove('active');
          el.style.borderColor = '';
          
          if (progressRing) progressRing.style.display = 'none';
          if (completeIcon) {
            completeIcon.style.display = 'block';
            completeIcon.style.color = 'var(--text-secondary)';
          }
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

  // 초를 ~분 ~초 형태의 가독성 높은 한국어 문자열로 변환
  function formatTimeSimple(sec) {
    if (!sec || sec <= 0) return "0초";
    const minutes = Math.floor(sec / 60);
    const seconds = Math.round(sec % 60);
    let str = "";
    if (minutes > 0) str += `${minutes}분 `;
    if (seconds > 0 || str === "") str += `${seconds}초`;
    return str.trim();
  }

});
