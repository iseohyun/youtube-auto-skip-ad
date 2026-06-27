(() => {
  console.log("🚀 [YT Ad Full Watch] 유튜브 광고 정속 완독 확장 프로그램이 로드되었습니다!");

  let enabled = true;
  let adPlaying = false;      // 현재 광고가 재생 중인지 기록하는 상태 변수
  let lastCheckTime = null;   // 이전 프레임 시간 기록용 변수
  let clickScheduled = false; // 지연 클릭 스케줄 예약 상태 플래그

  // 음소거 제어 상태 변수
  let adMutedSet = false;
  let originalMuted = false;

  // 확장 프로그램 컨텍스트 유효성 검사 함수
  function isContextValid() {
    return typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
  }

  // 크로스 오리진 iframe 등 확장 프로그램 API 접근이 막힌 환경에서의 에러 방지 처리
  try {
    if (isContextValid() && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['enabled'], (result) => {
        if (!isContextValid()) return;
        if (result.enabled !== undefined) {
          enabled = result.enabled;
          console.log("🔍 [YT Ad Full Watch] 현재 작동 상태:", enabled ? "ON" : "OFF");
        }
      });

      chrome.storage.onChanged.addListener((changes, namespace) => {
        if (!isContextValid()) return;
        if (changes.enabled) {
          enabled = changes.enabled.newValue;
          console.log("🔄 [YT Ad Full Watch] 작동 상태 변경됨:", enabled ? "ON" : "OFF");
        }
      });
    }
  } catch (e) {
    console.warn("⚠️ [YT Ad Full Watch] 크롬 스토리지 접근 실패 (iframe 환경일 수 있습니다):", e);
  }

  // 이벤트 위임 및 마우스 클릭 시뮬레이션 (봇 감지 우회를 위해 영역 내 미세 랜덤 좌표 및 포커스 에뮬레이션)
  function simulateClick(element) {
    if (!element) return;
    try {
      // 클릭 대상 내부에 실제 현대식 스킵 버튼이 있다면, 더 구체적인 요소를 클릭 대상으로 선정
      const innerBtn = element.querySelector('.ytp-ad-skip-button-modern') || 
                       element.querySelector('.ytp-ad-skip-button') || 
                       element.querySelector('button') || 
                       element.querySelector('[class*="skip-button"]') ||
                       element.querySelector('[id*="skip"]');
      const targetEl = innerBtn || element;

      // 엘리먼트의 정확한 화면상 위치 및 크기 측정
      const rect = targetEl.getBoundingClientRect();
      
      // 버튼 크기 기준 가로/세로 20%~80% 범위 안에서 랜덤 오프셋 생성 (정중앙 클릭 패턴 우회)
      const randomXOffset = rect.width * (0.2 + Math.random() * 0.6);
      const randomYOffset = rect.height * (0.2 + Math.random() * 0.6);
      
      const clientX = rect.left + randomXOffset;
      const clientY = rect.top + randomYOffset;
      const screenX = (window.screenX || 0) + clientX;
      const screenY = (window.screenY || 0) + clientY;

      // 마우스 이벤트 옵션 설정 (실제 클릭 신호와 동일하도록 좌표 매핑)
      const eventOpts = {
        bubbles: true,
        cancelable: true,
        view: window,
        detail: 1,
        screenX: screenX,
        screenY: screenY,
        clientX: clientX,
        clientY: clientY,
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
        metaKey: false,
        button: 0,
        buttons: 1,
        relatedTarget: null
      };

      // 1. 요소에 인위적으로 포커스 설정
      if (typeof targetEl.focus === 'function') {
        targetEl.focus();
      }

      // 2. 표준 마우스 이벤트 시퀀스 전송
      targetEl.dispatchEvent(new MouseEvent('mousedown', eventOpts));
      targetEl.dispatchEvent(new MouseEvent('mouseup', eventOpts));
      targetEl.dispatchEvent(new MouseEvent('click', eventOpts));

      // 3. 빌트인 click() 메서드를 백업으로 호출
      if (typeof targetEl.click === 'function') {
        targetEl.click();
      }
    } catch (e) {
      console.error("⚠️ [YT Ad Full Watch] 클릭 시뮬레이션 중 에러 발생:", e);
    }
  }

  // 🛡️ 유튜브 차단 방패(경고창) 실시간 감지 및 로깅
  function detectEnforcementShield() {
    const shieldSelectors = [
      'ytd-enforcement-message-view-model',           // 최신 광고 차단 경고창
      'yt-playability-error-supported-renderers',     // 재생 불가 에러 레이아웃
      '.yt-playability-error-supported-renderers',
      'tp-yt-paper-dialog'                             // 일반 다이얼로그 경고창
    ];

    for (const selector of shieldSelectors) {
      try {
        const shieldEl = document.querySelector(selector);
        // 경고창이 화면상에 실재하며 노출되고 있는지 확인
        if (shieldEl && (shieldEl.offsetWidth > 0 || shieldEl.offsetHeight > 0)) {
          if (!shieldEl.dataset.logged) {
            shieldEl.dataset.logged = 'true';
            console.warn(`🚨 [YT Ad Full Watch] 유튜브 차단 방패(가드) 감지됨! (셀렉터: ${selector})`);
            
            const htmlSnippet = shieldEl.outerHTML.substring(0, 1500);
            
            // 스토리지에 에러 기록 저장
            if (isContextValid() && chrome.storage && chrome.storage.local) {
              const now = new Date();
              const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
              const errorInfo = {
                time: timeStr,
                selector: selector,
                html: htmlSnippet
              };
              chrome.storage.local.set({ enforcementError: errorInfo });
            }
          }
          break;
        }
      } catch (e) {
        // 예외 무시
      }
    }
  }

  // 광고 감지 및 스킵 메인 로직
  function checkAndSkipAds() {
    if (!isContextValid()) return;

    detectEnforcementShield();

    if (!enabled) return;

    const player = document.querySelector('.html5-video-player');
    const video = document.querySelector('video');

    // 실제 시청 시간 및 광고 소비 시간 측정 로직
    if (player && video && !video.paused) {
      const now = Date.now();
      if (lastCheckTime) {
        const delta = (now - lastCheckTime) / 1000;
        if (delta < 2) {
          if (player.classList.contains('ad-showing')) {
            // 광고 시청 대기 시간 누적
            if (isContextValid() && chrome.storage && chrome.storage.local) {
              chrome.storage.local.get(['adTimeWasted'], (res) => {
                if (!isContextValid()) return;
                const total = (res.adTimeWasted || 0) + delta;
                chrome.storage.local.set({ adTimeWasted: total });
              });
            }
          } else {
            // 실제 유튜브 비디오 시청 시간 누적
            if (isContextValid() && chrome.storage && chrome.storage.local) {
              chrome.storage.local.get(['videoTimeWatched'], (res) => {
                if (!isContextValid()) return;
                const total = (res.videoTimeWatched || 0) + delta;
                chrome.storage.local.set({ videoTimeWatched: total });
              });
            }
          }
        }
      }
      lastCheckTime = now;
    } else {
      lastCheckTime = null;
    }

    if (player && player.classList.contains('ad-showing')) {
      // 광고 재생 상태로 감지됨
      adPlaying = true;

      // 0단계: 광고가 나오면 자동으로 음소거하고, 원래 음소거 상태를 백업
      if (video) {
        try {
          if (!adMutedSet) {
            originalMuted = video.muted;
            adMutedSet = true;
            video.muted = true;
            console.log(`🔇 [YT Ad Full Watch] 광고 진입: 자동 음소거 활성화 (원래 음소거 상태: ${originalMuted})`);
          } else if (!video.muted) {
            // 유튜브 내부 플레이어 스크립트가 강제로 음소거를 해제하는 현상 방지
            video.muted = true;
          }
        } catch (muteErr) {
          console.warn("⚠️ [YT Ad Full Watch] 음소거 제어 중 에러 발생:", muteErr);
        }
      }

      // 1단계: 현대식 스킵 버튼이 돔에 존재하지만, 아직 활성화되지 않은 카운트다운 단계인지 정밀 진단
      const skipBtnModern = player.querySelector('.ytp-ad-skip-button-modern') || player.querySelector('.ytp-ad-skip-button');
      if (skipBtnModern) {
        const style = window.getComputedStyle(skipBtnModern);
        const opacity = parseFloat(style.opacity || '1');
        const isHidden = style.display === 'none' || style.visibility === 'hidden' || 
                         (skipBtnModern.offsetWidth === 0 && skipBtnModern.offsetHeight === 0);
        
        // 현대식 스킵 버튼이 비활성(카운트다운 중) 상태라면 성급하게 바깥 컨테이너를 클릭하지 않고 완독 대기
        if (opacity <= 0.8 || isHidden) {
          return;
        }
      }

      // 2단계: 광고 건너뛰기 버튼 존재 여부 확인 및 클릭 시도
      const selectors = [
        '.ytp-ad-skip-button-modern',
        '.ytp-skip-ad-button',
        '.ytp-ad-skip-button',
        '[class*="ytp-ad-skip-button"]',
        '[class*="ytp-skip-ad-button"]',
        '[id^="skip-button:"]',
        'button[aria-label*="Skip"]',
        'button[aria-label*="건너뛰기"]'
      ];

      for (const selector of selectors) {
        try {
          // 오직 비디오 플레이어 내부에 위치한 버튼만 조회
          const btn = player.querySelector(selector);

          // 최소화 방어 조치: 버튼이 존재하고, 크기가 있거나, offsetParent가 있거나, CSS상 display none/visibility hidden이 아닐 때
          if (btn && (
            btn.offsetWidth > 0 || 
            btn.offsetHeight > 0 || 
            btn.offsetParent !== null ||
            (window.getComputedStyle(btn).display !== 'none' && window.getComputedStyle(btn).visibility !== 'hidden')
          )) {
            // 카운트다운 진행 중(텍스트 내 숫자 포함 여부) 판별
            const text = btn.textContent || "";
            if (/\d/.test(text)) {
              // 텍스트 내 숫자가 있다면 아직 카운트다운 중이므로 시도하지 않음
              continue;
            }

            // 카운트다운 진행 중(opacity: 0.5 등)인지 실제 클릭 활성화 상태(opacity: 1)인지 판별
            const style = window.getComputedStyle(btn);
            const opacity = parseFloat(style.opacity || '1');

            // 불투명도가 0.8보다 큰 경우(카운트다운이 끝나고 활성화된 상태)에만 클릭을 시도
            if (opacity > 0.8) {
              // 타이밍 추적을 회피하기 위해 인간다운 1.0초 ~ 2.5초 지연 시간 랜덤 생성 후 실행
              if (!clickScheduled) {
                clickScheduled = true;
                const delay = 1000 + Math.random() * 1500;
                console.log(`⏳ [YT Ad Full Watch] 활성화된 스킵 버튼 감지! ${Math.round(delay)}ms 후 인간다운 타이밍으로 클릭 예정...`);

                setTimeout(() => {
                  if (!isContextValid()) return;
                  
                  // 딜레이 후 실행 시점에도 여전히 버튼이 존재하는지 재검증
                  const currentBtn = player.querySelector(selector);
                  if (currentBtn && (
                    currentBtn.offsetWidth > 0 || 
                    currentBtn.offsetHeight > 0 || 
                    currentBtn.offsetParent !== null ||
                    (window.getComputedStyle(currentBtn).display !== 'none' && window.getComputedStyle(currentBtn).visibility !== 'hidden')
                  )) {
                    simulateClick(currentBtn);
                    console.log(`🎯 [YT Ad Full Watch] 지연 클릭 실행 완료! (셀렉터: ${selector})`);

                    // 클릭이 수행된 정확한 시스템 시간 기록 저장
                    try {
                      if (isContextValid() && chrome.storage && chrome.storage.local) {
                        chrome.storage.local.get(['skipLogs'], (res) => {
                          if (!isContextValid()) return;
                          let logs = res.skipLogs || [];
                          const d = new Date();
                          const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
                          logs.unshift(timeStr);
                          if (logs.length > 5) {
                            logs = logs.slice(0, 5);
                          }
                          chrome.storage.local.set({ skipLogs: logs });
                        });
                      }
                    } catch (err) {
                      console.warn("⚠️ [YT Ad Full Watch] 최근 클릭 타임스탬프 기록 실패:", err);
                    }
                  }
                  clickScheduled = false; // 스케줄 상태 리셋
                }, delay);
              }
              break;
            }
          }
        } catch (e) {
          // 예외 무시
        }
      }
    } else {
      // 광고가 재생되고 있지 않은 평상시 상태
      if (adPlaying) {
        adPlaying = false;
        clickScheduled = false; // 광고가 해제되면 혹시 남아있을 대기 스케줄 즉시 초기화
        console.log("🎉 [YT Ad Full Watch] 광고 건너뛰기 완료!");

        // 광고가 끝났으니 원래 음소거 상태 복원
        if (adMutedSet && video) {
          try {
            video.muted = originalMuted;
            console.log(`🔊 [YT Ad Full Watch] 본 영상 복귀: 음소거 복원 완료 (원래 음소거 상태로 복귀: ${originalMuted})`);
          } catch (restoreErr) {
            console.warn("⚠️ [YT Ad Full Watch] 음소거 복원 실패:", restoreErr);
          }
        }
        adMutedSet = false;

        if (isContextValid() && chrome.storage && chrome.storage.local) {
          chrome.storage.local.get(['skippedCount'], (res) => {
            if (!isContextValid()) return;
            const count = (res.skippedCount || 0) + 1;
            chrome.storage.local.set({ skippedCount: count }, () => {
              console.log(`📈 [YT Ad Full Watch] 누적 스킵 횟수 업데이트 (누적: ${count}회)`);
            });
          });
        }
      }
    }
  }

  // DOM 변화를 실시간으로 감지하여 광고 즉시 감지 (CPU 리소스 최적화)
  const observer = new MutationObserver(() => {
    if (!isContextValid()) {
      observer.disconnect();
      return;
    }
    checkAndSkipAds();
  });

  // 유튜브 플레이어가 로딩될 것을 대비하여 document 레벨에서 전체 구조 감시
  observer.observe(document.documentElement || document.body || document, {
    childList: true,
    subtree: true
  });

  // 백업용 1초 폴링 (동적 스크립트 실행으로 인한 옵저버 누락 방지 및 컨텍스트 무효화 감지 시 클리어)
  const intervalId = setInterval(() => {
    if (!isContextValid()) {
      clearInterval(intervalId);
      return;
    }
    checkAndSkipAds();
  }, 1000);

})();
