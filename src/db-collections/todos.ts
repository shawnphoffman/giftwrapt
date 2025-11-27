import { createCollection, localOnlyCollectionOptions } from '@tanstack/react-db'
import { z } from 'zod'

// Schema matching the Drizzle todos table with creator relation
const TodoSchema = z.object({
	id: z.number(),
	title: z.string(),
	status: z.enum(['incomplete', 'complete', 'in_progress']).default('incomplete'),
	isArchived: z.boolean().default(false),
	creatorId: z.string().nullable().optional(),
	createdAt: z.date().or(z.string()),
	updatedAt: z.date().or(z.string()),
	creator: z
		.object({
			id: z.string(),
			email: z.string(),
			displayName: z.string().nullable().optional(),
			image: z.string().nullable().optional(),
		})
		.nullable()
		.optional(),
})

export type Todo = z.infer<typeof TodoSchema>

// Client-side collection that will sync with server via API
export const todosCollection = createCollection(
	localOnlyCollectionOptions({
		getKey: todo => todo.id,
		schema: TodoSchema,
	})
)
