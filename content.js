console.log("🚀 [YT Skipper] 유튜브 광고 스킵 확장 프로그램이 로드되었습니다!");

let enabled = true;
let adPlaying = false; // 현재 광고가 재생 중인지 기록하는 상태 변수

// 크로스 오리진 iframe 등 확장 프로그램 API 접근이 막힌 환경에서의 에러 방지 처리
try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['enabled'], (result) => {
            if (result.enabled !== undefined) {
                enabled = result.enabled;
                console.log("🔍 [YT Skipper] 현재 작동 상태:", enabled ? "ON" : "OFF");
            }
        });

        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (changes.enabled) {
                enabled = changes.enabled.newValue;
                console.log("🔄 [YT Skipper] 작동 상태 변경됨:", enabled ? "ON" : "OFF");
            }
        });
    }
} catch (e) {
    console.warn("⚠️ [YT Skipper] 크롬 스토리지 접근 실패 (iframe 환경일 수 있습니다):", e);
}

// 이벤트 위임 및 마우스 클릭 시뮬레이션 (isTrusted 방어 우회)
function simulateClick(element) {
    const eventOpts = { bubbles: true, cancelable: true, view: window };
    element.dispatchEvent(new MouseEvent('mousedown', eventOpts));
    element.dispatchEvent(new MouseEvent('mouseup', eventOpts));
    element.dispatchEvent(new MouseEvent('click', eventOpts));
}

// 광고 감지 및 스킵 메인 로직
function checkAndSkipAds() {
    if (!enabled) return;

    // 유튜브 플레이어 영역만 특정하여 페이지 레벨의 오작동(예: 본문 건너뛰기 링크 등) 차단
    const player = document.querySelector('.html5-video-player');
    const video = document.querySelector('video');

    if (player && player.classList.contains('ad-showing')) {
        // 광고 재생 상태로 감지됨
        adPlaying = true;

        // 1단계: 광고 건너뛰기 버튼 존재 여부 확인 및 클릭 시도 (플레이어 내부에서만 감색)
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
                // document 대신 player.querySelector를 사용하여 오직 비디오 플레이어 내부에 위치한 버튼만 조회
                const btn = player.querySelector(selector);
                if (btn && (btn.offsetWidth > 0 || btn.offsetHeight > 0 || btn.offsetParent !== null)) {
                    console.log(`🎯 [YT Skipper] 플레이어 내부 스킵 버튼 감지! (셀렉터: ${selector})`);
                    simulateClick(btn);
                    break;
                }
            } catch (e) {
                // 예외 무시
            }
        }

        // 2단계: 백업 우회책 (강제 광고나 버튼 클릭 불가 상태일 때 배속 고속 스킵)
        try {
            if (video) {
                // 배속을 16배로 고속화하고 광고 소리는 음소거 처리
                if (video.playbackRate < 16) {
                    video.playbackRate = 16;
                    video.muted = true;
                    console.log("⚡ [YT Skipper] 광고 고속 패스 및 음소거 실행 중 (16배속)");
                }
                // 광고 영상 끝부분(종료 0.1초 전)으로 타임라인 강제 이동
                if (isFinite(video.duration) && video.currentTime < video.duration - 0.1) {
                    video.currentTime = video.duration - 0.1;
                }
            }
        } catch (e) {
            // 예외 무시
        }
    } else {
        // 광고가 재생되고 있지 않은 평상시 상태
        if (adPlaying) {
            // 이전에 광고 재생 중(adPlaying === true)이었다가 현재 광고 상태가 해제되었을 때만 스킵 카운트 누적
            adPlaying = false;
            console.log("🎉 [YT Skipper] 광고 건너뛰기 완료!");

            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.get(['skippedCount'], (res) => {
                    const count = (res.skippedCount || 0) + 1;
                    chrome.storage.local.set({ skippedCount: count }, () => {
                        console.log(`📈 [YT Skipper] 누적 스킵 횟수 업데이트 (누적: ${count}회)`);
                    });
                });
            }
        }
    }
}

// DOM 변화를 실시간으로 감지하여 광고 즉시 감지 (CPU 리소스 최적화)
const observer = new MutationObserver(() => {
    checkAndSkipAds();
});

// 유튜브 플레이어가 로딩될 것을 대비하여 document 레벨에서 전체 구조 감시
observer.observe(document.documentElement || document.body || document, {
    childList: true,
    subtree: true
});

// 백업용 1초 폴링 (동적 스크립트 실행으로 인한 옵저버 누락 방지)
setInterval(checkAndSkipAds, 1000);
