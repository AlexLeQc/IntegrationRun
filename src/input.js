export class InputHandler {
  constructor(onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown, onShoot) {
    this.onSwipeLeft = onSwipeLeft;
    this.onSwipeRight = onSwipeRight;
    this.onSwipeUp = onSwipeUp;
    this.onSwipeDown = onSwipeDown;
    this.onShoot = onShoot;
    
    this.startX = 0;
    this.startY = 0;
    this.minSwipeDistance = 30; // Minimum swipe distance in pixels

    this.initTouch();
    this.initKeyboard();
  }

  initTouch() {
    this.startTime = 0;

    window.addEventListener('touchstart', (e) => {
      if (e.touches.length > 0) {
        this.startX = e.touches[0].clientX;
        this.startY = e.touches[0].clientY;
        this.startTime = performance.now();
      }
    }, { passive: true });

    window.addEventListener('touchend', (e) => {
      if (e.changedTouches.length === 0) return;

      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const duration = performance.now() - this.startTime;

      const diffX = endX - this.startX;
      const diffY = endY - this.startY;

      const absX = Math.abs(diffX);
      const absY = Math.abs(diffY);
      const maxDist = Math.max(absX, absY);

      if (maxDist >= this.minSwipeDistance) {
        // Drag movement swipe (>= 30px) -> Strictly Movement, NEVER shoot
        if (absX > absY) {
          // Horizontal swipe is dominant
          if (diffX > 0) {
            if (this.onSwipeRight) this.onSwipeRight();
          } else {
            if (this.onSwipeLeft) this.onSwipeLeft();
          }
        } else {
          // Vertical swipe is dominant
          if (diffY > 0) {
            if (this.onSwipeDown) this.onSwipeDown();
          } else {
            if (this.onSwipeUp) this.onSwipeUp();
          }
        }
      } else if (maxDist < 15 && duration < 250) {
        // Stationary Quick Tap (< 15px displacement AND < 250ms duration) -> Fire Water Balloon
        if (this.onShoot) this.onShoot();
      }
    }, { passive: true });

    // Desktop Mouse Click Support (only triggers if not a touch pointer)
    let pointerStartX = 0;
    let pointerStartY = 0;
    let pointerStartTime = 0;

    window.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') {
        pointerStartX = e.clientX;
        pointerStartY = e.clientY;
        pointerStartTime = performance.now();
      }
    });

    window.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'mouse') {
        const dist = Math.hypot(e.clientX - pointerStartX, e.clientY - pointerStartY);
        const duration = performance.now() - pointerStartTime;
        if (dist < 15 && duration < 250) {
          if (this.onShoot) this.onShoot();
        }
      }
    });
  }

  initKeyboard() {
    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      if (key === 'arrowleft' || key === 'a') {
        if (this.onSwipeLeft) this.onSwipeLeft();
      } else if (key === 'arrowright' || key === 'd') {
        if (this.onSwipeRight) this.onSwipeRight();
      } else if (key === 'arrowup' || key === 'w') {
        if (e.key.startsWith('Arrow')) e.preventDefault();
        if (this.onSwipeUp) this.onSwipeUp();
      } else if (key === 'arrowdown' || key === 's') {
        if (e.key.startsWith('Arrow')) e.preventDefault();
        if (this.onSwipeDown) this.onSwipeDown();
      } else if (e.code === 'Space') {
        e.preventDefault();
        if (this.onShoot) this.onShoot();
      }
    });
  }
}
