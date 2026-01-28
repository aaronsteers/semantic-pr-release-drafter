const { schema, validateSchema } = require('../lib/schema')
const schemaJson = require('../schema.json')
const { jsonSchema } = require('../bin/generate-schema')

const template = '$CHANGES'

const context = {
  payload: {
    repository: {
      default_branch: 'foobar',
    },
  },
}

const validConfigs = [
  [{ template }],
  [{ template, replacers: [{ search: '123', replace: '' }] }],
  [{ template, replacers: [{ search: '/123/gi', replace: '' }] }],
  [{ template, replacers: [{ search: '/123/gi', replace: '123' }] }],
  [{ template, header: 'I am on top' }],
  [{ template, footer: 'I am on bottm' }],
  [{ template, header: 'I am on top', footer: 'I am on bottm' }],
  [{ template, 'pull-request-limit': 49 }],
  [{ template, 'title-post-processors': [] }],
  [{ template, 'title-post-processors': ['sentence-case'] }],
]

const invalidConfigs = [
  [{ template: true }, 'must be a string'],
  [{ template: 1 }, 'must be a string'],
  [{ template: ['👶'] }, 'must be a string'],
  [{ template: { '👶': 'a' } }, 'must be a string'],
  [{ template: null }, 'must be a string'],
  [{ template: '' }, 'is not allowed to be empty'],
  [{ header: true }, 'must be a string'],
  [{ header: 1 }, 'must be a string'],
  [{ header: ['👶'] }, 'must be a string'],
  [{ header: { '👶': 'a' } }, 'must be a string'],
  [{ header: null }, 'must be a string'],
  [{ footer: true }, 'must be a string'],
  [{ footer: 1 }, 'must be a string'],
  [{ footer: ['👶'] }, 'must be a string'],
  [{ footer: { '👶': 'a' } }, 'must be a string'],
  [{ footer: null }, 'must be a string'],
  [{ 'category-template': ['## $TITLE'] }, 'must be a string'],
  [{ 'category-template': null }, 'must be a string'],
  [{ 'change-template': ['* $TITLE (#$NUMBER) @$AUTHOR'] }, 'must be a string'],
  [{ 'change-template': null }, 'must be a string'],
  [{ 'change-title-escapes': ['<_*'] }, 'must be a string'],
  [{ 'change-title-escapes': null }, 'must be a string'],
  [{ replacers: [{ search: 123 }] }, 'must be a regexp or a string'],
  [{ replacers: [{ search: '123' }] }, 'is required'],
  [
    { replacers: [{ replace: 123 }] },
    'is required and must be a regexp or a string',
  ],
  [{ replacers: [{ search: '123', replace: 123 }] }, 'must be a string'],
  [{ commitish: false }, 'must be a string'],
  [{ 'pull-request-limit': 'forty nine' }, 'must be a number'],
  [{ 'title-post-processors': 'sentence-case' }, 'must be an array'],
  [{ 'title-post-processors': ['invalid-processor'] }, 'must be [sentence-case]'],
]

describe('schema', () => {
  describe('valid', () => {
    for (const [example, expected = example] of validConfigs) {
      test(`${JSON.stringify(example)} is valid`, () => {
        const { error, value } = schema(context).validate(example, {
          abortEarly: false,
        })
        expect(error).toBeUndefined()
        expect(value).toMatchObject(expected)
        if (value.replacers) {
          for (const [index, arrayValue] of value.replacers.entries())
            expect(arrayValue.search).toEqual(expected.replacers[index].search)
        }
      })
    }
  })

  describe('invalid', () => {
    for (const [example, message] of invalidConfigs) {
      it(`${JSON.stringify(example)} is invalid`, () => {
        const { error } = schema(context).validate(example, {
          abortEarly: false,
        })
        expect(error && error.toString()).toMatch(message)
      })
    }
  })

  it('current schema matches the generated JSON Schema, update schema with `yarn generate-schema`', () => {
    expect(jsonSchema).toMatchObject(schemaJson)
  })

  describe('validateSchema', () => {
    it('User-provided categories replace defaults', () => {
      // User-provided categories should replace defaults, not merge with them
      const result = validateSchema(context, {
        template,
        categories: [
          {
            title: '📝 Other Changes',
          },
          {
            title: '📝 Yet Other Changes',
          },
        ],
      })
      // Should only include user-provided categories (not merged with defaults)
      expect(result.categories).toHaveLength(2)
      // User-provided categories should be in the result
      const categoryTitles = result.categories.map((c) => c.title)
      expect(categoryTitles).toContain('📝 Other Changes')
      expect(categoryTitles).toContain('📝 Yet Other Changes')
      // Default categories should NOT be present
      expect(categoryTitles).not.toContain('Features')
      expect(categoryTitles).not.toContain('Bug Fixes')
    })

    it('User-provided categories have defaults applied', () => {
      const result = validateSchema(context, {
        template,
        categories: [
          {
            title: '📝 Other Changes',
          },
        ],
      })
      // Find the user-provided category
      const otherChanges = result.categories.find(
        (c) => c.title === '📝 Other Changes'
      )
      expect(otherChanges).toBeDefined()
      expect(otherChanges['collapse-after']).toBe(0)
      expect(otherChanges['commit-types']).toEqual([])
    })
  })
})
