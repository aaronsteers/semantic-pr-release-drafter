const templateVariablePattern = /\$[A-Z][\dA-Z_]*/g

const getEffectiveTagPrefix = (config) => {
  if (config['tag-prefix']) {
    return config['tag-prefix']
  }

  const tagTemplate = config['tag-template'] || ''
  return tagTemplate.split(templateVariablePattern)[0]
}

module.exports = {
  getEffectiveTagPrefix,
}
