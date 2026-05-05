import { readFile, writeFile, mkdir } from 'fs/promises';
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
  let config: AppConfig;
  try {
    const raw = await readFile(CONFIG_PATH, 'utf-8');
    config = JSON.parse(raw);
  } catch {
    config = getDefaultConfig();
  }
  // Ensure .pi/settings.json stays in sync
  await syncPiSettings(config);
  return config;
}

const PI_SETTINGS_PATH = path.resolve('.pi', 'settings.json');

export async function saveConfig(config: AppConfig): Promise<void> {
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
  // Sync model to .pi/settings.json so child Pi processes (sub-agents) use the same model
  await syncPiSettings(config);
}

async function syncPiSettings(config: AppConfig): Promise<void> {
  let piSettings: any = {};
  try {
    const raw = await readFile(PI_SETTINGS_PATH, 'utf-8');
    piSettings = JSON.parse(raw);
  } catch {
    // file doesn't exist yet
  }
  piSettings.defaultModel = config.defaultModel;
  piSettings.defaultProvider = config.defaultProvider;
  await mkdir(path.dirname(PI_SETTINGS_PATH), { recursive: true });
  await writeFile(PI_SETTINGS_PATH, JSON.stringify(piSettings, null, 2), 'utf-8');
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
