// Metro: resolve @nightcap/core from the monorepo's packages/core (TS source, shared with the API).
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const coreRoot = path.resolve(projectRoot, "../../packages/core");
const config = getDefaultConfig(projectRoot);
config.watchFolders = [coreRoot];
config.resolver.extraNodeModules = { "@nightcap/core": path.join(coreRoot, "src") };
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, "node_modules")];
config.resolver.disableHierarchicalLookup = true;
module.exports = config;
