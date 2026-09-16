export class ContextCompiler {
  constructor({ maxChars = 12000 } = {}) { this.maxChars = maxChars; }

  compile({ owner = '', project = '', task = '', memory = '', evidence = [], capabilities = [] }) {
    const sections = [
      ['OWNER', owner],
      ['PROJECT', project],
      ['TASK', task],
      ['MEMORY', memory],
      ['CAPABILITIES', capabilities.map((c) => `${c.id}:${c.state}`).join(', ')],
      ['EVIDENCE', evidence.map((e) => `[${e.type}] ${e.summary} (${e.source})`).join('\n')]
    ];
    let remaining = this.maxChars;
    const output = [];
    for (const [name, value] of sections) {
      const text = String(value || '').trim();
      if (!text || remaining <= 0) continue;
      const clipped = text.slice(0, Math.max(0, remaining - name.length - 8));
      output.push(`## ${name}\n${clipped}`);
      remaining -= clipped.length + name.length + 8;
    }
    return { text: output.join('\n\n'), chars: this.maxChars - remaining, truncated: remaining <= 0 };
  }

  digestToolResult(result, { maxChars = 2400 } = {}) {
    const raw = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    return raw.length <= maxChars ? raw : `${raw.slice(0, maxChars)}\n…[truncated; original retained as trace evidence]`;
  }
}
