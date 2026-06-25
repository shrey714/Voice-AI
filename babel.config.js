module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Reanimated 4 moved its worklet Babel transform into react-native-worklets.
    // This plugin MUST stay last in the list.
    plugins: ['react-native-worklets/plugin'],
  };
};
