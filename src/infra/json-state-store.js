import fs from 'node:fs';
import path from 'node:path';

export class JsonStateStore {
  constructor(filePath) {
    this.filePath = path.resolve(filePath);
  }

  ensureDir() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
  }

  load() {
    if (!fs.existsSync(this.filePath)) return null;
    const raw = fs.readFileSync(this.filePath, 'utf8');
    return JSON.parse(raw);
  }

  save(snapshot) {
    this.ensureDir();
    const temp = `${this.filePath}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(snapshot, null, 2), 'utf8');
    fs.renameSync(temp, this.filePath);
  }
}
