module.exports = function (api) {
  api.cache(true);

  // Unistyles contains native code and is enabled when running a development
  // build. Expo Go uses the standard router entry until that build is created.
  const plugins = [];
  if (process.env.EXPO_USE_UNISTYLES === "1") {
    plugins.push(["react-native-unistyles/plugin", { root: "app" }]);
  }
  // Reanimated 4 requires the Worklets transform to run last.
  plugins.push("react-native-worklets/plugin");

  return {
    presets: ["babel-preset-expo"],
    plugins,
  };
};
