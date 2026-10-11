(function (cad) {
  'use strict';

  class HistoryManager {
    constructor({ onStateChange } = {}) {
      this.undoStack = [];
      this.redoStack = [];
      this.onStateChange = onStateChange;
    }

    execute(command) {
      if (!command) return;
      if (typeof command.execute === 'function') {
        command.execute();
      }
      this.undoStack.push(command);
      this.redoStack = [];
      if (this.onStateChange) this.onStateChange();
    }

    undo(notify = true) {
      if (!this.canUndo) return false;
      const command = this.undoStack[this.undoStack.length - 1];
      if (typeof command.undo === 'function') {
        command.undo();
      }
      this.undoStack.pop();
      this.redoStack.push(command);
      if (notify && this.onStateChange) this.onStateChange();
      return true;
    }

    redo(notify = true) {
      if (!this.canRedo) return false;
      const command = this.redoStack[this.redoStack.length - 1];
      if (typeof command.redo === 'function') {
        command.redo();
      } else if (typeof command.execute === 'function') {
        command.execute();
      }
      this.redoStack.pop();
      this.undoStack.push(command);
      if (notify && this.onStateChange) this.onStateChange();
      return true;
    }

    get position() { return this.undoStack.length; }

    get entries() { return this.undoStack.concat([...this.redoStack].reverse()); }

    seek(position) {
      if (!Number.isInteger(position) || position < 0 || position > this.entries.length)
        return false;
      if (position === this.position) return true;
      try {
        while (this.position > position) this.undo(false);
        while (this.position < position) this.redo(false);
      } finally {
        if (this.onStateChange) this.onStateChange();
      }
      return true;
    }

    get canUndo() {
      return this.undoStack.length > 0;
    }

    get canRedo() {
      return this.redoStack.length > 0;
    }

    clear() {
      this.undoStack = [];
      this.redoStack = [];
      if (this.onStateChange) this.onStateChange();
    }
  }

  cad.HistoryManager = HistoryManager;
})(window.WebCAD = window.WebCAD || {});
