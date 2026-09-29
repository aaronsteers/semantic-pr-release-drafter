const parse = require('joi-to-json')
const fs = require('node:fs')
const { schema } = require('../lib/schema')
const inputArguments = process.argv.slice(2) || []

const originalSchema = parse(
  schema(),
  'json',
  {},
  { includeSchemaDialect: true }
)

const jsonSchema = {
  title: 'JSON schema for Release Drafter yaml files',
  id: 'https://github.com/release-drafter/release-drafter/blob/master/schema.json',
  ...originalSchema,
}

exports.jsonSchema = jsonSchema

// template is only required after deep merged, should not be required in the JSON schema
// we should also remove the required field in case nothing remains after the filtering to keep draft04 compatibility
const requiredField = jsonSchema.required.filter((item) => item !== 'template')
if (requiredField.length > 0) {
  jsonSchema.required = requiredField
} else {
  delete jsonSchema.required
}

for (const [key, value] of Object.entries(jsonSchema.properties)) {
  if (typeof value.default === 'string' && value.default.includes('*')) {
    jsonSchema.properties[key].default = `'${value.default}'`
  }
}

// joi-to-json can't express "title optional only when `hidden: true`": the Joi
// .when() emits an invalid oneOf of identical alternatives and drops the
// item-level `required`. Emit a plain string for title and encode the
// conditional at the item level instead (draft-07 if/else).
const categoryItems = jsonSchema.properties?.categories?.items
if (categoryItems?.properties?.title) {
  categoryItems.properties.title = { type: 'string' }
  categoryItems.if = {
    properties: { hidden: { const: true } },
    required: ['hidden'],
  }
  categoryItems.else = { required: ['title'] }
}

if (inputArguments[0] === 'print') {
  fs.writeFileSync(
    './schema.json',
    `${JSON.stringify(jsonSchema, undefined, 2)}\n`
  )
}
