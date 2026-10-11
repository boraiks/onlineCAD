(function (cad) {
  'use strict';

  // Project the detailed undo history onto CAD features. Sketch edits remain
  // individually undoable, but a contiguous sketch edit session has one node.
  function projectFeatures(entries) {
    const features = [];
    let openSketch = null;
    for (let index = 0; index < entries.length; index++) {
      const command = entries[index];
      const position = index + 1;
      if (command.kind === 'sketch') {
        if (command.timelineSketchEvent === 'create' || !openSketch) {
          openSketch = {
            name: command.timelineSketchEvent === 'create'
              ? String(command.name || 'Sketch') : 'Edit sketch',
            tool: 'openSketch', start: position, end: position,
          };
          features.push(openSketch);
        } else {
          openSketch.end = position;
        }
        if (command.timelineSketchEvent === 'finish') openSketch = null;
      } else if (command.timelineTool) {
        openSketch = null;
        features.push({ name: String(command.name || 'Feature'),
          tool: command.timelineTool, start: position, end: position });
      } else if (features.length) {
        features[features.length - 1].end = position;
      }
    }
    return features;
  }

  class Timeline {
    constructor({ history, element }) {
      this.history = history;
      this.element = element;
      this.track = element?.querySelector('#timelineTrack');
      this.counter = element?.querySelector('#timelineCounter');
      if (this.element && this.track && this.counter) {
        this.render();
      }
    }

    render() {
      if (!this.track || !this.counter) return;
      const entries = this.history.entries;
      const position = this.history.position;
      const features = projectFeatures(entries);
      const activeIndex = features.findLastIndex(feature => position >= feature.start);
      const fragment = document.createDocumentFragment();

      features.forEach((feature, index) => {
        const step = document.createElement('span');
        step.className = 'timeline-step';
        step.dataset.tooltipLabel = feature.name;
        step.title = `${feature.name} (Step ${index + 1})`;
        step.setAttribute('aria-label', `${feature.name}, design step ${index + 1}`);
        step.style.cursor = 'pointer';
        if (feature.start > position) step.classList.add('is-future');
        if (index === activeIndex) {
          step.setAttribute('aria-current', 'step');
          if (position < feature.end) step.classList.add('is-partial');
        }
        const sourceIcon = document.getElementById(feature.tool)?.querySelector('svg');
        if (sourceIcon) {
          const icon = sourceIcon.cloneNode(true);
          icon.removeAttribute('id');
          icon.setAttribute('aria-hidden', 'true');
          step.append(icon);
        } else {
          step.textContent = '◇';
        }
        step.addEventListener('click', () => {
          this.history?.seek?.(feature.end);
        });
        fragment.append(step);
      });

      this.track.replaceChildren(fragment);
      this.counter.textContent = `${Math.max(0, activeIndex + 1)} / ${features.length} features`;
      this.track.querySelector('[aria-current="step"]')
        ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }
  }

  cad.projectTimelineFeatures = projectFeatures;
  cad.Timeline = Timeline;
})(window.WebCAD = window.WebCAD || {});
