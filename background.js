console.log("⚙️ [YT ad watch & click BG] 백그라운드 서비스 워커가 로드되었습니다!");

function logErrorToStorage(msg, stack) {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    const errStr = `[${new Date().toLocaleTimeString()}] [BG] ${msg}\nStack: ${stack || 'N/A'}`;
    chrome.storage.local.get(['runtimeErrors'], (res) => {
      let errs = res.runtimeErrors || [];
      errs.unshift(errStr);
      if (errs.length > 50) errs = errs.slice(0, 50);
      chrome.storage.local.set({ runtimeErrors: errs });
    });
  }
}

self.addEventListener('error', (event) => {
  logErrorToStorage(`${event.message} at ${event.filename}:${event.lineno}:${event.colno}`, event.error ? event.error.stack : '');
});

self.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  const msg = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : '';
  logErrorToStorage(`Unhandled Rejection: ${msg}`, stack);
});

// 디버거 상태 팩트 수집 리스너
if (chrome.debugger) {
  chrome.debugger.onEvent.addListener((source, method, params) => {
    // console.log(`[CDP Event] Source: ${source.tabId}, Method: ${method}`);
  });

  chrome.debugger.onDetach.addListener((source, reason) => {
    console.log(`⚠️ [YT ad watch & click BG] 디버거가 분리되었습니다. 탭ID: ${source.tabId}, 원인: ${reason}`);
  });
} else {
  logErrorToStorage("chrome.debugger API가 정의되어 있지 않습니다. 권한 승인이 완료되었는지 확인하십시오.", "N/A");
}

// content.js 및 popup.js와 통신하여 S1 디버거 클릭 수행
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "trigger_s1_debugger") {
    if (!chrome.debugger) {
      console.log("❌ [YT ad watch & click BG] chrome.debugger가 정의되어 있지 않습니다.");
      sendResponse({ success: false, error: "chrome.debugger가 정의되어 있지 않습니다. 디버거 권한 승인 상태를 확인하세요." });
      return true;
    }
    // 탭 ID 식별 (메시지 발송자가 탭이면 sender.tab.id, 팝업이면 탭 쿼리가 필요하나 팝업도 명시적으로 tabId를 실어 보낼 수 있음)
    const tabId = sender.tab ? sender.tab.id : request.tabId;
    if (!tabId) {
      console.log("❌ [YT ad watch & click BG] 디버거 대상을 식별할 수 없습니다. tabId 누락.");
      sendResponse({ success: false, error: "tabId 누락" });
      return true;
    }

    const x = Math.round(request.x);
    const y = Math.round(request.y);
    const target = { tabId: tabId };

    console.log(`🎯 [YT ad watch & click BG] S1 디버거 작동 개시. 탭ID: ${tabId}, 좌표: (${x}, ${y})`);

    // 1단계: 브라우저 윈도우 포커스 상태 정밀 수집
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError || !tab) {
        console.log("⚠️ [YT ad watch & click BG] 대상 탭 정보를 가져오는데 실패했습니다:", chrome.runtime.lastError);
        return;
      }
      chrome.windows.get(tab.windowId, (win) => {
        const isFocused = win ? win.focused : false;
        console.log(`🔍 [YT ad watch & click BG] 윈도우 포커스 상태: ${isFocused ? "포커싱 락 활성(🟢)" : "백그라운드/최소화(🔴)"}`);
      });
    });

    // 2단계: 디버거 부착 및 CDP 마우스 강제 타격 실행
    chrome.debugger.attach(target, "1.3", () => {
      const lastErr = chrome.runtime.lastError;
      if (lastErr) {
        console.log("❌ [YT ad watch & click BG] 디버거 attach 실패:", lastErr.message);
        sendResponse({ success: false, error: lastErr.message });
        return;
      }

      console.log(`🔗 [YT ad watch & click BG] 디버거 연결 완료 (탭ID: ${tabId})`);

      // MousePressed 명령 주입
      chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
        type: "mousePressed",
        x: x,
        y: y,
        button: "left",
        clickCount: 1
      }, () => {
        const pressErr = chrome.runtime.lastError;
        if (pressErr) console.log("⚠️ mousePressed 실패:", pressErr.message);

        // MouseReleased 명령 주입
        chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
          type: "mouseReleased",
          x: x,
          y: y,
          button: "left",
          clickCount: 1
        }, () => {
          const releaseErr = chrome.runtime.lastError;
          if (releaseErr) console.log("⚠️ mouseReleased 실패:", releaseErr.message);

          // 3단계: 디버거 분리 및 상태 피드백 반환
          chrome.debugger.detach(target, () => {
            console.log("🔌 [YT ad watch & click BG] 디버거 연결 해제 완료.");
            sendResponse({ success: true });
          });
        });
      });
    });

    return true; // 비동기 응답 처리용
  }
});
