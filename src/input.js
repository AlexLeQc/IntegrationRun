export class InputHandler {
  constructor(onSwipeLeft, onSwipeRight) {
    this.onSwipeLeft = onSwipeLeft;
    this.onSwipeRight = onSwipeRight;
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

      // Verify that horizontal swipe is dominant and exceeds minimum threshold
      if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > this.minSwipeDistance) {
        if (diffX > 0) {
          this.onSwipeRight();
        } else {
          this.onSwipeLeft();
        }
      }
    }, { passive: true });
  }

  initKeyboard() {
    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      if (key === 'arrowleft' || key === 'a') {
        this.onSwipeLeft();
      } else if (key === 'arrowright' || key === 'd') {
        this.onSwipeRight();
      }
    });
  }
}
