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
  const resetButton = document.getElementById('reset-button');
  const reportSkipFailedBtn = document.getElementById('report-skip-failed-btn');
  const reportEnforcementBtn = document.getElementById('report-enforcement-btn');
  const btnCopyHistory = document.getElementById('btn-copy-history');
  const labelCopyHistory = document.getElementById('label-copy-history');
  const btnCopyErrors = document.getElementById('btn-copy-errors');

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

  // 그룹 3: 실행 및 클릭 분석 수치
  const valClicked = document.getElementById('val-clicked');
  const valWarning = document.getElementById('val-warning');
  const valDelay = document.getElementById('val-delay');
  const valCoordinates = document.getElementById('val-coordinates');

  // 신호등 요소 매핑
  const lights = {
    tagDetected: document.getElementById('light-tag-detected'),
    rectFound: document.getElementById('light-rect-found'),
    visible: document.getElementById('light-visible'),
    videoPlaying: document.getElementById('light-video-playing'),
    timerCompleted: document.getElementById('light-timer-detected'),
    opacityNormal: document.getElementById('light-opacity-normal'),
    notDisabled: document.getElementById('light-not-disabled'),
    classClickable: document.getElementById('light-class-clickable'),
    clicked: document.getElementById('light-clicked'),
    clickFailed: document.getElementById('light-click-failed')
  };

  // 1. 초기 상태 불러오기
  chrome.storage.local.get(
    ['enabled', 'skippedCount', 'videoTimeWatched', 'adTimeWasted', 'currentVideoTime', 'currentAdTime', 'skipLogs', 'enforcementError', 'currentAdStatus'],
    (result) => {
      // 작동 상태 설정 (기본값: true)
      const isEnabled = result.enabled !== false;
      toggleSwitch.checked = isEnabled;

      // 각 카운터 데이터 노출
      const count = result.skippedCount || 0;
      if (labelCopyHistory) {
        labelCopyHistory.textContent = `기록: Skip ${count}회`;
      }
      totalWatchTime.textContent = formatTime(result.videoTimeWatched || 0);
      currentWatchTime.textContent = formatTime(result.currentVideoTime || 0);
      totalAdTime.textContent = formatTime(result.adTimeWasted || 0);
      currentAdTime.textContent = formatTime(result.currentAdTime || 0);

      // 신호등 및 클릭 수치 초기 상태 업데이트
      updateLightsUI(result.currentAdStatus || {});
      updateClickSectionUI(result.currentAdStatus || {});
      updateAdHighlight(result.currentAdStatus || {});

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
    chrome.storage.local.set({ enabled: isEnabled });
  });

  // 3. 로그 초기화 버튼 이벤트 (시청 기록 및 오류 로그 등 로그 데이터만 리셋)
  resetButton.addEventListener('click', () => {
    if (confirm('시청 기록, 스킵 로그 및 내부 오류 로그 내역을 모두 초기화하시겠습니까? (누적 통계는 유지됩니다)')) {
      chrome.storage.local.set({ 
        watchHistory: [],
        skipLogs: [],
        runtimeErrors: [],
        enforcementError: null,
        lastConditionPassTime: null,
        lastClickAttemptTime: null,
        lastSkipSuccessTime: null
      }, () => {
        chrome.storage.local.get(['skippedCount'], (res) => {
          const count = res.skippedCount || 0;
          if (labelCopyHistory) labelCopyHistory.textContent = `기록: Skip ${count}회`;
        });
        reportEnforcementBtn.classList.remove('guard-warning');
        reportSkipFailedBtn.classList.remove('failed-warning');
      });
    }
  });

  // 3.5. 클릭 수행 행 클릭 시 수동 강제 스킵 대행 이벤트 전송
  const rowClickPerform = document.getElementById('row-click-perform');
  if (rowClickPerform) {
    rowClickPerform.addEventListener('click', () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0] && tabs[0].id) {
          chrome.tabs.sendMessage(tabs[0].id, { action: "force_click" }, (response) => {
            // 수신 확인용 애니메이션 효과 유도
            rowClickPerform.style.borderColor = 'var(--success-color)';
            setTimeout(() => {
              rowClickPerform.style.borderColor = '';
            }, 500);
          });
        }
      });
    });
  }

  // 4. 스킵 실패 제보 버튼 클립보드 복사 이벤트
  reportSkipFailedBtn.addEventListener('click', () => {
    chrome.storage.local.get([
      'skippedCount', 'videoTimeWatched', 'adTimeWasted', 'skipLogs', 
      'currentAdStatus', 'lastAdHtml', 'lastAdTimeHtml',
      'lastConditionPassTime', 'lastClickAttemptTime', 'lastSkipSuccessTime'
    ], (res) => {
      const d = new Date();
      const timeStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
      
      const status = res.currentAdStatus || {};
      const statusText = `
  - 버튼 감지 (tagDetected): ${status.tagDetected ? "🟢 YES" : "🔴 NO"}
  - 위치/크기 (rectFound): ${status.rectFound ? "🟢 YES" : "🔴 NO"}
  - 가시성 (visible): ${status.visible ? "🟢 YES" : "🔴 NO"}
  - 재생 중 (videoPlaying): ${status.videoPlaying ? "🟢 YES" : "🔴 NO"}
  - 타이머 감지 (timerCompleted): ${status.timerCompleted ? "🟢 YES" : "🔴 NO"}${status.remainingTime !== null && !status.timerCompleted ? ` (대기: ${status.remainingTime}초)` : ""}
  - 투명도 정상 (opacityNormal): ${status.opacityNormal ? "🟢 YES" : "🔴 NO"}
  - 활성 상태 (notDisabled): ${status.notDisabled ? "🟢 YES" : "🔴 NO"}
  - 클릭 가능 상태 (classClickable): ${status.classClickable ? "🟢 YES" : "🔴 NO"}
  - 클릭 수행 (clicked): ${status.clicked ? "🟢 YES" : "🔴 NO"}
  - 클릭 실패 경고 (clickFailed): ${status.clickFailed ? "🔴 DETECTED" : "🟢 NO"}
  - 차단 가드 감지 (enforcementShield): ${status.enforcementShield ? "🔴 DETECTED" : "🟢 NO"}`;

      // 타임라인 분석 및 진단 
      const lastPass = res.lastConditionPassTime || "기록 없음";
      const lastClick = res.lastClickAttemptTime || "기록 없음";
      const lastSuccess = res.lastSkipSuccessTime || "기록 없음";

      let analysisText = "";
      if (res.lastClickAttemptTime) {
        if (res.lastSkipSuccessTime) {
          const clickTime = new Date(res.lastClickAttemptTime).getTime();
          const successTime = new Date(res.lastSkipSuccessTime).getTime();
          if (clickTime > successTime && (Date.now() - clickTime > 3500)) {
            analysisText = "⚠️ 클릭 전송 후 3.5초가 경과했으나 광고가 해제되지 않고 유지됨 (유튜브 스크립트가 클릭을 무시했을 가능성 높음)";
          } else {
            analysisText = "🟢 정상 (클릭 전송 후 정상적으로 광고가 스킵되었거나 진행 대기 중인 상태)";
          }
        } else {
          analysisText = "⚠️ 클릭 전송을 하였으나 아직까지 광고 스킵 성공 기록이 한 번도 없음 (이벤트 수신 불통 상태)";
        }
      } else {
        analysisText = "⚪ 클릭 대기 상태 (아직 모든 스킵 만족 조건이 충족되지 않음)";
      }

      const timelineText = `
[광고 제어 타임라인 분석]
  - 마지막 조건 통과 시각: ${lastPass}
  - 마지막 클릭 시도 시각: ${lastClick}
  - 마지막 건너뛰기 성공 시각: ${lastSuccess}
  - 클릭 결과 정밀 진단: ${analysisText}`;

      const logs = res.skipLogs && res.skipLogs.length > 0 ? res.skipLogs.join(', ') : '기록 없음';
      const adHtmlText = res.lastAdHtml ? res.lastAdHtml : '스킵 단추 HTML을 찾지 못함';
      const timeHtmlText = res.lastAdTimeHtml ? res.lastAdTimeHtml : '재생 시간 HTML을 찾지 못함';

      const reportText = `=== YT ad watch & click 현재상태 복사 ===
제보 시간: ${timeStr}
누적 클릭 수: ${res.skippedCount || 0}회
영상시청시간: ${formatTime(res.videoTimeWatched || 0)}
광고시청시간: ${formatTime(res.adTimeWasted || 0)}
최근 스킵 로그: [${logs}]

[실시간 돔 감지 상태]${statusText}
${timelineText}

[스킵 버튼 부근 HTML 구조]
${adHtmlText}

[동영상 재생 시간 정보 HTML 구조]
${timeHtmlText}
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
      const reportText = `=== YT ad watch & click 차단 가드 정보 ===
발생 시간: ${errorInfo.time}
감지 셀렉터: ${errorInfo.selector}
HTML 데이터 스니펫:
${errorInfo.html}
=============================================`;

      copyToClipboard(reportText, reportEnforcementBtn, "차단 로그 복사 완료!");
    });
  });

  // 5.5. 시청 역사 기록 클립보드 복사 이벤트
  if (btnCopyHistory) {
    btnCopyHistory.addEventListener('click', () => {
      chrome.storage.local.get(['watchHistory', 'skippedCount'], (res) => {
        const history = res.watchHistory || [];
        const skipCount = res.skippedCount || 0;
        
        let report = `=== YT ad watch & click 시청 기록 ===\n`;
        report += `복사 시간: ${new Date().toLocaleString()}\n`;
        report += `총 누적 스킵 횟수: ${skipCount}회\n\n`;
        report += `[최근 시청 영상 역사]\n`;
        
        if (history.length === 0) {
          report += `(기록된 시청 역사가 없습니다. 영상을 시청한 뒤 다른 영상으로 이동하면 기록이 생성됩니다.)\n`;
        } else {
          history.forEach((item, index) => {
            report += `${index + 1}. ${item.timestamp} | 시청: ${formatTimeSimple(item.watchTime)} | 광고: ${formatTimeSimple(item.adTime)}\n`;
            report += `   - 제목: ${item.title}\n`;
            report += `   - 링크: ${item.url}\n\n`;
          });
        }
        report += `===================================`;
        
        navigator.clipboard.writeText(report).then(() => {
          const originalText = labelCopyHistory.textContent;
          labelCopyHistory.textContent = '복사 완료!';
          btnCopyHistory.style.borderColor = 'var(--success-color)';
          setTimeout(() => {
            labelCopyHistory.textContent = originalText;
            btnCopyHistory.style.borderColor = '';
          }, 1200);
        });
      });
    });
  }

  // 5.8. 그룹 5: 시나리오 테스트 버튼 이벤트 바인딩
  const btnTestS1 = document.getElementById('btn-test-s1');
  if (btnTestS1) {
    btnTestS1.addEventListener('click', () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || !tabs[0] || !tabs[0].id) return;
        const tabId = tabs[0].id;
        
        chrome.tabs.sendMessage(tabId, { action: "get_button_coordinates" }, (response) => {
          if (!response || !response.success || response.x === undefined) {
            alert("스킵 버튼의 좌표를 찾지 못했거나 버튼이 활성화되어 있지 않습니다.");
            return;
          }
          
          const x = Math.round(response.x);
          const y = Math.round(response.y);
          
          chrome.runtime.sendMessage({
            action: "trigger_s1_debugger",
            tabId: tabId,
            x: x,
            y: y
          }, (res) => {
            if (res && res.success) {
              btnTestS1.style.borderColor = 'var(--success-color)';
              setTimeout(() => { btnTestS1.style.borderColor = ''; }, 1000);
            } else {
              alert("백그라운드 디버거 실행 실패: " + (res ? res.error : "알 수 없는 에러"));
            }
          });
        });
      });
    });
  }

  const btnTestS2 = document.getElementById('btn-test-s2');
  if (btnTestS2) {
    btnTestS2.addEventListener('click', () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0] && tabs[0].id) {
          chrome.tabs.sendMessage(tabs[0].id, { action: "test_s2" }, () => {
            btnTestS2.style.borderColor = 'var(--success-color)';
            setTimeout(() => { btnTestS2.style.borderColor = ''; }, 1000);
          });
        }
      });
    });
  }

  const btnTestS3 = document.getElementById('btn-test-s3');
  if (btnTestS3) {
    btnTestS3.addEventListener('click', () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0] && tabs[0].id) {
          chrome.tabs.sendMessage(tabs[0].id, { action: "test_s3" }, () => {
            btnTestS3.style.borderColor = 'var(--success-color)';
            setTimeout(() => { btnTestS3.style.borderColor = ''; }, 1000);
          });
        }
      });
    });
  }

  const btnTestS4 = document.getElementById('btn-test-s4');
  if (btnTestS4) {
    btnTestS4.addEventListener('click', () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0] && tabs[0].id) {
          chrome.tabs.sendMessage(tabs[0].id, { action: "test_s4" }, () => {
            btnTestS4.style.borderColor = 'var(--success-color)';
            setTimeout(() => { btnTestS4.style.borderColor = ''; }, 1000);
          });
        }
      });
    });
  }



  const btnTestS6 = document.getElementById('btn-test-s6');
  if (btnTestS6) {
    btnTestS6.addEventListener('click', () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0] && tabs[0].id) {
          chrome.tabs.sendMessage(tabs[0].id, { action: "test_s6" }, () => {
            btnTestS6.style.borderColor = 'var(--success-color)';
            setTimeout(() => { btnTestS6.style.borderColor = ''; }, 1000);
          });
        }
      });
    });
  }

  if (btnCopyErrors) {
    btnCopyErrors.addEventListener('click', () => {
      chrome.storage.local.get(['runtimeErrors'], (res) => {
        const errs = res.runtimeErrors || [];
        const manifest = chrome.runtime.getManifest();
        
        let report = `=== YT ad watch & click 내부 오류 로그 ===\n`;
        report += `복사 시간: ${new Date().toLocaleString()}\n`;
        report += `[시스템 진단 팩트]\n`;
        report += ` - chrome.debugger API 활성 상태: ${typeof chrome.debugger !== 'undefined'}\n`;
        report += ` - manifest.json 선언 권한 목록: ${JSON.stringify(manifest.permissions || [])}\n`;
        report += ` - manifest.json 버전: ${manifest.version} (${manifest.version_name || 'N/A'})\n\n`;
        
        report += `[상세 오류 로그 목록]\n`;
        if (errs.length === 0) {
          report += `(기록된 내부 오류 로그가 존재하지 않습니다. 확장 프로그램이 정상 상태입니다.)`;
        } else {
          report += errs.join('\n\n');
        }
        
        navigator.clipboard.writeText(report).then(() => {
          const originalText = btnCopyErrors.innerHTML;
          btnCopyErrors.innerHTML = `<span>복사 완료!</span>`;
          btnCopyErrors.style.borderColor = 'var(--success-color)';
          setTimeout(() => {
            btnCopyErrors.innerHTML = originalText;
            btnCopyErrors.style.borderColor = '';
          }, 1200);
        });
      });
    });
  }

  // 6. 실시간 수치 갱신 리스너
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (changes.skippedCount) {
      const count = changes.skippedCount.newValue || 0;
      if (labelCopyHistory) {
        labelCopyHistory.textContent = `기록: Skip ${count}회`;
      }
    }
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
      updateClickSectionUI(changes.currentAdStatus.newValue || {});
      updateAdHighlight(changes.currentAdStatus.newValue || {});
    }
    if (changes.enforcementError) {
      if (changes.enforcementError.newValue) {
        reportEnforcementBtn.classList.add('guard-warning');
      } else {
        reportEnforcementBtn.classList.remove('guard-warning');
      }
    }
  });

  // 그룹 3: 실행 및 클릭 분석 UI 업데이트 함수
  function updateClickSectionUI(status) {
    if (!status) return;

    if (valClicked) {
      valClicked.textContent = status.clicked ? "실행 완료" : "대기 중";
    }
    if (valWarning) {
      valWarning.textContent = status.clickFailed ? "실패 경고" : "정상";
      if (status.clickFailed) {
        valWarning.style.color = 'var(--danger-color)';
      } else {
        valWarning.style.color = '';
      }
    }
    if (valDelay) {
      valDelay.textContent = status.clickDelay || "대기 중";
    }
    if (valCoordinates) {
      valCoordinates.textContent = status.clickCoordinates || "대기 중";
    }
  }

  // 신호등 UI 동적 제어 함수
  function updateLightsUI(status) {
    const keys = Object.keys(lights);
    keys.forEach(key => {
      const el = lights[key];
      if (!el) return;

      if (key === 'clickFailed') {
        // 실패 감지 신호등만 예외적으로 참일 때 붉은색(error) 경고등으로 작동
        if (status[key]) {
          el.classList.add('error');
          reportSkipFailedBtn.classList.add('failed-warning');
        } else {
          el.classList.remove('error');
          reportSkipFailedBtn.classList.remove('failed-warning');
        }
      } else if (key === 'timerCompleted') {
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
