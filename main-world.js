try {
  const player = document.querySelector('.html5-video-player');
  if (player) {
    if (typeof player.skipAd === 'function') {
      player.skipAd();
      console.log("🎯 [YT ad watch & click] MAIN context player.skipAd() executed successfully!");
    } else {
      console.log("ℹ️ [YT ad watch & click] player.skipAd 함수가 존재하지 않습니다.");
      const btn = player.querySelector('.ytp-skip-ad-button') || 
                  player.querySelector('.ytp-ad-skip-button-modern');
      if (btn) {
        btn.click();
        console.log("🎯 [YT ad watch & click] MAIN context btn.click() executed!");
      }
    }
  }
} catch (e) {
  console.log("ℹ️ [YT ad watch & click] MAIN context injection error:", e);
}
