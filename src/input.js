export class InputHandler {
  constructor(onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown) {
    this.onSwipeLeft = onSwipeLeft;
    this.onSwipeRight = onSwipeRight;
    this.onSwipeUp = onSwipeUp;
    this.onSwipeDown = onSwipeDown;
    
    this.startX = 0;
    this.startY = 0;
    this.minSwipeDistance = 30; // Minimum swipe distance in pixels

    this.initTouch();
    this.initKeyboard();
  }

  initTouch() {
    window.addEventListener('touchstart', (e) => {
      this.startX = e.touches[0].clientX;
      this.startY = e.touches[0].clientY;
    }, { passive: true });

    window.addEventListener('touchend', (e) => {
      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;

      const diffX = endX - this.startX;
      const diffY = endY - this.startY;

      const absX = Math.abs(diffX);
      const absY = Math.abs(diffY);

      if (Math.max(absX, absY) > this.minSwipeDistance) {
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
      }
    }, { passive: true });
  }

  initKeyboard() {
    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      if (key === 'arrowleft' || key === 'a') {
        if (this.onSwipeLeft) this.onSwipeLeft();
      } else if (key === 'arrowright' || key === 'd') {
        if (this.onSwipeRight) this.onSwipeRight();
      } else if (key === 'arrowup' || key === 'w') {
        if (this.onSwipeUp) this.onSwipeUp();
      } else if (key === 'arrowdown' || key === 's') {
        if (this.onSwipeDown) this.onSwipeDown();
      }
    });
  }
}
