module.exports = {
  '*.js': (filenames) => `eslint --fix ${filenames.join(' ')}`,
  '*.{md,json,yml,yaml}': (filenames) =>
    `prettier --write ${filenames.join(' ')}`,
  'action.js|lib/**/*.js': () =>
    'esbuild action.js --bundle --platform=node --target=node20 --outfile=dist/index.js',
}
