import { setProjectAnnotations } from '@storybook/react-vite'
import { beforeAll } from 'vitest'

import previewAnnotations from './preview'

// Wire the global decorators + parameters into the vitest browser run so
// stories behave the same as they do in the Storybook dev UI.
const project = setProjectAnnotations([previewAnnotations])

beforeAll(project.beforeAll)
