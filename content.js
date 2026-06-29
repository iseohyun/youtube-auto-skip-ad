(() => {
  // 에러 로깅 시스템
  function logErrorToStorage(msg, stack) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const errStr = `[${new Date().toLocaleTimeString()}] [Content] ${msg}\nStack: ${stack || 'N/A'}`;
      chrome.storage.local.get(['runtimeErrors'], (res) => {
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
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

  console.log("🚀 [YT ad watch & click] 유튜브 광고 정속 완독 확장 프로그램이 로드되었습니다!");

  let enabled = true;
  let adPlaying = false;      // 현재 광고가 재생 중인지 기록하는 상태 변수
  let lastCheckTime = null;   // 이전 프레임 시간 기록용 변수
  let clickScheduled = false; // 지연 클릭 스케줄 예약 상태 플래그
  let s1BackupTimer = null;
  let lastAdVisibilityChangeTime = null;
  let observerAttached = false;
  let observer = null;

  // 현재 비디오 세션 시청 시간 및 광고 시청 시간
  let currentVideoTime = 0;
  let currentAdTime = 0;
  let lastUrl = location.href;

  // 음소거 제어 상태 변수
  let adMutedSet = false;
  let originalMuted = false;

  // 확장 프로그램 컨텍스트 유효성 검사 함수
  function isContextValid() {
    return typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
  }

  // 광고 감지 여부를 다각도로 정밀 진단하는 함수
  function isAdActive() {
    // 1. 플레이어 클래스 검사
    const player = document.querySelector('.html5-video-player');
    if (player && (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting'))) {
      return true;
    }
    if (document.querySelector('.ad-showing') || document.querySelector('.ad-interrupting')) {
      return true;
    }
    
    // 2. 광고 모듈 내 자식 요소 존재 여부 (자식이 하나라도 생겨나면 무조건 광고임!)
    const adModule = document.querySelector('.video-ads.ytp-ad-module');
    if (adModule && adModule.children.length > 0) {
      return true;
    }
    
    // 3. 광고용 오버레이나 각종 헤더/프리뷰 요소가 존재할 경우
    if (document.querySelector('.ytp-ad-player-overlay') || 
        document.querySelector('[class*="ad-player-overlay"]') ||
        document.querySelector('.ytp-ad-simple-ad-header') ||
        document.querySelector('.ytp-ad-preview-container') ||
        document.querySelector('.ytp-ad-message-container')) {
      return true;
    }
    
    // 4. 스킵 버튼이 돔에 존재하는 경우
    if (document.querySelector('.ytp-skip-ad-button') || 
        document.querySelector('.ytp-ad-skip-button-modern') ||
        document.querySelector('.ytp-ad-skip-button')) {
      return true;
    }
    
    return false;
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
    console.log("ℹ️ [YT Ad Full Watch] 크롬 스토리지 접근 실패 (iframe 환경일 수 있습니다):", e);
  }

  // 마우스 호버 진입 시뮬레이션 (mouseover -> mouseenter)
  function simulateHover(element) {
    if (!element) return;
    try {
      const innerBtn = element.querySelector('.ytp-ad-skip-button-modern') || 
                       element.querySelector('.ytp-ad-skip-button') || 
                       element.querySelector('.ytp-ad-skip-button-text') ||
                       element.querySelector('button') || 
                       element.querySelector('[class*="skip-button"]') ||
                       element.querySelector('[id*="skip"]');
      const targetEl = innerBtn || element;

      const rect = targetEl.getBoundingClientRect();
      const randomXOffset = rect.width * (0.2 + Math.random() * 0.6);
      const randomYOffset = rect.height * (0.2 + Math.random() * 0.6);
      const clientX = rect.left + randomXOffset;
      const clientY = rect.top + randomYOffset;
      const screenX = (window.screenX || 0) + clientX;
      const screenY = (window.screenY || 0) + clientY;

      const eventOpts = {
        bubbles: true,
        cancelable: true,
        view: window,
        detail: 0,
        screenX: screenX,
        screenY: screenY,
        clientX: clientX,
        clientY: clientY,
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
        metaKey: false,
        button: 0,
        buttons: 0,
        relatedTarget: null
      };

      // 알맹이 버튼 호버
      targetEl.dispatchEvent(new MouseEvent('mouseover', eventOpts));
      targetEl.dispatchEvent(new MouseEvent('mouseenter', eventOpts));

      // 컨테이너가 다를 경우 컨테이너도 이중 호버
      if (targetEl !== element) {
        element.dispatchEvent(new MouseEvent('mouseover', eventOpts));
        element.dispatchEvent(new MouseEvent('mouseenter', eventOpts));
      }
    } catch (e) {
      console.log("ℹ️ [YT Ad Full Watch] 호버 시뮬레이션 중 에러:", e);
    }
  }

  // 이벤트 위임 및 마우스 클릭 시뮬레이션 (mousedown -> mouseup -> click 순차 모사)
  function simulateClick(element) {
    if (!element) return;
    try {
      const innerBtn = element.querySelector('.ytp-ad-skip-button-modern') || 
                       element.querySelector('.ytp-ad-skip-button') || 
                       element.querySelector('.ytp-ad-skip-button-text') ||
                       element.querySelector('button') || 
                       element.querySelector('[class*="skip-button"]') ||
                       element.querySelector('[id*="skip"]');
      const targetEl = innerBtn || element;

      const rect = targetEl.getBoundingClientRect();
      const randomXOffset = rect.width * (0.2 + Math.random() * 0.6);
      const randomYOffset = rect.height * (0.2 + Math.random() * 0.6);
      const clientX = rect.left + randomXOffset;
      const clientY = rect.top + randomYOffset;
      const screenX = (window.screenX || 0) + clientX;
      const screenY = (window.screenY || 0) + clientY;

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

      // PointerEvent 전용 옵션 구성 (W3C 규격 준수)
      const pointerOpts = Object.assign({}, eventOpts, {
        pointerId: 1,
        width: 1,
        height: 1,
        pressure: 0.5,
        tiltX: 0,
        tiltY: 0,
        pointerType: "mouse",
        isPrimary: true
      });

      if (typeof targetEl.focus === 'function') {
        targetEl.focus();
      }

      // 1중 레이어: 하위 텍스트 노드 및 자식 요소 클릭 분산
      const textChild = targetEl.querySelector('.ytp-skip-ad-button__text') || 
                        targetEl.querySelector('[class*="text"]') ||
                        targetEl.querySelector('div') ||
                        targetEl.firstElementChild;
      if (textChild) {
        textChild.dispatchEvent(new PointerEvent('pointerdown', pointerOpts));
        textChild.dispatchEvent(new MouseEvent('mousedown', eventOpts));
        textChild.dispatchEvent(new PointerEvent('pointerup', pointerOpts));
        textChild.dispatchEvent(new MouseEvent('mouseup', eventOpts));
        textChild.dispatchEvent(new MouseEvent('click', eventOpts));
      }

      // 2중 레이어: 알맹이 버튼 본체 클릭
      targetEl.dispatchEvent(new PointerEvent('pointerdown', pointerOpts));
      targetEl.dispatchEvent(new MouseEvent('mousedown', eventOpts));
      targetEl.dispatchEvent(new PointerEvent('pointerup', pointerOpts));
      targetEl.dispatchEvent(new MouseEvent('mouseup', eventOpts));
      targetEl.dispatchEvent(new MouseEvent('click', eventOpts));
      if (typeof targetEl.click === 'function') {
        targetEl.click();
      }

      // 3중 레이어: 상위 슬롯 컨테이너 및 최외각 요소 클릭 분산
      const parentSlot = targetEl.closest('.ytp-ad-skip-button-slot') || 
                         targetEl.closest('.ytp-skip-ad-button-container') ||
                         targetEl.parentElement;
      if (parentSlot) {
        parentSlot.dispatchEvent(new PointerEvent('pointerdown', pointerOpts));
        parentSlot.dispatchEvent(new MouseEvent('mousedown', eventOpts));
        parentSlot.dispatchEvent(new PointerEvent('pointerup', pointerOpts));
        parentSlot.dispatchEvent(new MouseEvent('mouseup', eventOpts));
        parentSlot.dispatchEvent(new MouseEvent('click', eventOpts));
        if (typeof parentSlot.click === 'function') {
          parentSlot.click();
        }
      }

      // 컨테이너가 다를 경우 컨테이너도 이중 클릭 백업
      if (targetEl !== element) {
        element.dispatchEvent(new PointerEvent('pointerdown', pointerOpts));
        element.dispatchEvent(new MouseEvent('mousedown', eventOpts));
        element.dispatchEvent(new PointerEvent('pointerup', pointerOpts));
        element.dispatchEvent(new MouseEvent('mouseup', eventOpts));
        element.dispatchEvent(new MouseEvent('click', eventOpts));
        if (typeof element.click === 'function') {
          element.click();
        }
      }
    } catch (e) {
      console.log("ℹ️ [YT Ad Full Watch] 클릭 시뮬레이션 중 에러 발생:", e);
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
            console.log(`🚨 [YT Ad Full Watch] 유튜브 차단 방패(가드) 감지됨! (셀렉터: ${selector})`);
            
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

  // ⏱️ 현재 재생 시간 정보(프로그래스바, 타이머 등) HTML 구조 추출 함수
  function captureTimeInfoHtml(player) {
    if (!player) return "";
    const selectors = [
      '.ytp-time-display',
      '.ytp-progress-bar-container',
      '.ytp-ad-preview-container',
      '.ytp-ad-duration-remaining',
      '.ytp-ad-preview-text',
      '.ytp-ad-preview-text-modern'
    ];
    let htmlSnippet = "";
    for (const selector of selectors) {
      try {
        const el = player.querySelector(selector);
        if (el) {
          htmlSnippet += `\n[Selector: ${selector}]\n${el.outerHTML.substring(0, 2000)}\n`;
        }
      } catch (e) {}
    }
    return htmlSnippet;
  }

  let clickExecutedTime = null;
  let clickFailedDetected = false;
  let lastStatusJson = "";
  let lastButtonDetectedTime = 0;
  let scheduledDelaySec = "";
  let scheduledCoordinates = "";

  function formatFullTime(d) {
    if (!d) return "";
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
  let lastKnownStatus = {
    tagDetected: false,
    rectFound: false,
    visible: false,
    timerCompleted: false,
    opacityNormal: false,
    notDisabled: false,
    clicked: false,
    clickFailed: false,
    enforcementShield: false,
    remainingTime: null
  };

  // 실시간 광고 분석 상태 보관 및 전송
  function updateAdStatus(newStatus) {
    const json = JSON.stringify(newStatus);
    if (json !== lastStatusJson) {
      lastStatusJson = json;
      try {
        if (isContextValid() && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ currentAdStatus: newStatus });
        }
      } catch (err) {
        // ignore
      }
    }
  }

  // 광고 감지 및 스킵 메인 로직
  function checkAndSkipAds() {
    if (!isContextValid()) return;

    detectEnforcementShield();

    if (!enabled) return;

    // URL 변경 및 비디오 교체 감지
    if (location.href !== lastUrl) {
      const oldUrl = lastUrl;
      lastUrl = location.href;
      
      // 이전 비디오에 시청 기록이 있는 경우 history에 저장
      if (currentVideoTime > 0 || currentAdTime > 0) {
        // 비디오 제목 가져오기
        const titleEl = document.querySelector('ytd-watch-metadata h1.ytd-watch-metadata') || 
                        document.querySelector('h1.title.style-scope.ytd-video-primary-info-renderer') ||
                        document.querySelector('.ytp-title-link');
        const title = titleEl ? titleEl.textContent.trim() : "제목 없는 비디오";
        
        const historyItem = {
          title: title,
          url: oldUrl,
          timestamp: formatFullTime(new Date()),
          watchTime: Math.round(currentVideoTime),
          adTime: Math.round(currentAdTime)
        };
        
        if (isContextValid() && chrome.storage && chrome.storage.local) {
          chrome.storage.local.get(['watchHistory'], (res) => {
            if (!isContextValid()) return;
            const history = res.watchHistory || [];
            history.unshift(historyItem);
            // 최대 50개 유지
            if (history.length > 50) {
              history.splice(50);
            }
            chrome.storage.local.set({ watchHistory: history });
          });
        }
      }
      
      // 세션 시간 초기화
      currentVideoTime = 0;
      currentAdTime = 0;
      if (isContextValid() && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ 
          currentVideoTime: 0, 
          currentAdTime: 0 
        });
      }
    }

    const player = document.querySelector('.html5-video-player');
    let video = null;
    if (player) {
      const playerVideos = player.querySelectorAll('video');
      if (playerVideos.length === 1) {
        video = playerVideos[0];
      } else if (playerVideos.length > 1) {
        video = Array.from(playerVideos).find(v => !v.paused && v.src) || playerVideos[0];
      }
    }
    if (!video) {
      video = document.querySelector('video');
    }

    // 실제 시청 시간 및 광고 소비 시간 측정 로직
    if (player && video && !video.paused) {
      const now = Date.now();
      if (lastCheckTime) {
        const delta = (now - lastCheckTime) / 1000;
        if (delta < 2) {
          if (isAdActive()) {
            // 광고 시청 대기 시간 누적
            currentAdTime += delta;
            if (isContextValid() && chrome.storage && chrome.storage.local) {
              chrome.storage.local.get(['adTimeWasted'], (res) => {
                if (!isContextValid()) return;
                const total = (res.adTimeWasted || 0) + delta;
                chrome.storage.local.set({ 
                  adTimeWasted: total,
                  currentAdTime: currentAdTime
                });
              });
            }
          } else {
            // 실제 유튜브 비디오 시청 시간 누적
            currentVideoTime += delta;
            if (isContextValid() && chrome.storage && chrome.storage.local) {
              chrome.storage.local.get(['videoTimeWatched'], (res) => {
                if (!isContextValid()) return;
                const total = (res.videoTimeWatched || 0) + delta;
                chrome.storage.local.set({ 
                  videoTimeWatched: total,
                  currentVideoTime: currentVideoTime
                });
              });
            }
          }
        }
      }
      lastCheckTime = now;
    } else {
      lastCheckTime = null;
    }

    // 유튜브 차단 가드(경고창) 실시간 감지 여부
    let shieldDetected = false;
    const shieldSelectors = [
      'ytd-enforcement-message-view-model',
      'yt-playability-error-supported-renderers',
      '.yt-playability-error-supported-renderers'
    ];
    for (const selector of shieldSelectors) {
      const shieldEl = document.querySelector(selector);
      if (shieldEl && (shieldEl.offsetWidth > 0 || shieldEl.offsetHeight > 0)) {
        shieldDetected = true;
        break;
      }
    }

    if (isAdActive()) {
      adPlaying = true;

      // 0.5단계: 연속 광고 및 광고 상태 전환 리셋 감지
      if (clickExecutedTime !== null) {
        const testBtn = player.querySelector('.ytp-skip-ad-button') || 
                        player.querySelector('.ytp-ad-skip-button-modern') || 
                        player.querySelector('.ytp-ad-skip-button') || 
                        player.querySelector('[class*="skip-ad-button"]');
        const isVisible = testBtn && testBtn.offsetWidth > 0 && 
                          window.getComputedStyle(testBtn).display !== 'none' && 
                          window.getComputedStyle(testBtn).visibility !== 'hidden';
        
        const prog = player.querySelector('.ytp-progress-bar');
        const nowVal = prog ? parseInt(prog.getAttribute('aria-valuenow') || '0', 10) : 0;
        const maxVal = prog ? parseInt(prog.getAttribute('aria-valuemax') || '5', 10) : 5;
        const isTimerCompleted = prog ? (nowVal === maxVal) : false;

        if (!isVisible || !isTimerCompleted) {
          clickExecutedTime = null;
          clickFailedDetected = false;
          console.log("🔄 [YT Ad Full Watch] 광고 전환 감지: 클릭 상태 리셋");
        }
      }

      // 0단계: 광고가 나오면 자동으로 음소거하고, 원래 음소거 상태를 백업
      if (video) {
        try {
          if (!adMutedSet) {
            originalMuted = video.muted;
            adMutedSet = true;
            video.muted = true;
            console.log(`🔇 [YT Ad Full Watch] 광고 진입: 자동 음소거 활성화 (원래 음소거 상태: ${originalMuted})`);
          } else if (!video.muted) {
            video.muted = true;
          }
        } catch (muteErr) {
          console.log("ℹ️ [YT Ad Full Watch] 음소거 제어 중 에러 발생:", muteErr);
        }
      }

      // 실시간 진단 신호등 상태 구조체 구성
      let status = {
        adPlaying: adPlaying,
        tagDetected: false,
        rectFound: false,
        visible: false,
        videoPlaying: video ? (!video.paused && !video.ended) : false,
        timerCompleted: false,
        opacityNormal: false,
        notDisabled: false,
        classClickable: false,
        clicked: clickExecutedTime !== null,
        clickFailed: false,
        enforcementShield: shieldDetected,
        remainingTime: null,
        progressPercent: 0,
        clickDelay: scheduledDelaySec ? `${scheduledDelaySec}초` : "대기 중",
        clickCoordinates: scheduledCoordinates || "대기 중"
      };

      // 클릭 시뮬레이션 후 3.5초가 넘게 흘렀는데도 여전히 광고 재생 상태(ad-showing)가 유지되는지 확인
      if (clickExecutedTime !== null && (Date.now() - clickExecutedTime > 3500)) {
        clickFailedDetected = true;
      }
      if (clickExecutedTime !== null && (Date.now() - clickExecutedTime > 5000)) {
        console.log("🔄 [YT ad watch & click] 클릭 후 5초가 경과했으나 여전히 광고 중입니다. 재시도를 위해 클릭 락을 해제합니다.");
        clickExecutedTime = null;
        clickScheduled = false;
      }
      status.clickFailed = clickFailedDetected;

      const countdownSelectors = [
        '.ytp-ad-preview-text',
        '.ytp-ad-preview-text-modern',
        '.ytp-ad-preskip-text',
        '.ytp-ad-preskip-text-modern'
      ];

      const selectors = [
        '.ytp-ad-skip-button-modern',   // 최신형 현대식 버튼
        '.ytp-ad-skip-button',          // 전통적 클래식 버튼
        '.ytp-ad-skip-button-text',     // 버튼 내부 텍스트 노드
        'button[class*="skip-button"]',
        'button[aria-label*="Skip"]',
        'button[aria-label*="건너뛰기"]',
        '.ytp-skip-ad-button',          // 컨테이너 (최후 보루)
        '[class*="ytp-skip-ad-button"]' // 컨테이너 (최후 보루)
      ];

      // DOM 내에 존재하는 첫 번째 후보 버튼 요소 탐색
      let targetBtn = null;
      let matchedSelector = null;
      for (const selector of selectors) {
        const btn = player.querySelector(selector);
        if (btn) {
          targetBtn = btn;
          matchedSelector = selector;
          break;
        }
      }

      // 버튼 감지 스무딩 처리 (Polymer 렌더링에 따른 일시적 탈부착/깜빡임 방지)
      if (targetBtn) {
        lastButtonDetectedTime = Date.now();
      }
      const isBtnRecentlyDetected = (targetBtn !== null) || (Date.now() - lastButtonDetectedTime < 500);

      if (isBtnRecentlyDetected) {
        status.tagDetected = true;

        if (targetBtn) {
          // 1. 물리적 화면 노출 여부 검증 (Strict Rendering)
          const rect = targetBtn.getBoundingClientRect();
          status.rectFound = rect.width > 0 && rect.height > 0;
          
          const style = window.getComputedStyle(targetBtn);
          status.visible = style.display !== 'none' && style.visibility !== 'hidden';

          // 2. 비활성화 속성 검증 (disabled 혹은 aria-disabled="true")
          status.notDisabled = !targetBtn.disabled && targetBtn.getAttribute('aria-disabled') !== 'true';

          // 3. 타이머 및 재생 진행률 파악 (카운트다운 엘리먼트 및 스킵 버튼 텍스트 기반)
          let remainingSec = null;
          let percent = 0;
          let countdownActive = false;

          for (const sel of countdownSelectors) {
            const countdownEl = player.querySelector(sel);
            if (countdownEl) {
              const cRect = countdownEl.getBoundingClientRect();
              if (cRect.width > 0 && cRect.height > 0 && window.getComputedStyle(countdownEl).display !== 'none') {
                countdownActive = true;
                const textVal = countdownEl.textContent || "";
                const numMatch = textVal.match(/\d+/);
                if (numMatch) {
                  remainingSec = parseInt(numMatch[0], 10);
                }
                break;
              }
            }
          }

          const text = targetBtn.textContent || "";
          const hasDigits = /\d/.test(text);
          status.timerCompleted = !countdownActive && !hasDigits;
          status.remainingTime = status.timerCompleted ? null : remainingSec;

          if (remainingSec !== null) {
            percent = Math.min(100, Math.max(0, ((5 - remainingSec) / 5) * 100));
          } else {
            percent = status.timerCompleted ? 100 : 0;
          }
          status.progressPercent = status.timerCompleted ? 100 : percent;

          // 4. 불투명도 검증 (opacity > 0.1)
          status.opacityNormal = parseFloat(style.opacity || '1') > 0.1;

          // 5. 클릭 가능 상태 검증 (커서 스타일이 pointer이거나 ytp-ad-component--clickable가 존재할 경우)
          const cursorStyle = style.cursor || "";
          const hasClickableCursor = (cursorStyle === 'pointer');
          const hasClickableClass = targetBtn.classList.contains('ytp-ad-component--clickable');
          status.classClickable = hasClickableCursor || hasClickableClass;

          // 상태가 성공적으로 확인되었으므로 최종 캐시 저장
          lastKnownStatus = {
            tagDetected: status.tagDetected,
            rectFound: status.rectFound,
            visible: status.visible,
            videoPlaying: status.videoPlaying,
            timerCompleted: status.timerCompleted,
            opacityNormal: status.opacityNormal,
            notDisabled: status.notDisabled,
            classClickable: status.classClickable,
            clicked: status.clicked,
            clickFailed: status.clickFailed,
            enforcementShield: status.enforcementShield,
            remainingTime: status.remainingTime
          };

          // 제보용 현재 스킵 영역 HTML 구조 및 재생 시간 정보 구조 저장
          const skipSlot = player.querySelector('.ytp-ad-skip-button-slot') || 
                           player.querySelector('.ytp-skip-ad-button') || 
                           player.querySelector('[class*="skip-ad-button"]') ||
                           targetBtn;
          if (skipSlot) {
            try {
              const adHtml = skipSlot.outerHTML.substring(0, 2000);
              const timeHtml = captureTimeInfoHtml(player);
              if (isContextValid() && chrome.storage && chrome.storage.local) {
                chrome.storage.local.set({ 
                  lastAdHtml: adHtml,
                  lastAdTimeHtml: timeHtml
                });
              }
            } catch (e) {}
          }
        } else {
          // 버튼이 일시적으로 리렌더링(500ms 미만) 상태일 때는 이전 캐시 상태값을 그대로 복원해 텔레메트리 흔들림 방지
          status.rectFound = lastKnownStatus.rectFound;
          status.visible = lastKnownStatus.visible;
          status.videoPlaying = lastKnownStatus.videoPlaying;
          status.timerCompleted = lastKnownStatus.timerCompleted;
          status.opacityNormal = lastKnownStatus.opacityNormal;
          status.notDisabled = lastKnownStatus.notDisabled;
          status.classClickable = lastKnownStatus.classClickable;
          status.remainingTime = lastKnownStatus.remainingTime;
        }
      }

      // 실시간 상태 스토리지 갱신
      updateAdStatus(status);

      // 모든 필수 감지 조건(클릭 가능 클래스 포함)이 충족되었을 경우에만 스킵 클릭 스케줄러 기동
      if (targetBtn && status.rectFound && status.visible && status.timerCompleted && status.opacityNormal && status.notDisabled && status.classClickable) {
        if (!clickScheduled && !clickExecutedTime) {
          clickScheduled = true;
          const delay = 1000 + Math.random() * 1500; // 1.0초 ~ 2.5초 사이의 무작위 대기 시간
          const hoverDuration = 150 + Math.random() * 350; // 0.15초 ~ 0.5초 사이의 무작위 호버 유지 시간
          const hoverDelay = delay - hoverDuration;

          scheduledDelaySec = (delay / 1000).toFixed(2);
          const rect = targetBtn.getBoundingClientRect();
          const pctX = 20 + Math.round(Math.random() * 60);
          const pctY = 20 + Math.round(Math.random() * 60);
          scheduledCoordinates = `X:+${pctX}%, Y:+${pctY}%`;

          // 조건 만족 시각 기록
          if (isContextValid() && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({ lastConditionPassTime: formatFullTime(new Date()) });
          }

          console.log(`⏳ [YT Ad Full Watch] 활성화된 스킵 버튼 감지! ${Math.round(hoverDelay)}ms 후 호버 진입, ${Math.round(delay)}ms 후 클릭 예정...`);

          // 1. 호버 진입 시뮬레이션 예약
          setTimeout(() => {
            if (!isContextValid()) return;
            const currentBtn = player.querySelector(matchedSelector);
            if (currentBtn) {
              const currentRect = currentBtn.getBoundingClientRect();
              const currentVisible = currentRect.width > 0 && currentRect.height > 0 && 
                                     window.getComputedStyle(currentBtn).display !== 'none' && 
                                     window.getComputedStyle(currentBtn).visibility !== 'hidden';
              if (currentVisible && !currentBtn.disabled && currentBtn.getAttribute('aria-disabled') !== 'true') {
                simulateHover(currentBtn);
              }
            }
          }, hoverDelay);

          // 2. 최종 마우스 클릭 시뮬레이션 예약 (클릭 직전 투명도 및 클래스 최종 검증)
          setTimeout(() => {
            if (!isContextValid()) return;
            const currentBtn = player.querySelector(matchedSelector);
            if (currentBtn) {
              const currentStyle = window.getComputedStyle(currentBtn);
              const currentRect = currentBtn.getBoundingClientRect();
              
              const rectFound = currentRect.width > 0 && currentRect.height > 0;
              const visible = currentStyle.display !== 'none' && currentStyle.visibility !== 'hidden';
              const opacityNormal = parseFloat(currentStyle.opacity || '1') > 0.1;
              const notDisabled = !currentBtn.disabled && currentBtn.getAttribute('aria-disabled') !== 'true';
              
              const currentCursor = currentStyle.cursor || "";
              const classClickable = (currentCursor === 'pointer') || currentBtn.classList.contains('ytp-ad-component--clickable');

              // 클릭 실행 직전에 투명도 및 클래스가 활성화(ON) 상태인지 2차 최종 검증!
              if (rectFound && visible && opacityNormal && notDisabled && classClickable) {
                simulateClick(currentBtn);
                clickExecutedTime = Date.now(); // 클릭 수행 시점 기록
                
                // 클릭 시도 시각 기록
                if (isContextValid() && chrome.storage && chrome.storage.local) {
                  chrome.storage.local.set({ lastClickAttemptTime: formatFullTime(new Date()) });
                }

                console.log(`🎯 [YT ad watch & click] 지연 클릭 실행 완료! (셀렉터: ${matchedSelector})`);

                // 일반 클릭 시도 후 1초 뒤 여전히 광고 활성 상태인지 점검하여 S1 디버거 자동 기동
                if (s1BackupTimer) clearTimeout(s1BackupTimer);
                s1BackupTimer = setTimeout(() => {
                  const checkPlayer = document.querySelector('.html5-video-player');
                  if (isContextValid() && isAdActive()) {
                    const testBtn = findSkipButton();
                    if (testBtn) {
                      const rect = testBtn.getBoundingClientRect();
                      const x = rect.left + rect.width / 2;
                      const y = rect.top + rect.height / 2;
                      console.log("⚠️ [YT ad watch & click] 일반 클릭 실행 1초 경과 후에도 광고 중포착! S1 디버거 백업 자동 작동.");
                      chrome.runtime.sendMessage({
                        action: "trigger_s1_debugger",
                        x: x,
                        y: y
                      });
                    }
                  }
                }, 1000);

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
                  console.log("ℹ️ [YT Ad Full Watch] 최근 클릭 타임스탬프 기록 실패:", err);
                }
              } else {
                console.log(`⚠️ [YT Ad Full Watch] 클릭 실행 보류: 클릭 직전 조건 불만족 (투명도정상: ${opacityNormal}, 클릭가능클래스: ${classClickable})`);
              }
            }
            clickScheduled = false; // 스케줄 상태 리셋
          }, delay);
        }
      }
    } else {
      // 광고가 재생되고 있지 않은 평상시 상태
      if (adPlaying) {
        adPlaying = false;
        clickScheduled = false;
        clickExecutedTime = null;   // 클릭 시점 리셋
        clickFailedDetected = false; // 실패 감지 리셋
        scheduledDelaySec = "";
        scheduledCoordinates = "";
        
        // 스킵 성공 시각 기록
        if (isContextValid() && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ lastSkipSuccessTime: formatFullTime(new Date()) });
        }
        
        console.log("🎉 [YT Ad Full Watch] 광고 건너뛰기 완료!");

        // 광고가 끝났으니 원래 음소거 상태 복원
        if (adMutedSet && video) {
          try {
            video.muted = originalMuted;
            console.log(`🔊 [YT Ad Full Watch] 본 영상 복귀: 음소거 복원 완료 (원래 음소거 상태로 복귀: ${originalMuted})`);
          } catch (restoreErr) {
            console.log("ℹ️ [YT Ad Full Watch] 음소거 복원 실패:", restoreErr);
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
      scheduledDelaySec = "";
      scheduledCoordinates = "";
      // 평상시에도 실시간 상태는 비활성화로 초기화 전송
      updateAdStatus({
        adPlaying: false,
        tagDetected: false,
        rectFound: false,
        visible: false,
        videoPlaying: false,
        timerCompleted: false,
        opacityNormal: false,
        notDisabled: false,
        classClickable: false,
        clicked: false,
        clickFailed: false,
        enforcementShield: shieldDetected,
        remainingTime: null,
        progressPercent: 0,
        clickDelay: "",
        clickCoordinates: ""
      });
    }
  }

  // DOM 변화를 실시간으로 감지하여 광고 즉시 감지 (CPU 리소스 최적화)
  observer = new MutationObserver((mutations) => {
    if (!isContextValid()) {
      observer.disconnect();
      return;
    }
    
    let onlyIndicator = true;
    for (const mutation of mutations) {
      const target = mutation.target;
      if (target.id === 'yt-ad-click-indicator' || target.closest('#yt-ad-click-indicator')) {
        continue;
      }
      onlyIndicator = false;
      break;
    }
    
    if (!onlyIndicator) {
      checkAndSkipAds();
    }
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

  // Shadow DOM 포함 버튼 재귀 탐색 및 경로 로깅 함수
  function findSkipButton() {
    const player = document.querySelector('.html5-video-player');
    if (!player) return null;
    
    const selectors = [
      '.ytp-ad-skip-button-modern',
      '.ytp-ad-skip-button',
      '.ytp-ad-skip-button-text',
      'button[class*="skip-button"]',
      'button[aria-label*="Skip"]',
      'button[aria-label*="건너뛰기"]',
      '.ytp-skip-ad-button',
      '[class*="ytp-skip-ad-button"]'
    ];

    let foundBtn = null;
    let foundPath = "";

    function search(node, currentPath) {
      if (foundBtn) return;
      if (!node) return;

      for (const selector of selectors) {
        try {
          const btn = node.querySelector && node.querySelector(selector);
          if (btn) {
            foundBtn = btn;
            foundPath = `${currentPath} -> ${selector}`;
            return;
          }
        } catch(e) {}
      }

      const children = node.children || [];
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child.shadowRoot) {
          search(child.shadowRoot, `${currentPath} -> ${child.tagName.toLowerCase()}[shadowRoot]`);
        }
        search(child, `${currentPath} -> ${child.tagName.toLowerCase()}`);
      }
    }

    search(player, "player");
    if (foundBtn) {
      console.log(`🔍 [YT ad watch & click] 스킵 버튼 발견 성공! 경로: ${foundPath}`);
    }
    return foundBtn;
  }

  // 수동 강제 대행 클릭 실행 함수
  function forceExecuteClick() {
    const targetBtn = findSkipButton();
    if (targetBtn) {
      console.log("⚡ [YT ad watch & click] 스킵 버튼 찾음! 강제 3중 클릭을 수행합니다.");
      simulateClick(targetBtn);
      
      clickExecutedTime = Date.now();
      if (isContextValid() && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ lastClickAttemptTime: formatFullTime(new Date()) });
      }
    } else {
      console.log("ℹ️ [YT ad watch & click] 강제 클릭 대상 스킵 버튼을 발견하지 못했습니다.");
    }
  }



  // 시나리오 2: PointerEvent click 규격 3중 전달 (포커스 및 탭 정보 수집)
  function testScenario2(element) {
    try {
      console.log("🧪 [YT ad watch & click] S2: PointerEvent 클릭 분석 개시");
      
      const activeEl = document.activeElement;
      const isTabHidden = document.hidden;
      console.log(`📊 [S2 Fact] 현재 포커스 엘리먼트: <${activeEl ? activeEl.tagName.toLowerCase() : 'none'} id="${activeEl ? activeEl.id : ''}" class="${activeEl ? activeEl.className : ''}">`);
      console.log(`📊 [S2 Fact] 탭 활성화 상태 (document.hidden): ${isTabHidden}`);
      
      const rect = element.getBoundingClientRect();
      const clientX = rect.left + rect.width / 2;
      const clientY = rect.top + rect.height / 2;
      
      const pointerOpts = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: clientX,
        clientY: clientY,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true
      };
      
      const clickEvent = new PointerEvent('click', pointerOpts);
      const isDispatched = element.dispatchEvent(clickEvent);
      console.log(`📊 [S2 Fact] PointerEvent('click') dispatchEvent 반환값 (성공시 true): ${isDispatched}`);
      
      const textChild = element.querySelector('.ytp-skip-ad-button__text') || element.firstElementChild;
      if (textChild) {
        textChild.dispatchEvent(new PointerEvent('click', pointerOpts));
      }
      const parentSlot = element.closest('.ytp-ad-skip-button-slot') || element.parentElement;
      if (parentSlot) {
        parentSlot.dispatchEvent(new PointerEvent('click', pointerOpts));
      }
      console.log("🎯 [YT ad watch & click] S2: PointerEvent click 전송 완료!");
    } catch (e) {
      console.log("ℹ️ [YT ad watch & click] S2 실행 중 에러:", e);
    }
  }

  // 시나리오 3: 마우스 이동 궤적(pointermove) 의태 후 클릭 (유효 좌표 및 쓰로틀링 수집)
  function testScenario3(element) {
    try {
      console.log("🧪 [YT ad watch & click] S3: 마우스 궤적 의태 분석 개시");
      
      const rect = element.getBoundingClientRect();
      const targetX = rect.left + rect.width / 2;
      const targetY = rect.top + rect.height / 2;
      
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      console.log(`📊 [S3 Fact] 뷰포트 크기: ${vw}x${vh}, 타겟 절대좌표: (${targetX}, ${targetY})`);
      if (targetX < 0 || targetX > vw || targetY < 0 || targetY > vh) {
        console.log("ℹ️ [S3 Warning] 타겟 좌표가 뷰포트 범위를 벗어났습니다!");
      } else {
        console.log("📊 [S3 Fact] 타겟 좌표 무결성 검증 완료 (🟢 정상 범위)");
      }
      
      const startX = targetX - 100;
      const startY = targetY - 50;
      
      const steps = 5;
      let lastStepTime = Date.now();
      
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const currentX = startX + (targetX - startX) * t;
        const currentY = startY + (targetY - startY) * t;
        
        const moveOpts = {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: currentX,
          clientY: currentY
        };
        
        setTimeout(() => {
          const now = Date.now();
          const actualGap = now - lastStepTime;
          lastStepTime = now;
          
          console.log(`📊 [S3 Fact] Step ${i} 실행 간격: ${actualGap}ms (이론값 10ms)`);
          
          element.dispatchEvent(new PointerEvent('pointermove', Object.assign({ pointerId: 1, pointerType: "mouse" }, moveOpts)));
          element.dispatchEvent(new MouseEvent('mousemove', moveOpts));
          
          if (i === steps) {
            console.log("🎯 [YT ad watch & click] S3: 마우스 궤적 의태 완료, 클릭 시뮬레이션 개시");
            simulateClick(element);
          }
        }, i * 10);
      }
    } catch (e) {
      console.log("ℹ️ [YT ad watch & click] S3 실행 중 에러:", e);
    }
  }

  // 시나리오 4: 메인 컨텍스트(MAIN World) 내 player.skipAd() 호출 injection
  // 시나리오 4: 메인 컨텍스트(MAIN World) 내 player.skipAd() 호출 injection (CSP 우회로)
  function testScenario4() {
    try {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('main-world.js');
      document.documentElement.appendChild(script);
      script.onload = () => script.remove();
      console.log("🎯 [YT ad watch & click] S4: 외부 리소스 주입 완료 (CSP 우회 성공)");
    } catch (e) {
      console.log("ℹ️ [YT ad watch & click] S4 실행 중 에러:", e);
    }
  }



  // 시나리오 6: 비디오 재생 종료 및 스킵 버튼 변이 감시 도청
  function testScenario6() {
    try {
      console.log("🧪 [YT ad watch & click] S6: 비디오 종료 및 스킵 버튼 변이 도청 감지 개시");
      
      const video = document.querySelector('video');
      if (video) {
        video.addEventListener('ended', () => {
          const endedTime = Date.now();
          console.log(`🚨 [S6 Event] 비디오 ended 이벤트 수신 시각: ${formatFullTime(new Date())}`);
          if (lastAdVisibilityChangeTime) {
            const gap = endedTime - lastAdVisibilityChangeTime;
            console.log(`📊 [S6 Fact] 스킵 버튼 활성화와 비디오 ended 이벤트 간의 시간 차: ${gap}ms`);
          }
        }, { once: true });
        console.log("📊 [S6 Fact] 비디오 ended 이벤트 리스너 도청 바인딩 완료 (🟢)");
      } else {
        console.log("ℹ️ [S6 Warning] 비디오 요소를 찾지 못해 ended 리스너를 붙이지 못했습니다.");
      }

      const skipBtn = findSkipButton();
      if (skipBtn && !observerAttached) {
        const observer = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && (mutation.attributeName === 'style' || mutation.attributeName === 'class')) {
              const currentStyle = window.getComputedStyle(skipBtn);
              const isVisible = currentStyle.display !== 'none' && currentStyle.visibility !== 'hidden';
              if (isVisible) {
                lastAdVisibilityChangeTime = Date.now();
                console.log(`🚨 [S6 Event] MutationObserver 감지 - 스킵 버튼 활성화 시각: ${formatFullTime(new Date())}`);
              }
            }
          });
        });
        observer.observe(skipBtn, { attributes: true });
        observerAttached = true;
        console.log("📊 [S6 Fact] 스킵 버튼 MutationObserver 감시 바인딩 완료 (🟢)");
      } else {
        console.log("📊 [S6 Fact] MutationObserver가 이미 작동 중이거나 대상 버튼이 존재하지 않습니다.");
      }
    } catch (e) {
      console.log("ℹ️ [YT ad watch & click] S6 실행 중 에러:", e);
    }
  }

  // 팝업 통신용 수동 강제 클릭 리스너 등록
  if (isContextValid() && chrome.runtime) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "force_click") {
        forceExecuteClick();
        if (typeof sendResponse === 'function') {
          sendResponse({ success: true });
        }
      } else if (request.action === "get_button_coordinates") {
        const btn = findSkipButton();
        if (btn) {
          const rect = btn.getBoundingClientRect();
          sendResponse({
            success: true,
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2
          });
        } else {
          sendResponse({ success: false });
        }
      } else if (request.action === "test_s2") {
        const btn = findSkipButton();
        if (btn) {
          testScenario2(btn);
        }
        sendResponse({ success: true });
      } else if (request.action === "test_s3") {
        const btn = findSkipButton();
        if (btn) {
          testScenario3(btn);
        }
        sendResponse({ success: true });
      } else if (request.action === "test_s4") {
        testScenario4();
        sendResponse({ success: true });
      } else if (request.action === "test_s6") {
        testScenario6();
        sendResponse({ success: true });
      }
      return true;
    });
  }

})();
