import { readFile, writeFile } from 'fs/promises';
import path from 'path';

export interface AppConfig {
  defaultModel: string;
  defaultProvider: string;
  thinkingLevel: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  plugins: {
    webSearch: boolean;
    codeSearch: boolean;
    subagents: boolean;
    fileSystem: boolean;
  };
}

const CONFIG_PATH = path.resolve('wiki', '.config.json');

export async function loadConfig(): Promise<AppConfig> {
  try {
    const raw = await readFile(CONFIG_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return getDefaultConfig();
  }
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

export function getDefaultConfig(): AppConfig {
  return {
    defaultModel: 'claude-opus-4.6',
    defaultProvider: 'github-copilot',
    thinkingLevel: 'medium',
    plugins: {
      webSearch: false,
      codeSearch: false,
      subagents: true,
      fileSystem: true,
    },
  };
}
