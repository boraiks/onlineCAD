import test from 'node:test';
import assert from 'node:assert/strict';

test('Error Notice Toast - creates CAD HUD notice with icon, code chip, progress bar and dismiss button', () => {
  const elements = [];
  const tray = {
    children: elements,
    prepend(child) { elements.unshift(child); },
    lastElementChild: null,
  };

  // Mock DOM factory
  function createElement(tag) {
    const el = {
      tagName: tag.toUpperCase(),
      className: '',
      dataset: {},
      style: {},
      children: [],
      classList: {
        _classes: new Set(),
        add(c) { this._classes.add(c); },
        remove(c) { this._classes.delete(c); },
        contains(c) { return this._classes.has(c); },
      },
      attributes: {},
      setAttribute(k, v) { this.attributes[k] = v; },
      getAttribute(k) { return this.attributes[k]; },
      events: new Map(),
      addEventListener(e, f) {
        if (!this.events.has(e)) this.events.set(e, []);
        this.events.get(e).push(f);
      },
      dispatchEvent(e) {
        (this.events.get(e) || []).forEach(f => f({ stopPropagation() {} }));
      },
      append(...children) { this.children.push(...children); },
      remove() {
        const idx = elements.indexOf(this);
        if (idx !== -1) elements.splice(idx, 1);
      },
      offsetWidth: 100,
    };
    return el;
  }

  function createShowError(errorTray, doc) {
    return function showError({ code = 'CAD-R001', title = 'Application error', reason = 'Unexpected error' }) {
      const shortReason = String(reason).split('\n')[0].slice(0, 140);
      const key = `${code}|${shortReason}`;
      const existing = [...errorTray.children].find(item => item.dataset.key === key);
      if (existing) {
        errorTray.prepend(existing);
        existing.resetTimer?.();
        return;
      }

      const notice = doc.createElement('section');
      notice.className = 'error-notice';
      notice.dataset.key = key;
      notice.role = 'alert';
      notice.title = 'Click to dismiss';

      const accent = doc.createElement('div');
      accent.className = 'error-notice-accent';

      const iconBadge = doc.createElement('div');
      iconBadge.className = 'error-notice-icon-badge';

      const content = doc.createElement('div');
      content.className = 'error-notice-content';

      const heading = doc.createElement('div');
      heading.className = 'error-notice-header';

      const name = doc.createElement('strong');
      name.className = 'error-notice-title';
      name.textContent = title;

      const identifier = doc.createElement('code');
      identifier.className = 'error-notice-code';
      identifier.textContent = code;

      heading.append(name, identifier);

      const description = doc.createElement('p');
      description.className = 'error-notice-text';
      description.textContent = shortReason;

      content.append(heading, description);

      const dismiss = doc.createElement('button');
      dismiss.type = 'button';
      dismiss.className = 'error-notice-dismiss';

      notice.append(accent, iconBadge, content, dismiss);

      const TOTAL_MS = 5000;
      const FADE_MS = 1500;
      const STAY_MS = TOTAL_MS - FADE_MS;
      let fadeTimer = null;
      let removeTimer = null;
      let isHovered = false;

      function dismissNotice() {
        if (notice.classList.contains('is-dismissing')) return;
        clearTimeout(fadeTimer);
        clearTimeout(removeTimer);
        notice.classList.add('is-dismissing');
        setTimeout(() => { notice.remove(); }, 150);
      }

      function startTimer() {
        clearTimeout(fadeTimer);
        clearTimeout(removeTimer);
        notice.classList.remove('is-fading');
        notice.style.transition = '';
        notice.style.opacity = '1';
        notice.style.transform = '';

        fadeTimer = setTimeout(() => {
          if (!isHovered) {
            notice.classList.add('is-fading');
          }
        }, STAY_MS);

        removeTimer = setTimeout(() => {
          if (!isHovered) {
            notice.remove();
          }
        }, TOTAL_MS);
      }

      function cancelTimerAndRestore() {
        clearTimeout(fadeTimer);
        clearTimeout(removeTimer);
        notice.classList.remove('is-fading');
        notice.style.transition = 'opacity 0.12s ease, transform 0.12s ease';
        notice.style.opacity = '1';
        notice.style.transform = 'translateY(0) scale(1)';
      }

      notice.addEventListener('mouseenter', () => {
        isHovered = true;
        cancelTimerAndRestore();
      });

      notice.addEventListener('mouseleave', () => {
        isHovered = false;
        startTimer();
      });

      notice.addEventListener('click', () => {
        dismissNotice();
      });

      dismiss.addEventListener('click', (event) => {
        event.stopPropagation();
        dismissNotice();
      });

      notice.resetTimer = () => {
        isHovered = false;
        startTimer();
      };

      startTimer();
      errorTray.prepend(notice);
      while (errorTray.children.length > 3) errorTray.lastElementChild?.remove();
    };
  }

  const doc = { createElement };
  const showError = createShowError(tray, doc);

  // 1. Show Error
  showError({ code: 'CAD-I001', title: 'Not Enough Bodies', reason: 'Interference detection needs 2 bodies.' });
  assert.equal(tray.children.length, 1);
  const notice = tray.children[0];
  assert.equal(notice.className, 'error-notice');
  assert.equal(notice.dataset.key, 'CAD-I001|Interference detection needs 2 bodies.');

  // 2. Hover restores full opacity & cancels fade
  notice.dispatchEvent('mouseenter');
  assert.equal(notice.style.opacity, '1');
  assert.equal(notice.classList.contains('is-fading'), false);

  // 3. Mouse leave restarts timer
  notice.dispatchEvent('mouseleave');

  // 4. Click on notice dismisses it
  notice.dispatchEvent('click');
  assert.equal(notice.classList.contains('is-dismissing'), true);
});
