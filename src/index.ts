import { defineOuraDataTool } from "./tool";
import { registerCli } from "./cli";
import { OuraConfig } from "./types";

export default function ouraclaw(api: any) {
  const getConfig = (): OuraConfig => api.getPluginConfig("ouraclaw") || {};
  const updateConfig = (updates: Partial<OuraConfig>) =>
    api.updatePluginConfig("ouraclaw", updates);

  // Register the oura_data agent tool
  const tool = defineOuraDataTool(getConfig, updateConfig);
  api.registerTool(tool);

  // Register CLI commands (openclaw ouraclaw setup|status|test)
  registerCli(api, {
    getConfig,
    updateConfig,
    prompt: api.prompt,
    select: api.select,
    confirm: api.confirm,
    log: api.log,
    openUrl: api.openUrl,
    registerCronJob: api.registerCronJob,
    unregisterCronJob: api.unregisterCronJob,
  });
}
