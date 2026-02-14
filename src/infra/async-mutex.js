export class AsyncMutex {
  constructor() {
    this.current = Promise.resolve();
  }

  async run(task) {
    const previous = this.current;
    let release;
    this.current = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await task();
    } finally {
      release();
    }
  }
}
